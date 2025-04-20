import { Game } from './game';

console.log("Starting Snake Backend Server...");

const game = new Game();

// Simple unique ID generator
let nextSocketId = 0;
const generateSocketId = () => `player-${nextSocketId++}`;

const server = Bun.serve<{ socketId: string }>({
    port: 8080,
    fetch(req, server) {
        const socketId = generateSocketId();
        // Upgrade the request to a WebSocket connection
        const success = server.upgrade(req, {
            data: { socketId }, // Attach socketId to the WebSocket context
        });
        if (success) {
            // Bun automatically handles the response for successful upgrades.
            return undefined;
        }

        // Handle regular HTTP requests if needed
        return new Response("WebSocket upgrade failed or not a WebSocket request.", { status: 400 });
    },
    websocket: {
        open(ws) {
            const socketId = ws.data.socketId;
            console.log(`WebSocket opened: ${socketId}`);
            game.addPlayer(ws, socketId);

            // Send the assigned ID back to the client
            ws.send(JSON.stringify({ type: 'assignId', payload: { id: socketId } }));

            // Send initial game state
            ws.send(JSON.stringify({ type: 'gameState', payload: game.getState() }));
        },
        message(ws, message) {
            const socketId = ws.data.socketId;
            // console.log(`Received message from ${socketId}: ${message}`);
            try {
                const parsedMessage = JSON.parse(message.toString());

                if (parsedMessage.type === 'move' && parsedMessage.payload?.direction) {
                    const direction = parsedMessage.payload.direction;
                     if (['up', 'down', 'left', 'right'].includes(direction)) {
                        game.handleInput(socketId, direction);
                    } else {
                        console.warn(`Invalid direction received from ${socketId}: ${direction}`);
                    }
                } else if (parsedMessage.type === 'died') { // Added handler
                    game.handlePlayerDied(socketId);
                } else if (parsedMessage.type === 'ping') {
                    // Respond to ping with pong
                    ws.send(JSON.stringify({ type: 'pong' }));
                } else {
                     console.warn(`Unknown message type or format from ${socketId}: ${message}`);
                }
                // Add handlers for other message types if needed

            } catch (error) {
                console.error(`Failed to parse message from ${socketId}: ${message}`, error);
            }
        },
        close(ws, code, reason) {
            const socketId = ws.data.socketId;
            console.log(`WebSocket closed: ${socketId}`, code, reason);
            game.removePlayer(socketId);
        },
        error(ws, error) {
            const socketId = ws.data.socketId;
            console.error(`WebSocket error for ${socketId}:`, error);
            // Attempt to remove player on error as well, connection might be lost
            game.removePlayer(socketId);
        },
    },
});

console.log(`Bun WebSocket server listening on ws://localhost:${server.port}`);
