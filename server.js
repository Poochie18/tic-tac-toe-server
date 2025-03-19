const WebSocket = require('ws');

// Используем переменную окружения PORT от Render или 8080 для локальной разработки
const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port });

const rooms = new Map();

wss.on('connection', (ws, req) => {
    console.log('New client connected');

    const url = req.url;
    if (url.startsWith('/create')) {
        const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
        rooms.set(roomCode, [ws]);
        ws.send(JSON.stringify({ type: 'created', roomCode }));
        console.log(`Room ${roomCode} created`);
    } else if (url.startsWith('/join?room=')) {
        const roomCode = url.split('=')[1];
        if (rooms.has(roomCode)) {
            const clients = rooms.get(roomCode);
            if (clients.length < 2) {
                clients.push(ws);
                clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'start', roomCode }));
                    }
                });
                console.log(`Client joined room ${roomCode}`);
            } else {
                ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
                ws.close();
            }
        } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
            ws.close();
        }
    }

    ws.on('message', (message) => {
        const roomCode = [...rooms.entries()].find(([_, clients]) => clients.includes(ws))?.[0];
        if (roomCode) {
            const clients = rooms.get(roomCode);
            clients.forEach(client => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(message);
                }
            });
        }
    });

    ws.on('close', () => {
        const roomCode = [...rooms.entries()].find(([_, clients]) => clients.includes(ws))?.[0];
        if (roomCode) {
            const clients = rooms.get(roomCode);
            const index = clients.indexOf(ws);
            if (index !== -1) {
                clients.splice(index, 1);
            }
            if (clients.length === 0) {
                rooms.delete(roomCode);
                console.log(`Room ${roomCode} deleted`);
            } else {
                clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'opponent_left' }));
                    }
                });
            }
        }
        console.log('Client disconnected');
    });
});

console.log(`Server running on port ${port}`);