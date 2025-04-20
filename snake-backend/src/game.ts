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

export interface GameStateData {
    players: {
        id: string;
        segments: Position[];
        direction: Direction;
        hue: number;
        size: number;
    }[];
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
        if (!player || player.isRespawning) return;
        
        // Simply accept the client's position data
        player.segments = data.segments;
        player.direction = data.direction;
        player.size = data.segments.length;
        
        // Check for collisions
        this.checkCollisions(socketId);
        
        // Check for apple eating
        this.checkAppleEating(socketId);
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
    
    // Check if player ate an apple
    private checkAppleEating(playerId: string): void {
        const player = this.players.get(playerId);
        if (!player || player.isRespawning || player.segments.length === 0) return;
        
        const head = player.segments[0];
        
        // Check if head position matches apple position
        if (head.x === this.apple.x && head.y === this.apple.y) {
            // Generate new apple
            this.apple = this.getRandomPosition();
            
            // Notify all clients about the apple being eaten
            this.broadcastAppleEat(playerId);
        }
    }
    
    // Handle player death
    private handlePlayerDeath(playerId: string, reason: "wall" | "snake" | "self", collidedWithId?: string): void {
        const player = this.players.get(playerId);
        if (!player || player.isRespawning) return;
        
        // Mark player as respawning
        player.isRespawning = true;
        player.respawnEndTime = Date.now() + RESPAWN_DELAY;
        player.segments = []; // Clear segments
        
        // Send death notification to the player
        if (player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(JSON.stringify({
                type: 'death',
                payload: {
                    reason,
                    collidedWith: collidedWithId,
                    respawnDelay: RESPAWN_DELAY
                }
            }));
        }
        
        // Schedule respawn
        setTimeout(() => this.respawnPlayer(playerId), RESPAWN_DELAY);
    }
    
    // Respawn a player after death
    private respawnPlayer(playerId: string): void {
        const player = this.players.get(playerId);
        if (!player || !player.isRespawning) return;
        
        // Reset player state
        const startPosition = this.getRandomPosition();
        player.isRespawning = false;
        player.respawnEndTime = 0;
        player.segments = [startPosition];
        player.size = 1;
        player.direction = 'right'; // Default direction
        
        // Notify player about respawn
        if (player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(JSON.stringify({
                type: 'respawn',
                payload: {
                    position: startPosition,
                    direction: player.direction
                }
            }));
        }
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
        if (!player || player.ws.readyState !== WebSocket.OPEN) return;
        
        // First, assign ID
        player.ws.send(JSON.stringify({
            type: 'assign_id',
            payload: { id: playerId }
        }));
        
        // Then send game state
        player.ws.send(JSON.stringify({
            type: 'game_state',
            payload: this.getGameState()
        }));
    }
    
    // Get current game state
    private getGameState(): GameStateData {
        const players = Array.from(this.players.values())
            .filter(player => !player.isRespawning) // Don't include respawning players
            .map(player => ({
                id: player.id,
                segments: player.segments,
                direction: player.direction,
                hue: player.hue,
                size: player.size
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
