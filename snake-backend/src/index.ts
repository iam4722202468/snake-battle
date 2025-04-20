import { Game } from './game';

console.log("Starting Snake Online Backend Server...");

const game = new Game();

// Generate unique IDs for connections
let nextSocketId = 0;
const generateSocketId = () => `player-${nextSocketId++}`;

const server = Bun.serve<{ socketId: string }>({
    port: 8080,
    fetch(req, server) {
        const socketId = generateSocketId();
        const success = server.upgrade(req, {
            data: { socketId },
        });
        
        if (success) {
            return undefined;
        }
        
        return new Response("WebSocket upgrade failed.", { status: 400 });
    },
    websocket: {
        open(ws) {
            const socketId = ws.data.socketId;
            console.log(`WebSocket opened: ${socketId}`);
            game.addPlayer(ws, socketId);
        },
        message(ws, message) {
            const socketId = ws.data.socketId;
            
            try {
                const data = JSON.parse(message.toString());
                
                switch (data.type) {
                    case 'position_update':
                        // Handle position update from client
                        if (data.payload && Array.isArray(data.payload.segments) && data.payload.direction) {
                            game.handlePositionUpdate(socketId, {
                                segments: data.payload.segments,
                                direction: data.payload.direction
                            });
                        }
                        break;
                        
                    case 'ping':
                        // Handle ping for latency measurement
                        ws.send(JSON.stringify({ 
                            type: 'pong', 
                            payload: { ts: data.payload?.ts } 
                        }));
                        break;
                        
                    default:
                        break;
                }
            } catch (error) {
                console.error(`Error processing message from ${socketId}:`, error);
            }
        },
        close(ws) {
            const socketId = ws.data.socketId;
            console.log(`WebSocket closed: ${socketId}`);
            game.removePlayer(socketId);
        },
        error(ws, error) {
            const socketId = ws.data.socketId;
            console.error(`WebSocket error for ${socketId}:`, error);
            game.removePlayer(socketId);
        },
    },
});

console.log(`Snake Online server running on ws://localhost:${server.port}`);

process.on('SIGINT', () => {
    console.log("Shutting down server...");
    game.stopBroadcasting();
    server.stop(true);
    process.exit(0);
});
