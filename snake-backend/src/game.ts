import type { ServerWebSocket } from "bun";

interface Position { x: number; y: number; }
type Direction = 'up' | 'down' | 'left' | 'right';

// Server representation of a player's snake
interface ServerSnake {
    id: string;
    segments: Position[];
    direction: Direction; 
    hue: number;
    isRespawning: boolean;
    respawnEndTime: number;
    size: number; // Track the player's size for scoring
    ws: ServerWebSocket<{ socketId: string }>;
}

// Add isRespawning to the player data sent to clients
export interface PlayerStateForClient {
    id: string;
    segments: Position[];
    direction: Direction;
    hue: number;
    size: number;
    isRespawning: boolean; // Added
}

export interface GameStateData {
    players: PlayerStateForClient[]; // Use the new interface
    apple: Position;
    gridSize: number;
}

const GRID_SIZE = 20;
const RESPAWN_DELAY = 3000;
const BROADCAST_INTERVAL = 100;

export class Game {
    private players: Map<string, ServerSnake> = new Map();
    private apple: Position;
    private broadcastIntervalId: Timer | null = null;
    private gridSize: number = GRID_SIZE;

    constructor() {
        this.apple = this.getRandomPosition();
        this.startBroadcasting();
    }

    // Add a new player when they connect
    addPlayer(ws: ServerWebSocket<{ socketId: string }>, socketId: string): void {
        if (this.players.has(socketId)) {
            try { this.players.get(socketId)?.ws.close(1001, "Replaced by new connection"); } catch {}
        }
        
        const startPosition = this.getRandomPosition();
        const hue = Math.floor(Math.random() * 360); // Random color
        
        this.players.set(socketId, {
            id: socketId,
            segments: [startPosition], // Start with just a head
            direction: 'right',
            hue,
            isRespawning: false,
            respawnEndTime: 0,
            size: 1, // Initial size
            ws,
        });

        // Send initial game state to the new player
        this.sendInitialState(socketId);
    }

    removePlayer(socketId: string): void {
        this.players.delete(socketId);
    }

    // Handle position updates from clients
    handlePositionUpdate(socketId: string, data: { segments: Position[], direction: Direction }): void {
        const player = this.players.get(socketId);
        if (!player || player.isRespawning || data.segments.length === 0) return;

        // Update player state based on client data
        player.direction = data.direction;
        player.segments = data.segments; // Trust client's predicted segments for now

        const head = player.segments[0];
        const ateApple = head.x === this.apple.x && head.y === this.apple.y;

        if (ateApple) {
            // Client predicted eating the apple, and server confirms
            player.size++; // Increment server's authoritative size
            this.apple = this.getRandomPosition(); // Generate new apple
            this.broadcastAppleEat(socketId); // Notify clients
        } else {
            // Client did not eat the apple (or predicted incorrectly)
            // Ensure server size matches the actual segment length received
            player.size = player.segments.length;
        }

        // Check for collisions *after* updating position and potentially size
        this.checkCollisions(socketId);

        // Removed separate checkAppleEating call, it's handled above
    }

    // Check if player has hit a wall, itself, or another player
    private checkCollisions(playerId: string): void {
        const player = this.players.get(playerId);
        if (!player || player.isRespawning || player.segments.length === 0) return;
        
        const head = player.segments[0];
        
        // Wall collision
        if (head.x < 0 || head.x >= this.gridSize || head.y < 0 || head.y >= this.gridSize) {
            this.handlePlayerDeath(playerId, "wall");
            return;
        }
        
        // Self-collision (skip the head)
        if (player.segments.slice(1).some(segment => segment.x === head.x && segment.y === head.y)) {
            this.handlePlayerDeath(playerId, "self");
            return;
        }
        
        // Collision with other players
        for (const [otherId, otherSnake] of this.players.entries()) {
            if (otherId === playerId || otherSnake.isRespawning) continue;
            
            if (otherSnake.segments.some(segment => segment.x === head.x && segment.y === head.y)) {
                this.handlePlayerDeath(playerId, "snake", otherId);
                return;
            }
        }
    }
    
    // Handle player death
    private handlePlayerDeath(playerId: string, reason: "wall" | "snake" | "self", collidedWithId?: string): void {
        const player = this.players.get(playerId);
        if (!player || player.isRespawning) return;

        console.log(`Player ${playerId} died. Reason: ${reason}`); // Add logging

        // Mark player as respawning
        player.isRespawning = true;
        player.respawnEndTime = Date.now() + RESPAWN_DELAY;
        player.segments = []; // Clear segments

        // Send death notification to the player
        if (player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(JSON.stringify({
                type: 'death',
                payload: {
                    playerId: playerId, // Added: Explicitly send the ID of the dead player
                    reason,
                    collidedWith: collidedWithId,
                    respawnDelay: RESPAWN_DELAY
                }
            }));
        } else {
             console.log(`Could not send death notification to ${playerId}, WebSocket not open.`); // Add logging
        }

        // Schedule respawn
        setTimeout(() => this.respawnPlayer(playerId), RESPAWN_DELAY);
    }

    // Respawn a player after death
    private respawnPlayer(playerId: string): void {
        const player = this.players.get(playerId);
        // Ensure player exists and is still marked as respawning (might have disconnected)
        if (!player || !player.isRespawning) {
             console.log(`Respawn cancelled for ${playerId} (player not found or no longer respawning).`);
             // If player disconnected, they should already be removed by the close handler
             if (!this.players.has(playerId)) {
                 return;
             }
             // If they somehow got marked as not respawning, ensure state is consistent
             if (player && !player.isRespawning) {
                 player.segments = player.segments.length > 0 ? player.segments : [this.getRandomPosition()]; // Ensure they have segments if alive
                 player.size = player.segments.length;
                 return;
             }
             return;
        }
        console.log(`Respawning player ${playerId}...`); // Add logging

        // Reset player state
        const startPosition = this.getRandomPosition();
        player.isRespawning = false; // Mark as active *before* sending respawn message
        player.respawnEndTime = 0;
        player.segments = [startPosition];
        player.size = 1;
        player.direction = 'right'; // Default direction

        // Notify player about respawn
        if (player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(JSON.stringify({
                type: 'respawn',
                payload: {
                    playerId: playerId, // Added: Explicitly send the ID
                    position: startPosition,
                    direction: player.direction
                }
            }));
        } else {
             console.log(`Could not send respawn notification to ${playerId}, WebSocket not open.`); // Add logging
        }
        // No need to broadcast game state immediately, the regular broadcast will pick it up
    }

    // Broadcast apple eaten event
    private broadcastAppleEat(eatenBy: string): void {
        const message = JSON.stringify({
            type: 'apple_eat',
            payload: {
                playerId: eatenBy,
                newApple: this.apple
            }
        });
        
        this.players.forEach(player => {
            if (player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(message);
            }
        });
    }
    
    // Start broadcasting game state
    private startBroadcasting(): void {
        if (this.broadcastIntervalId) return;
        this.broadcastIntervalId = setInterval(() => this.broadcastGameState(), BROADCAST_INTERVAL);
    }
    
    // Stop broadcasting
    stopBroadcasting(): void {
        if (this.broadcastIntervalId) {
            clearInterval(this.broadcastIntervalId);
            this.broadcastIntervalId = null;
        }
    }
    
    // Broadcast game state to all clients
    private broadcastGameState(): void {
        if (this.players.size === 0) return;
        
        const message = JSON.stringify({
            type: 'game_state',
            payload: this.getGameState()
        });
        
        this.players.forEach(player => {
            if (player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(message);
            }
        });
    }
    
    // Send initial state to a new player
    private sendInitialState(playerId: string): void {
        const player = this.players.get(playerId);
        if (!player || player.ws.readyState !== WebSocket.OPEN) {
            console.log(`Cannot send initial state to ${playerId}, player not found or WS not open.`);
            return;
        }

        console.log(`Sending initial state to ${playerId}...`); // Add logging

        // First, assign ID
        player.ws.send(JSON.stringify({
            type: 'assign_id',
            payload: { id: playerId }
        }));

        // Wait a small amount of time before sending game_state to ensure client processes the ID first
        setTimeout(() => {
            if (player && player.ws.readyState === WebSocket.OPEN) {
                const gameStatePayload = this.getGameState();
                console.log(`Sending initial game_state to ${playerId} after ID assignment`);
                player.ws.send(JSON.stringify({
                    type: 'game_state',
                    payload: gameStatePayload
                }));
            }
        }, 50); // 50ms delay should be enough for most clients to process the ID
    }
    
    // Get current game state
    private getGameState(): GameStateData {
        // Include ALL players, but add the isRespawning flag
        const players = Array.from(this.players.values())
            .map(player => ({
                id: player.id,
                segments: player.segments,
                direction: player.direction,
                hue: player.hue,
                size: player.size,
                isRespawning: player.isRespawning // Include respawn status
            }));

        return {
            players,
            apple: this.apple,
            gridSize: this.gridSize
        };
    }
    
    // Generate a random position for apple or new players
    private getRandomPosition(): Position {
        let position: Position;
        let onSnake: boolean;
        let attempts = 0;
        const maxAttempts = this.gridSize * this.gridSize;
        
        do {
            onSnake = false;
            position = {
                x: Math.floor(Math.random() * this.gridSize),
                y: Math.floor(Math.random() * this.gridSize),
            };
            
            // Check if position overlaps with any snake
            for (const player of this.players.values()) {
                if (player.isRespawning) continue;
                if (player.segments.some(segment => segment.x === position.x && segment.y === position.y)) {
                    onSnake = true;
                    break;
                }
            }
            
            attempts++;
        } while (onSnake && attempts < maxAttempts);
        
        return position;
    }
}
