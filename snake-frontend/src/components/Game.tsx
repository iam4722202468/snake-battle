'use client';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import useClientGameLoop, { Direction } from '../hooks/useClientGameLoop';
import Snake from './Snake';
import Apple from './Apple';
import { useWebSocket } from '../hooks/useWebSocket'; // Re-import WebSocket hook

// Update Player interface to include isRespawning
interface Player {
    id: string;
    segments: { x: number; y: number }[];
    direction: Direction;
    hue: number;
    size: number;
    isRespawning: boolean; // Added
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
    const [totalPlayers, setTotalPlayers] = useState<number>(0); // State for total player count
    const [playerHue, setPlayerHue] = useState<number>(120); // Default to green until we get server value

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
            // Log received message type
            console.log(`Received message type: ${data.type}`, data.payload);

            switch (data.type) {
                case 'assign_id':
                    const newClientId = data.payload.id;
                    console.log(`Processing 'assign_id'. Current clientId: ${clientId}, New clientId: ${newClientId}`);
                    setClientId(newClientId);
                    hasSyncedRef.current = false; // Reset sync flag on new id
                    console.log(`Set clientId to: ${newClientId}`);
                    break;

                case 'game_state':
                    if (typeof data.payload.gridSize === 'number') {
                        setGridSize(data.payload.gridSize);
                    }
                    if (data.payload.apple) {
                        setApple(data.payload.apple);
                    }
                    // --- Update player list handling ---
                    if (Array.isArray(data.payload.players)) {
                        // Update total player count based on the full list from server
                        setTotalPlayers(data.payload.players.length);

                        if (clientId) {
                            // Filter out self first
                            const allOthers = data.payload.players.filter(p => p.id !== clientId);
                            // Filter out respawning players for rendering
                            const activeOthers = allOthers.filter(p => !p.isRespawning);
                            setOtherPlayers(activeOthers);

                            // Find self in server state
                            const selfData = data.payload.players.find(p => p.id === clientId);

                            // Sync local snake segments and score (logic remains the same)
                            if (selfData && !hasSyncedRef.current) {
                                console.log(`Initial sync for ${clientId}. Segments:`, selfData.segments);
                                setSegments(selfData.segments);
                                hasSyncedRef.current = true;
                                setScore(selfData.size || 1);
                                // Also store the player's server-assigned hue
                                setPlayerHue(selfData.hue);
                            } else if (selfData) {
                                // Update score only if it differs? Or always? Let's always update for now.
                                setScore(selfData.size || 1);
                                // If selfData shows we are respawning, update local state
                                if (selfData.isRespawning && !isRespawning) {
                                     console.log("Syncing local isRespawning to true based on server state");
                                     setIsRespawning(true);
                                     // Optional: Start countdown if not already started by 'death' message
                                } else if (!selfData.isRespawning && isRespawning) {
                                     // This case handled by 'respawn' message normally
                                }
                                // Make sure we always have the latest hue
                                setPlayerHue(selfData.hue);
                            } else if (!selfData && hasSyncedRef.current) {
                                // If selfData is missing after sync (e.g., during respawn),
                                // it implies we are respawning according to the server.
                                if (!isRespawning) {
                                    console.log("Syncing local isRespawning to true (self not found in server state)");
                                    setIsRespawning(true);
                                }
                            }
                        } else {
                            console.log("Processing 'game_state' but clientId is not set yet. Clearing other players.");
                        }
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
                    // Verify the death message is for this client
                    if (data.payload && data.payload.playerId === clientId) {
                        console.log("Received death message FOR ME:", data.payload);
                        if (!isRespawning) { // Prevent duplicate state updates
                            setIsRespawning(true);
                            // Score is already set by game_state, but ensure it's captured before respawn UI shows
                            // setScore(score); // score state should be up-to-date

                            const respawnDelay = data.payload.respawnDelay || (RESPAWN_COUNTDOWN_DURATION * 1000);
                            const endTime = Date.now() + respawnDelay;

                            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
                            setRespawnCountdown(Math.ceil(respawnDelay / 1000));

                            countdownIntervalRef.current = setInterval(() => {
                                const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
                                setRespawnCountdown(remaining);
                                if (remaining <= 0 && countdownIntervalRef.current) {
                                    clearInterval(countdownIntervalRef.current);
                                    countdownIntervalRef.current = null;
                                }
                            }, 500);
                        }
                    } else if (data.payload && clientId) {
                         console.log(`Received death message for other player (${data.payload.playerId}), ignoring.`);
                    }
                    break;

                case 'respawn':
                     // Verify the respawn message is for this client
                    if (data.payload && data.payload.playerId === clientId) {
                        console.log("Received respawn message FOR ME:", data.payload);
                        if (isRespawning) { // Prevent duplicate state updates
                            setIsRespawning(false);
                            setRespawnCountdown(null);
                            if (countdownIntervalRef.current) {
                                clearInterval(countdownIntervalRef.current);
                                countdownIntervalRef.current = null;
                            }
                            if (data.payload.position) {
                                setInitialPosition(data.payload.position);
                                setTimeout(() => setInitialPosition(null), 50);
                                hasSyncedRef.current = true; // Mark as synced after respawn
                            }
                        }
                    } else if (data.payload && clientId) {
                         console.log(`Received respawn message for other player (${data.payload.playerId}), ignoring.`);
                    }
                    break;

                default:
                    // Log unhandled message types
                    console.log(`Unhandled message type: ${data.type}`);
                    break; // Ignore unknown message types
            }
        } catch (error) {
            console.error("Error processing server message:", error, "Raw data:", lastMessage?.data);
        }
        // Dependencies: Added setIsRespawning, isRespawning
    }, [lastMessage, clientId, setSegments, setScore, isRespawning, setIsRespawning]);

    // Add a separate effect to log clientId changes
    useEffect(() => {
        console.log(`clientId state updated in component: ${clientId}`);
    }, [clientId]);

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
            {/* Show Player ID - Add log */}
            {clientId ? (
                <div className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                    Your Player ID: <span className="font-mono">{clientId}</span>
                </div>
            ) : (
                 <div className="mb-1 text-xs text-orange-500 dark:text-orange-400">
                    Player ID: Not assigned yet
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
                {/* Score is now directly from server state */}
                <p className="font-bold">Score: {score}</p>
                {/* Length display still uses local prediction for smoothness */}
                <p>Length: {!isRespawning && segments.length > 0 ? segments.length : 0}</p>
                <p>Input: <span className="font-mono uppercase">{displayDirection}</span></p>
                {/* Player count uses the total count from server state */}
                <p>Players: {totalPlayers}</p>
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
                        hue={playerHue} // Use server-assigned hue instead of hardcoded 120
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
