const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.render('index', { error: req.query.error || null });
});

app.post('/create-room', (req, res) => {
    const { username } = req.body;
    if (!username || !username.trim()) {
        return res.redirect('/?error=Username is required');
    }
    const roomId = Math.random().toString(36).substring(2, 10);
    res.redirect(`/room/${roomId}?username=${encodeURIComponent(username.trim())}`);
});

app.post('/join-room', (req, res) => {
    const { username, roomId } = req.body;
    if (!username || !username.trim()) {
        return res.redirect('/?error=Username is required');
    }
    if (!roomId || !roomId.trim()) {
        return res.redirect('/?error=Room ID is required');
    }
    res.redirect(`/room/${encodeURIComponent(roomId.trim())}?username=${encodeURIComponent(username.trim())}`);
});

app.get('/room/:roomId', (req, res) => {
    const { roomId } = req.params;
    const { username } = req.query;
    if (!username || !username.trim()) {
        return res.redirect('/?error=Username is required');
    }
    res.render('room', { roomId, username: username.trim() });
});

io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on('join-room', ({ roomId, username }) => {
        socket.username = username;
        socket.roomId = roomId;

        const room = io.sockets.adapter.rooms.get(roomId);
        const roomSize = room ? room.size : 0;

        if (roomSize >= 2) {
            socket.emit('room-full', roomId);
            return;
        }

        socket.join(roomId);
        console.log(`${username} (${socket.id}) joined room ${roomId}`);

        const peers = [];
        const roomSockets = io.sockets.adapter.rooms.get(roomId);
        if (roomSockets) {
            for (const peerId of roomSockets) {
                if (peerId !== socket.id) {
                    const peerSocket = io.sockets.sockets.get(peerId);
                    peers.push({ id: peerId, username: peerSocket?.username || 'Unknown' });
                }
            }
        }

        socket.emit('joined', { roomId, peers, username });

        socket.to(roomId).emit('peer-joined', { id: socket.id, username });
    });

    socket.on('offer', ({ target, sdp }) => {
        io.to(target).emit('offer', { sender: socket.id, sdp, username: socket.username });
    });

    socket.on('answer', ({ target, sdp }) => {
        io.to(target).emit('answer', { sender: socket.id, sdp });
    });

    socket.on('ice-candidate', ({ target, candidate }) => {
        io.to(target).emit('ice-candidate', { sender: socket.id, candidate });
    });

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        if (socket.roomId) {
            socket.to(socket.roomId).emit('peer-left', { id: socket.id, username: socket.username });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Voice chat server running on http://localhost:${PORT}`);
});
