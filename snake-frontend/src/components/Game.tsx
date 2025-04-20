'use client';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import useClientGameLoop, { Direction } from '../hooks/useClientGameLoop';
import Snake from './Snake';
import Apple from './Apple';
import { useWebSocket } from '../hooks/useWebSocket'; // Re-import WebSocket hook

interface Player { // Define Player interface for other players
    id: string;
    segments: { x: number; y: number }[];
    direction: Direction;
    hue: number;
    size: number;
}

interface Position { x: number; y: number; }

const DEFAULT_GRID_SIZE = 20;
const CLIENT_TICK_RATE = 200;
const RESPAWN_COUNTDOWN_DURATION = 3; // Use the constant from hook if exported, or define here

const Game: React.FC = () => {
    // WebSocket connection
    const { lastMessage, sendMessage, readyState, latency, connected, reconnect } = useWebSocket();

    // Game state
    const [gridSize, setGridSize] = useState<number>(DEFAULT_GRID_SIZE); // Can be updated by server
    const [apple, setApple] = useState<Position>({ x: 10, y: 10 }); // Updated by server
    const [score, setScore] = useState<number>(0); // Based on own snake length
    const [respawnCountdown, setRespawnCountdown] = useState<number | null>(null);
    const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Multiplayer state
    const [clientId, setClientId] = useState<string | null>(null);
    const [otherPlayers, setOtherPlayers] = useState<Player[]>([]);
    const [isRespawning, setIsRespawning] = useState<boolean>(false); // Controlled by server messages
    const [initialPosition, setInitialPosition] = useState<Position | null>(null); // For respawn

    // Callback to send position updates to the server
    const handlePositionUpdate = useCallback((segments: Position[], direction: Direction) => {
        if (!connected || isRespawning) return;
        sendMessage({
            type: 'position_update',
            payload: { segments, direction }
        });
    }, [connected, isRespawning, sendMessage]);

    // Game loop hook - Pass multiplayer props
    const {
        segments,
        direction,
        displayDirection, // Use this for UI display
        addInput,
        reset: resetGame, // Keep reset if needed, but server controls state
        setSegments, // <-- Add this to allow external segment updates
        // Removed appleEaten, gameOver
    } = useClientGameLoop({
        gridSize,
        apple,
        tickRate: CLIENT_TICK_RATE,
        clientId, // Pass clientId
        isRespawning, // Pass isRespawning
        initialPosition, // Pass initialPosition
        onPositionUpdate: handlePositionUpdate, // Pass callback
    });

    // Track if we've synced local state to server state after connect
    const hasSyncedRef = useRef(false);

    // Process server messages
    useEffect(() => {
        if (!lastMessage) return;

        try {
            const data = JSON.parse(lastMessage.data);

            switch (data.type) {
                case 'assign_id':
                    setClientId(data.payload.id);
                    hasSyncedRef.current = false; // Reset sync flag on new id
                    console.log("Assigned client ID:", data.payload.id);
                    break;

                case 'game_state':
                    if (typeof data.payload.gridSize === 'number') {
                        setGridSize(data.payload.gridSize);
                    }
                    if (data.payload.apple) {
                        setApple(data.payload.apple);
                    }
                    if (Array.isArray(data.payload.players) && clientId) {
                        // Update other players, filter out self
                        const others = data.payload.players.filter(p => p.id !== clientId);
                        setOtherPlayers(others);

                        // Find self in server state to potentially correct score/length if needed,
                        // but primarily rely on local segments for score display
                        const selfData = data.payload.players.find(p => p.id === clientId);

                        // --- Sync local snake to server state on first connect ---
                        if (selfData && !hasSyncedRef.current) {
                            setSegments(selfData.segments);
                            hasSyncedRef.current = true;
                        }
                        // Score is now based on local prediction length
                        setScore(segments.length > 0 ? segments.length : (selfData?.size || 1));
                    } else if (Array.isArray(data.payload.players)) {
                        // If clientId not set yet, just update others
                         setOtherPlayers(data.payload.players);
                    }
                    break;

                case 'apple_eat':
                    // Server confirms apple eaten and provides new position
                    if (data.payload.newApple) {
                        setApple(data.payload.newApple);
                        // Optionally: If the eater was self, could trigger a local growth confirmation
                        // if (data.payload.playerId === clientId) { ... }
                    }
                    break;

                case 'death':
                    // Server tells us we died
                    if (data.payload && clientId) { // Check if message is for us implicitly (server only sends to dead player)
                        console.log("Received death message:", data.payload);
                        setIsRespawning(true);
                        const respawnDelay = data.payload.respawnDelay || (RESPAWN_COUNTDOWN_DURATION * 1000);
                        const endTime = Date.now() + respawnDelay;

                        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
                        setRespawnCountdown(Math.ceil(respawnDelay / 1000)); // Initial countdown value

                        countdownIntervalRef.current = setInterval(() => {
                            const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
                            setRespawnCountdown(remaining);
                            if (remaining <= 0 && countdownIntervalRef.current) {
                                clearInterval(countdownIntervalRef.current);
                                countdownIntervalRef.current = null;
                                // Server will send 'respawn' message
                            }
                        }, 500); // Update countdown display twice a second
                    }
                    break;

                case 'respawn':
                     // Server tells us we have respawned
                    if (data.payload && clientId) { // Check if message is for us implicitly
                        console.log("Received respawn message:", data.payload);
                        setIsRespawning(false);
                        setRespawnCountdown(null);
                        if (countdownIntervalRef.current) {
                            clearInterval(countdownIntervalRef.current);
                            countdownIntervalRef.current = null;
                        }
                        if (data.payload.position) {
                            // Trigger position reset in the game loop hook
                            setInitialPosition(data.payload.position);
                            // Clear initialPosition slightly later so hook can process it
                            setTimeout(() => setInitialPosition(null), 50);
                        }
                    }
                    break;

                default:
                    break; // Ignore unknown message types
            }
        } catch (error) {
            console.error("Error processing server message:", error);
        }
    }, [lastMessage, clientId, setSegments, segments.length]); // segments.length needed for score update

    // Handle keyboard input (no changes needed here)
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Input disabled during respawn countdown
            if (event.repeat || isRespawning) return;

            let newDirection: Direction | null = null;
            switch (event.key) {
                case 'ArrowUp': case 'w': case 'W': newDirection = 'up'; event.preventDefault(); break;
                case 'ArrowDown': case 's': case 'S': newDirection = 'down'; event.preventDefault(); break;
                case 'ArrowLeft': case 'a': case 'A': newDirection = 'left'; event.preventDefault(); break;
                case 'ArrowRight': case 'd': case 'D': newDirection = 'right'; event.preventDefault(); break;
                default: return;
            }
            if (newDirection) {
                addInput(newDirection);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [addInput, isRespawning]); // Depend on isRespawning

    // Cleanup countdown interval on unmount
    useEffect(() => {
        return () => {
            if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
            }
        };
    }, []);

    // Determine game board size
    const gameBoardSize = 'min(80vw, 80vh)';

    return (
        <div className="flex flex-col items-center">
            {/* Title */}
            <h1 className="text-3xl font-bold mb-2 text-gray-800 dark:text-gray-200">Snake Online</h1>
            {/* Show Player ID */}
            {clientId && (
                <div className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                    Your Player ID: <span className="font-mono">{clientId}</span>
                </div>
            )}
            {/* Connection Status & Latency */}
            <div className="flex items-center gap-2 mb-1 text-xs">
                <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                <span>
                    {readyState === WebSocket.CONNECTING ? 'Connecting...' :
                     readyState === WebSocket.OPEN ? `Connected (${latency}ms)` :
                     readyState === WebSocket.CLOSING ? 'Closing...' : 'Disconnected'}
                </span>
                {readyState === WebSocket.CLOSED && (
                    <button onClick={reconnect} className="px-1 py-0.5 bg-blue-500 text-white text-xs rounded hover:bg-blue-600">
                        Reconnect
                    </button>
                )}
            </div>

            {/* Game stats */}
            <div className="mb-2 flex items-center gap-4 text-sm">
                <p className="font-bold">Score: {score}</p>
                <p>Length: {segments.length}</p>
                <p>Input: <span className="font-mono uppercase">{displayDirection}</span></p>
                <p>Players: {1 + otherPlayers.length}</p>
            </div>

            {/* Game board */}
            <div
                className="relative border-2 border-gray-500 dark:border-gray-700 shadow-lg overflow-hidden game-grid-bg"
                style={{
                    width: gameBoardSize,
                    height: gameBoardSize,
                    maxWidth: '600px',
                    maxHeight: '600px',
                }}
            >
                {/* Connection Overlay */}
                 {!connected && readyState !== WebSocket.OPEN && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-30 text-white font-bold">
                        {readyState === WebSocket.CONNECTING ? 'Connecting...' : 'Disconnected'}
                    </div>
                )}

                {/* Apple */}
                <Apple position={apple} gridSize={gridSize} />

                {/* Other players */}
                {otherPlayers.map(player => (
                    <Snake
                        key={player.id}
                        segments={player.segments}
                        hue={player.hue}
                        gridSize={gridSize}
                    />
                ))}

                {/* Current player's snake (only render if not respawning) */}
                {!isRespawning && segments.length > 0 && (
                    <Snake
                        segments={segments}
                        hue={120} // Green for the player
                        gridSize={gridSize}
                    />
                )}

                {/* Respawn overlay */}
                {isRespawning && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-black/60 text-xl font-bold z-20">
                        <div>You died!</div>
                        {/* Display reason? data.payload.reason */}
                        <div className="text-2xl mt-2">Score: {score}</div>
                        {respawnCountdown !== null && respawnCountdown > 0 && (
                            <>
                                <div className="text-7xl mt-4 font-mono">{respawnCountdown}</div>
                                <div className="text-lg mt-4">Respawning...</div>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Controls help */}
            <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                Use arrow keys or WASD to control the snake
            </div>
        </div>
    );
};

export default Game;
