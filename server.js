const http = require('http');
const WebSocket = require('ws');

// Устанавливаем порт из переменной окружения (Render задаёт PORT автоматически)
const port = process.env.PORT || 8080;
const host = '0.0.0.0'; // Явно указываем хост для Render

// Создаём HTTP-сервер
const server = http.createServer((req, res) => {
    console.log(`HTTP request received: ${req.method} ${req.url}`);
    res.writeHead(200, { 
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST',
        'Access-Control-Allow-Headers': 'Upgrade, Connection'
    });
    res.end('WebSocket server is running\n');
});

// Подключаем WebSocket к HTTP-серверу
const wss = new WebSocket.Server({ server });

// Хранилище комнат
const rooms = new Map();

// Обработка ошибок HTTP-сервера
server.on('error', (error) => {
    console.error('HTTP server error:', error);
});

// Обработка ошибок WebSocket-сервера
wss.on('error', (error) => {
    console.error('WebSocket server error:', error);
});

// Функция для самопинга
function keepAlive() {
    setInterval(() => {
        const options = {
            hostname: 'tic-tac-toe-server-new.onrender.com', // Ваш домен Render
            port: 443, // Используем 443 для HTTPS
            path: '/',
            method: 'GET',
            headers: {
                'Host': 'tic-tac-toe-server-new.onrender.com'
            }
        };

        const req = https.request(options, (res) => { // Используем https вместо http
            console.log(`Keep-alive ping: ${res.statusCode}`);
        });

        req.on('error', (e) => {
            console.error(`Keep-alive error: ${e.message}`);
        });

        req.end();
    }, 10 * 60 * 1000); // Каждые 5 минут
}

// Подключаем модуль https (добавьте в начало файла, если ещё не импортирован)
const https = require('https');

wss.on('connection', (ws, req) => {
    console.log(`New client connected: ${req.url}`);
    // Ваш существующий код обработки WebSocket-соединений...
    try {
        const url = req.url;
        if (url.startsWith('/create')) {
            const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
            rooms.set(roomCode, [ws]);
            ws.send(JSON.stringify({ type: 'created', roomCode }));
            console.log(`Room ${roomCode} created with 1 client`);
        } else if (url.startsWith('/join?room=')) {
            const roomCode = url.split('=')[1];
            if (!roomCode) {
                throw new Error('Room code not provided in URL');
            }

            if (rooms.has(roomCode)) {
                const clients = rooms.get(roomCode);
                if (clients.length < 2) {
                    clients.push(ws);
                    console.log(`Client joined room ${roomCode}. Total clients: ${clients.length}`);
                    clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({ type: 'start', roomCode }));
                        }
                    });
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
                    ws.close();
                    console.log(`Room ${roomCode} is full, connection rejected`);
                }
            } else {
                ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
                ws.close();
                console.log(`Room ${roomCode} not found, connection rejected`);
            }
        } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid endpoint' }));
            ws.close();
            console.log(`Invalid endpoint accessed: ${url}`);
        }

        ws.on('message', (message) => {
            try {
                const roomCode = [...rooms.entries()].find(([_, clients]) => clients.includes(ws))?.[0];
                if (roomCode) {
                    const clients = rooms.get(roomCode);
                    console.log(`Broadcasting message in room ${roomCode}: ${message}`);
                    clients.forEach(client => {
                        if (client !== ws && client.readyState === WebSocket.OPEN) {
                            client.send(message);
                        }
                    });
                } else {
                    console.log(`Client not in any room, message ignored: ${message}`);
                }
            } catch (error) {
                console.error('Error processing message:', error);
            }
        });

        ws.on('close', () => {
            try {
                const roomCode = [...rooms.entries()].find(([_, clients]) => clients.includes(ws))?.[0];
                if (roomCode) {
                    const clients = rooms.get(roomCode);
                    const index = clients.indexOf(ws);
                    if (index !== -1) {
                        clients.splice(index, 1);
                    }
                    if (clients.length === 0) {
                        rooms.delete(roomCode);
                        console.log(`Room ${roomCode} deleted (no clients left)`);
                    } else {
                        clients.forEach(client => {
                            if (client.readyState === WebSocket.OPEN) {
                                client.send(JSON.stringify({ type: 'opponent_left' }));
                            }
                        });
                        console.log(`Client disconnected from room ${roomCode}. Clients remaining: ${clients.length}`);
                    }
                }
            } catch (error) {
                console.error('Error on client disconnect:', error);
            }
            console.log('Client disconnected');
        });

        ws.on('error', (error) => {
            console.error('WebSocket client error:', error);
        });
    } catch (error) {
        console.error('Error handling connection:', error);
        ws.send(JSON.stringify({ type: 'error', message: 'Internal server error' }));
        ws.close();
    }
});

// Запускаем сервер и keep-alive
server.listen(port, host, () => {
    console.log(`Server running on ${host}:${port}`);
    keepAlive(); // Запускаем пинг
});

// Обработка завершения работы сервера
process.on('SIGTERM', () => {
    console.log('Received SIGTERM. Shutting down server...');
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
});