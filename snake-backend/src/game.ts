import type { ServerWebSocket } from "bun";

// --- Interfaces ---
interface Position {
    x: number;
    y: number;
}

interface Snake {
    id: string;
    segments: Position[];
    direction: 'up' | 'down' | 'left' | 'right'; // Now represents the *requested* direction
}

interface Player {
    ws: ServerWebSocket<{ socketId: string }>;
    snake: Snake;
    isRespawning: boolean; // Added
    respawnTimer: number;  // Added: Timestamp when respawn is complete
    lastTickDirection: 'up' | 'down' | 'left' | 'right'; // Added: Direction moved in the previous tick
    hue: number; // Added: Hue value (0-360)
}

export interface GameStateSnakeData { // Renamed for clarity
    id: string;
    segments: Position[];
    hue: number; // Added
    isRespawning: boolean; // Added
    respawnEndTime: number | null; // Added: Timestamp when respawn finishes, or null
}

export interface GameState {
    snakes: GameStateSnakeData[]; // Use the new interface name
    apple: Position;
    gridSize: number;
}

// --- Constants ---
const GRID_SIZE = 20;
const TICK_RATE = 150; // Reverted tick rate (milliseconds)
const RESPAWN_DELAY = 3000; // Milliseconds (3 seconds)

// --- Game Class ---
export class Game {
    private players: Map<string, Player> = new Map();
    private apple: Position;
    private intervalId: Timer | null = null;
    private gridSize: number = GRID_SIZE;

    constructor() {
        this.apple = this.getRandomPosition();
    }

    // --- Player Management ---
    addPlayer(ws: ServerWebSocket<{ socketId: string }>, socketId: string): void {
        if (this.players.has(socketId)) {
            console.warn(`Player ${socketId} already exists.`);
            return;
        }

        const startPosition = this.getRandomPosition();
        const initialDirection = 'right'; // Or random
        const hue = this.assignHue(); // Assign a hue value

        const newSnake: Snake = {
            id: socketId,
            segments: [startPosition],
            direction: initialDirection, // Requested direction
        };

        const newPlayer: Player = {
            ws,
            snake: newSnake,
            isRespawning: false, // Initialize respawn state
            respawnTimer: 0,
            lastTickDirection: initialDirection, // Initialize last tick direction
            hue: hue, // Store the assigned hue
        };
        this.players.set(socketId, newPlayer);
        console.log(`Player ${socketId} added at ${startPosition.x},${startPosition.y} with hue ${hue}. Total players: ${this.players.size}`);

        // Start game loop if this is the first player
        if (this.players.size === 1 && !this.intervalId) {
            this.startGameLoop();
        }
    }

    removePlayer(socketId: string): void {
        const player = this.players.get(socketId);
        if (player) {
            this.players.delete(socketId);
            console.log(`Player ${socketId} removed. Total players: ${this.players.size}`);
        }

        // Stop game loop if no players are left
        if (this.players.size === 0 && this.intervalId) {
            this.stopGameLoop();
        }
    }

    // --- Hue Management ---
    private assignHue(): number {
        // Simple strategy: assign based on number of players, wrap around 360 degrees
        // More robust: track used hues, find gaps, or use a wider range/saturation/lightness variation
        const numPlayers = this.players.size;
        const baseHue = 120; // Start with green-ish
        const hueStep = 60; // Step around the color wheel
        return (baseHue + numPlayers * hueStep) % 360;
    }

    // --- Input Handling ---
    handleInput(socketId: string, direction: 'up' | 'down' | 'left' | 'right'): void {
        const player = this.players.get(socketId);
        if (!player || player.isRespawning) return; // Ignore input if respawning

        // Store the requested direction. Validation happens in the update loop.
        player.snake.direction = direction;
        // console.log(`[${socketId}] Requested direction: ${direction}`); // Optional log
    }

    // --- Game Loop ---
    private startGameLoop(): void {
        if (this.intervalId) return; // Already running
        console.log("Starting game loop...");
        this.intervalId = setInterval(() => {
            this.update();
            this.broadcastGameState();
        }, TICK_RATE);
    }

    private stopGameLoop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log("Game loop stopped.");
        }
    }

    // --- Game Update Logic ---
    private update(): void {
        if (this.players.size === 0) return;

        const playersToReset: string[] = [];
        const now = Date.now(); // Get current time once per tick

        // --- Handle Respawns ---
        this.players.forEach((player, playerId) => {
            if (player.isRespawning) { // Check if player is in respawn state
                // console.log(`[${playerId}] In respawn state. Timer ends at: ${player.respawnTimer}, Now: ${now}`); // Verbose log
                if (now >= player.respawnTimer) {
                    console.log(`[${playerId}] Respawn timer finished. Respawning now.`); // Log respawn event
                    player.isRespawning = false;
                    player.snake.segments = [this.getRandomPosition()]; // Assign new position
                    player.snake.direction = ['up', 'down', 'left', 'right'][Math.floor(Math.random() * 4)] as 'up' | 'down' | 'left' | 'right'; // Random initial direction
                }
            }
        });

        // --- Handle Movement & Collisions ---
        this.players.forEach((player, playerId) => {
            // Skip update if player is currently respawning or marked for reset this tick
            if (player.isRespawning || playersToReset.includes(playerId)) return;

            const snake = player.snake;
            // Ensure snake has segments before trying to move (could be empty if reset in the same tick)
            if (snake.segments.length === 0) return;

            const head = { ...snake.segments[0] };

            // --- Determine Valid Move Direction for this Tick ---
            let directionToMove = snake.direction; // Start with requested direction
            const isOpposite = (
                (directionToMove === 'up' && player.lastTickDirection === 'down') ||
                (directionToMove === 'down' && player.lastTickDirection === 'up') ||
                (directionToMove === 'left' && player.lastTickDirection === 'right') ||
                (directionToMove === 'right' && player.lastTickDirection === 'left')
            );

            if (isOpposite) {
                // Invalid move: requested direction is opposite of the last actual move.
                // Continue moving in the last valid direction.
                directionToMove = player.lastTickDirection;
                // console.log(`[${playerId}] Ignored opposite direction request (${snake.direction}). Continuing ${directionToMove}.`); // Optional log
                // Update the snake's requested direction to match the actual move for consistency
                snake.direction = directionToMove;
            }

            // --- Move Head ---
            switch (directionToMove) {
                case 'up': head.y -= 1; break;
                case 'down': head.y += 1; break;
                case 'left': head.x -= 1; break;
                case 'right': head.x += 1; break;
            }

            // --- Update Last Tick Direction ---
            // Store the direction we actually moved in this tick
            player.lastTickDirection = directionToMove;

            // --- Collision Detection ---
            // 1. Wall collision
            if (head.x < 0 || head.x >= this.gridSize || head.y < 0 || head.y >= this.gridSize) {
                console.log(`Player ${playerId} hit a wall. Resetting.`);
                playersToReset.push(playerId);
                return;
            }

            // 2. Self collision
            if (snake.segments.slice(1).some(segment => segment.x === head.x && segment.y === head.y)) {
                console.log(`Player ${playerId} collided with itself. Resetting.`);
                playersToReset.push(playerId);
                return;
            }

            // 3. Other snake collision
            let hitOtherSnake = false;
            this.players.forEach((otherPlayer, otherPlayerId) => {
                if (playerId === otherPlayerId || otherPlayer.isRespawning || otherPlayer.snake.segments.length === 0) return; // Skip self, respawning, or empty snakes
                if (otherPlayer.snake.segments.some(segment => segment.x === head.x && segment.y === head.y)) {
                    console.log(`Player ${playerId} collided with Player ${otherPlayerId}. Resetting ${playerId}.`);
                    hitOtherSnake = true;
                    playersToReset.push(playerId);
                }
            });
            if (hitOtherSnake) return;

            // --- Apple Consumption ---
            let ateApple = false;
            if (head.x === this.apple.x && head.y === this.apple.y) {
                ateApple = true;
                this.apple = this.getRandomPosition();
                console.log(`Player ${playerId} ate the apple.`);
            }

            // --- Update Snake Segments ---
            snake.segments.unshift(head);
            if (!ateApple) {
                snake.segments.pop();
            }
        });

        // --- Reset players who collided ---
        playersToReset.forEach(playerId => {
            this.resetSnake(playerId);
        });

        // (Winner logic might need adjustment based on game rules with respawn)
    }

    // --- Respawn Logic ---
    private resetSnake(playerId: string): void {
        const player = this.players.get(playerId);
        if (!player) return;

        console.log(`Initiating respawn for player ${playerId}`);
        player.isRespawning = true;
        player.respawnTimer = Date.now() + RESPAWN_DELAY;
        player.snake.segments = []; // Clear segments visually during respawn

        // Reset lastTickDirection on respawn (can be set when respawn finishes)
        // player.lastTickDirection = 'right'; // Or set when respawn completes
    }

    // --- State & Broadcasting ---
    private broadcastGameState(): void {
        const state = this.getState();
        const message = JSON.stringify({ type: 'gameState', payload: state });
        this.players.forEach(player => {
            if (player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(message);
            }
        });
    }

    sendToPlayer(playerId: string, message: any): void {
        const player = this.players.get(playerId);
        if (player && player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(JSON.stringify(message));
        }
    }

    getState(): GameState {
        const snakesData = Array.from(this.players.values()).map(player => ({
            id: player.snake.id,
            segments: player.snake.segments,
            hue: player.hue, // Send hue instead of color
            isRespawning: player.isRespawning,
            // Send the end time only if currently respawning
            respawnEndTime: player.isRespawning ? player.respawnTimer : null,
        }));
        return {
            snakes: snakesData,
            apple: this.apple,
            gridSize: this.gridSize,
        };
    }

    // --- Utility ---
    private getRandomPosition(): Position {
        // Ensure apple doesn't spawn on a snake
        let position: Position;
        let onSnake: boolean;
        do {
            onSnake = false;
            position = {
                x: Math.floor(Math.random() * this.gridSize),
                y: Math.floor(Math.random() * this.gridSize),
            };
            for (const player of this.players.values()) {
                // Check only non-respawning snakes
                if (!player.isRespawning && player.snake.segments.some(seg => seg.x === position.x && seg.y === position.y)) {
                    onSnake = true;
                    break;
                }
            }
        } while (onSnake);
        return position;
    }

    // --- Server-Side Collision Check Helper ---
    private checkServerCollision(playerId: string): boolean {
        const player = this.players.get(playerId);
        if (!player || player.isRespawning || player.snake.segments.length === 0) {
            return false; // Cannot collide if not active
        }

        const snake = player.snake;
        const head = snake.segments[0];

        // 1. Wall collision
        if (head.x < 0 || head.x >= this.gridSize || head.y < 0 || head.y >= this.gridSize) {
            console.log(`Server check: Player ${playerId} hit wall.`);
            return true;
        }

        // 2. Self collision
        if (snake.segments.slice(1).some(segment => segment.x === head.x && segment.y === head.y)) {
             console.log(`Server check: Player ${playerId} self-collided.`);
            return true;
        }

        // 3. Other snake collision
        let hitOther = false;
        this.players.forEach((otherPlayer, otherPlayerId) => {
            if (playerId === otherPlayerId || otherPlayer.isRespawning || otherPlayer.snake.segments.length === 0) return;
            if (otherPlayer.snake.segments.some(segment => segment.x === head.x && segment.y === head.y)) {
                 console.log(`Server check: Player ${playerId} hit Player ${otherPlayerId}.`);
                hitOther = true;
            }
        });
        if (hitOther) return true;

        return false; // No collision detected by server
    }

    // --- Handle Died Message ---
    handlePlayerDied(socketId: string): void {
        console.log(`Received 'died' message from ${socketId}. Verifying collision server-side.`);
        // Verify based on the *current* server state.
        // Note: There might be a slight delay, the client might be slightly ahead.
        // This check prevents malicious clients from triggering respawn without cause.
        if (this.checkServerCollision(socketId)) {
            console.log(`Server confirmed collision for ${socketId}. Resetting.`);
            this.resetSnake(socketId);
            // No need to broadcast state immediately, the regular loop will do it.
        } else {
            console.log(`Server did not confirm collision for ${socketId}. Client might be ahead or mistaken.`);
            // Client will eventually be corrected by authoritative game state if they didn't actually die.
        }
    }
}
