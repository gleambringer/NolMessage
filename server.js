const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3000;
const MAX_MESSAGES = 25;
const MAX_USERS_PER_CHAT = 15;
const ADMIN_USERNAMES = ['flownol', 'pagekn'];

// --- STATE (In-Memory for this version) ---
// Structure: { chatId: [ { user, text, style, timestamp } ] }
let chatRooms = {};
// Structure: { chatId: Set(userIds) }
let activeUsers = {};

// Serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('join-chat', ({ username, chatId }) => {
        // 1. Sanitize input
        const cleanUser = username.toLowerCase().substring(0, 20);
        const cleanChat = chatId.toLowerCase();

        // 2. Check 15-person limit
        if (!activeUsers[cleanChat]) activeUsers[cleanChat] = new Set();
        
        if (activeUsers[cleanChat].size >= MAX_USERS_PER_CHAT) {
            socket.emit('error-message', 'Chat is full (Max 15 people).');
            return;
        }

        // 3. Join logic
        socket.join(cleanChat);
        activeUsers[cleanChat].add(socket.id);
        
        // 4. Send existing message history (the 25 messages)
        const history = chatRooms[cleanChat] || [];
        socket.emit('load-history', history);
        
        console.log(`${cleanUser} joined ${cleanChat}`);
    });

    socket.on('send-message', ({ username, text, chatId }) => {
        const cleanUser = username.toLowerCase().substring(0, 20);
        const cleanText = text.substring(0, 500); // Reasonable limit for chat
        const cleanChat = chatId.toLowerCase();

        // 5. Admin Style Logic (Server-side decision)
        let messageStyle = 'standard';
        if (ADMIN_USERNAMES.includes(cleanUser)) {
            messageStyle = 'admin-gradient';
        }

        const msgObject = {
            user: cleanUser,
            text: cleanText,
            style: messageStyle,
            timestamp: new Date().toLocaleTimeString()
        };

        // 6. KV Storage Logic (Keep only last 25)
        if (!chatRooms[cleanChat]) chatRooms[cleanChat] = [];
        chatRooms[cleanChat].push(msgObject);

        if (chatRooms[cleanChat].length > MAX_MESSAGES) {
            chatRooms[cleanChat].shift(); // Remove oldest
        }

        // 7. Broadcast to everyone in that specific chat
        io.to(cleanChat).emit('new-message', msgObject);
    });

    socket.on('disconnecting', () => {
        // Remove user from all tracking sets on disconnect
        for (const room of socket.rooms) {
            if (activeUsers[room]) {
                activeUsers[room].delete(socket.id);
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`NolMessage server running on port ${PORT}`);
});
