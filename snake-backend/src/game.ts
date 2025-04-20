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
    isBoosting: boolean; // Add boosting state
    selectedMapId?: string; // Add map selection
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
    isBoosting: boolean; // Add boosting state
    selectedMapId?: string; // Add map selection
}

// Add a new interface for game state data
export interface GameStateData {
    players: PlayerStateForClient[];
    apple: Position;
    gridSize: number;
    gameMode: 'selection' | 'playing'; // Add game mode
    currentMap: string; // Add current map
}

// Add map data and functions

const MAPS = {
  classic: {},
  tunnels: {
    tunnels: [
      { startX: 5, startY: 5, endX: 8, endY: 5, direction: 'horizontal' as const },
      { startX: 12, startY: 12, endX: 15, endY: 12, direction: 'horizontal' as const },
      { startX: 5, startY: 12, endX: 5, endY: 15, direction: 'vertical' as const },
      { startX: 15, startY: 5, endX: 15, endY: 8, direction: 'vertical' as const },
    ]
  },
  teleporters: {
    teleporters: [
      { id: 1, position: { x: 5, y: 5 }, color: '#FF0000', destination: 2 },
      { id: 2, position: { x: 15, y: 15 }, color: '#FF0000', destination: 1 },
      { id: 3, position: { x: 5, y: 15 }, color: '#0000FF', destination: 4 },
      { id: 4, position: { x: 15, y: 5 }, color: '#0000FF', destination: 3 },
      { id: 5, position: { x: 10, y: 3 }, color: '#00FF00', destination: 6 },
      { id: 6, position: { x: 10, y: 17 }, color: '#00FF00', destination: 5 },
    ]
  }
};

const GRID_SIZE = 20;
const RESPAWN_DELAY = 3000;
const BROADCAST_INTERVAL = 100;

export class Game {
    private players: Map<string, ServerSnake> = new Map();
    private apple: Position;
    private broadcastIntervalId: Timer | null = null;
    private gridSize: number = GRID_SIZE;
    private gameMode: 'selection' | 'playing' = 'selection'; // Default to selection mode
    private currentMap: string = 'classic'; // Track current map

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
            isBoosting: false, // Initialize as not boosting
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
        if (this.gameMode !== 'playing') return;

        const player = this.players.get(socketId);
        if (!player || player.isRespawning || data.segments.length === 0) return;

        player.direction = data.direction;
        
        // Use client segments as the base for this tick's calculation
        let currentSegments = [...data.segments]; 
        // const head = currentSegments[0]; // head variable not used after removing teleport logic

        // Update player segments with the client's predicted positions
        player.segments = currentSegments; 
        const finalHead = player.segments[0]; // Use the final head position

        // --- Apple Eating Logic ---
        const ateApple = finalHead.x === this.apple.x && finalHead.y === this.apple.y;
        if (ateApple) {
            player.size++; 
            this.apple = this.getRandomPosition(); 
            this.broadcastAppleEat(socketId); 
        } else {
            // Ensure server size matches segment length if no apple eaten
            // This handles cases where client prediction might temporarily mismatch length
            player.size = player.segments.length; 
        }

        // --- Collision Check ---
        this.checkCollisions(socketId); // Uses the final player.segments
    }

    // Check if player has hit a wall, itself, or another player
    private checkCollisions(playerId: string): void {
        // Don't check collisions in selection mode
        if (this.gameMode !== 'playing') return;

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
            return;
        }

        player.ws.send(JSON.stringify({
            type: 'assign_id',
            payload: { id: playerId }
        }));

        setTimeout(() => {
            if (player && player.ws.readyState === WebSocket.OPEN) {
                const gameStatePayload = this.getGameState();
                player.ws.send(JSON.stringify({
                    type: 'game_state',
                    payload: gameStatePayload
                }));
            }
        }, 50);
    }
    
    // Get current game state
    private getGameState(): GameStateData {
        const players = Array.from(this.players.values())
            .map(player => ({
                id: player.id,
                segments: player.segments,
                direction: player.direction,
                hue: player.hue,
                size: player.size,
                isRespawning: player.isRespawning,
                isBoosting: player.isBoosting,
                selectedMapId: player.selectedMapId
            }));

        return {
            players,
            apple: this.apple,
            gridSize: this.gridSize,
            gameMode: this.gameMode, // Include game mode in state
            currentMap: this.currentMap // Add current map to state
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

    // Add a method to handle boost updates
    handleBoostUpdate(socketId: string, isBoosting: boolean): void {
        const player = this.players.get(socketId);
        if (!player || player.isRespawning) return;
        
        player.isBoosting = isBoosting;
        // No need to broadcast immediately, regular game_state will include it
    }

    // Add a method to handle map selection updates
    handleMapSelection(socketId: string, mapId: string | null): void {
        const player = this.players.get(socketId);
        if (!player) return;
        
        // Update player's selected map
        if (mapId) {
            player.selectedMapId = mapId;
        } else {
            delete player.selectedMapId; // If null, remove the selection
        }
        
        console.log(`Player ${socketId} selected map: ${mapId || 'none'}`);
    }

    // Add method to handle game mode changes
    handleGameModeChange(socketId: string, mode: 'selection' | 'playing'): void {
        const player = this.players.get(socketId);
        if (!player) return;

        if (mode === 'playing' && this.gameMode === 'selection') {
            // Set the current map when switching from selection to playing
            this.setCurrentMap();
        }

        // Update the game mode for everyone
        this.gameMode = mode;
        
        console.log(`Player ${socketId} changed game mode to: ${mode}`);
        
        // If switching to playing mode, reset any players who were previously respawning
        if (mode === 'playing') {
            this.players.forEach((player, id) => {
                if (player.isRespawning) {
                    // Give them a new position and reset respawning state
                    const startPosition = this.getRandomPosition();
                    player.isRespawning = false;
                    player.respawnEndTime = 0;
                    player.segments = [startPosition];
                    player.size = 1;
                    
                    // Notify about respawn if connected
                    if (player.ws.readyState === WebSocket.OPEN) {
                        player.ws.send(JSON.stringify({
                            type: 'respawn',
                            payload: {
                                playerId: id,
                                position: startPosition,
                                direction: 'right'
                            }
                        }));
                    }
                }
            });
        }
        
        // Broadcast the mode change to all players immediately
        this.broadcastGameMode();
    }
    
    // Broadcast game mode to all players
    private broadcastGameMode(): void {
        const message = JSON.stringify({
            type: 'game_mode_update',
            payload: { mode: this.gameMode }
        });
        
        this.players.forEach(player => {
            if (player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(message);
            }
        });
    }

    // Method to set the current map when game starts
    private setCurrentMap(): void {
        // Find the most selected map among players
        const mapVotes = new Map<string, number>();
        
        this.players.forEach(player => {
            if (player.selectedMapId) {
                const count = mapVotes.get(player.selectedMapId) || 0;
                mapVotes.set(player.selectedMapId, count + 1);
            }
        });
        
        let mostVotedMap = 'classic';
        let highestVotes = 0;
        
        mapVotes.forEach((votes, mapId) => {
            if (votes > highestVotes) {
                highestVotes = votes;
                mostVotedMap = mapId;
            }
        });
        
        this.currentMap = mostVotedMap;
        console.log(`Setting map to: ${this.currentMap}`);
    }
}
