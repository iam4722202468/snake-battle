'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import Snake from './Snake';
import Apple from './Apple';

// --- Interfaces ---
interface Position {
    x: number;
    y: number;
}
interface GameStateSnake {
    id: string;
    segments: Position[];
    hue: number; // Added
    isRespawning: boolean;
    respawnEndTime: number | null;
}
interface GameState {
    snakes: GameStateSnake[];
    apple: Position;
    gridSize: number;
}

// --- Constants ---
const GRID_SIZE = 20; // Default or fallback grid size
const CLIENT_TICK_RATE = 150; // Reverted tick rate - Match server
const RESPAWN_DELAY = 3000; // ms - Client-side constant, MUST match server
const MAX_PREDICTION_BUFFER = 8; // Maximum number of moves to predict ahead
const RECONCILIATION_THRESHOLD = 2; // How many segments can be off before hard reconciliation

const Game: React.FC = () => {
    const { sendMessage, lastMessage, readyState, latency } = useWebSocket();
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [clientId, setClientId] = useState<string | null>(null);

    // --- Client-side Prediction State ---
    const [predictedSegments, setPredictedSegments] = useState<Position[]>([]);
    const [predictedDirection, setPredictedDirection] = useState<'up' | 'down' | 'left' | 'right'>('right');
    const [queuedDirection, setQueuedDirection] = useState<'up' | 'down' | 'left' | 'right' | null>(null); // Added input queue
    const [isClientRespawning, setIsClientRespawning] = useState<boolean>(false); // Added state for respawn visual
    const [respawnEndTime, setRespawnEndTime] = useState<number | null>(null); // Added state for timer end
    const [respawnCountdown, setRespawnCountdown] = useState<number | null>(null); // Added state for countdown display
    const lastUpdateTimeRef = useRef<number>(0);
    const gameLoopRef = useRef<number | null>(null);
    const predictedDeathRef = useRef<boolean>(false); // Ref to track local death prediction
    const inputHistoryRef = useRef<Array<{direction: string, timestamp: number}>>([]);
    const lastServerUpdateRef = useRef<number>(Date.now());
    // Keep a more robust queue of directions to process
    const directionQueueRef = useRef<Array<'up' | 'down' | 'left' | 'right'>>([]);

    // --- Helper function for comparing positions ---
    const arePositionsEqual = (pos1: Position, pos2: Position): boolean => {
        return pos1.x === pos2.x && pos1.y === pos2.y;
    };

    // --- Helper function to measure segment difference ---
    const calculateSegmentDifference = (predicted: Position[], server: Position[]): number => {
        const minLength = Math.min(predicted.length, server.length);
        let differences = 0;
        
        // Check position differences in common segments
        for (let i = 0; i < minLength; i++) {
            if (!arePositionsEqual(predicted[i], server[i])) {
                differences++;
            }
        }
        
        // Add the length difference
        differences += Math.abs(predicted.length - server.length);
        
        return differences;
    };

    // --- Server Message Handling & Reconciliation ---
    useEffect(() => {
        if (lastMessage !== null) {
            try {
                const data = JSON.parse(lastMessage.data);

                if (data.type === 'assignId') {
                    const newClientId = data.payload.id;
                    setClientId(newClientId);
                    console.log("Assigned Client ID:", newClientId);
                    // Initial state often comes with assignment or shortly after
                } else if (data.type === 'gameState') {
                    lastServerUpdateRef.current = Date.now();
                    const serverState: GameState = data.payload;
                    setGameState(serverState); // Update overall game state

                    // --- Improved Reconciliation ---
                    if (clientId) {
                        const clientSnakeServerState = serverState.snakes.find(s => s.id === clientId);
                        if (clientSnakeServerState) {
                            // Check respawn status FIRST
                            if (clientSnakeServerState.isRespawning) {
                                if (!isClientRespawning) { // Log only when state changes to true
                                    console.log(`[Client ${clientId}] Started respawning.`);
                                    setIsClientRespawning(true);
                                    setRespawnEndTime(clientSnakeServerState.respawnEndTime); // Store end time
                                    setQueuedDirection(null); // Clear queue on respawn start
                                    inputHistoryRef.current = []; // Clear input history
                                }
                                // Server confirmed, so clear the local prediction flag
                                predictedDeathRef.current = false;
                                setPredictedSegments([]); // Clear local prediction while respawning
                            } else {
                                // Not respawning, update state and reconcile segments
                                if (isClientRespawning && !predictedDeathRef.current) { // Log only when state changes to false
                                     console.log(`[Client ${clientId}] Finished respawning.`);
                                     setIsClientRespawning(false);
                                     setRespawnEndTime(null); // Clear end time
                                     setRespawnCountdown(null); // Clear countdown display
                                     setQueuedDirection(null); // Clear queue on respawn end
                                     inputHistoryRef.current = []; // Clear input history
                                     setPredictedSegments(clientSnakeServerState.segments);
                                } else if (predictedDeathRef.current) {
                                    // We predicted death, but server hasn't confirmed yet. Keep waiting.
                                    console.log(`[Client ${clientId}] Waiting for server respawn confirmation...`);
                                } else {
                                    // Normal gameplay state - selective reconciliation
                                    // 1. Check if segments differ significantly from our prediction
                                    const segmentDifference = calculateSegmentDifference(
                                        predictedSegments, 
                                        clientSnakeServerState.segments
                                    );
                                    
                                    if (segmentDifference > RECONCILIATION_THRESHOLD) {
                                        // Too much difference - hard reconcile
                                        console.log(`[Client ${clientId}] Hard reconciliation (${segmentDifference} differences).`);
                                        setPredictedSegments(clientSnakeServerState.segments);
                                        inputHistoryRef.current = []; // Clear input history past this point
                                    } else if (segmentDifference > 0) {
                                        // Small difference - soft reconcile (keep predicted head position)
                                        console.log(`[Client ${clientId}] Soft reconciliation (${segmentDifference} differences).`);
                                        // If the difference is small, we might want to keep our predicted head position
                                        // but adjust the rest based on server state
                                        const newSegments = [...clientSnakeServerState.segments];
                                        if (predictedSegments.length > 0) {
                                            // Replace head with our predicted head, if we have one
                                            newSegments[0] = predictedSegments[0];
                                        }
                                        setPredictedSegments(newSegments);
                                    } else {
                                        // No difference - no need to reconcile
                                    }
                                }
                            }
                        } else {
                            // Handle case where client snake is not in server state
                            console.log(`[Client ${clientId}] Not found in server state update.`);
                            if (!isClientRespawning) { // Avoid redundant logs if already respawning
                                console.log(`[Client ${clientId}] Assuming respawn due to missing state.`);
                                setIsClientRespawning(true); // Assume respawning if missing
                                setRespawnEndTime(null); // Cannot know end time if missing state
                                setRespawnCountdown(null);
                                setQueuedDirection(null); // Clear queue if snake disappears
                                inputHistoryRef.current = []; // Clear input history
                            }
                            // Server state reflects snake is gone, clear local prediction flag
                            predictedDeathRef.current = false;
                            setPredictedSegments([]);
                        }
                    }
                }
            } catch (error) {
                console.error('Failed to parse message or invalid message format:', lastMessage.data, error);
            }
        }
        // Removed predictedSegments from dependency array as we now always update when not respawning
    }, [lastMessage, clientId, isClientRespawning]); // Added isClientRespawning to dependencies

    // --- Input Handling ---
    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        // Ignore key repeat events and respawning state
        if (event.repeat || isClientRespawning) return;
        
        let newDirection: 'up' | 'down' | 'left' | 'right' | null = null;
        switch (event.key) {
            case 'ArrowUp': case 'w': newDirection = 'up'; break;
            case 'ArrowDown': case 's': newDirection = 'down'; break;
            case 'ArrowLeft': case 'a': newDirection = 'left'; break;
            case 'ArrowRight': case 'd': newDirection = 'right'; break;
        }

        if (newDirection && readyState === WebSocket.OPEN) {
            // Immediately send to server for responsive controls
            sendMessage({ type: 'move', payload: { direction: newDirection } });
            
            // Add to our direction queue
            directionQueueRef.current.push(newDirection);
            
            // Record input with timestamp in history
            const timestamp = Date.now();
            inputHistoryRef.current.push({
                direction: newDirection,
                timestamp: timestamp
            });
            
            // Limit history size
            if (inputHistoryRef.current.length > MAX_PREDICTION_BUFFER) {
                inputHistoryRef.current.shift();
            }
        }
    }, [readyState, sendMessage, isClientRespawning]);

    // --- Additional Continuous Input Processing ---
    useEffect(() => {
        // Process the input queue more frequently than the game tick
        const processInputQueue = () => {
            // Skip if respawning or no queue
            if (isClientRespawning || directionQueueRef.current.length === 0) {
                return;
            }
            
            // Get the next direction from queue
            const nextDirection = directionQueueRef.current[0];
            
            const isValidDirection = !(
                (nextDirection === 'up' && predictedDirection === 'down') ||
                (nextDirection === 'down' && predictedDirection === 'up') ||
                (nextDirection === 'left' && predictedDirection === 'right') ||
                (nextDirection === 'right' && predictedDirection === 'left') ||
                nextDirection === predictedDirection
            );
            
            if (isValidDirection) {
                // Apply valid direction immediately to be responsive
                setPredictedDirection(nextDirection);
            }
            
            // Always remove the processed direction from queue
            directionQueueRef.current.shift();
        };
        
        // Run input processing at a higher frequency than game ticks
        const intervalId = setInterval(processInputQueue, 20); // 50Hz processing (every 20ms)
        
        return () => clearInterval(intervalId);
    }, [isClientRespawning, predictedDirection]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    // --- Client-side Prediction Loop ---
    useEffect(() => {
        const runPredictionLoop = (timestamp: number) => {
            // Stop prediction if client is marked as respawning or not ready
            if (!clientId || isClientRespawning) {
                 gameLoopRef.current = requestAnimationFrame(runPredictionLoop);
                 return;
            }

            // Remove the queue processing from here since we're handling it in a separate effect
            // This ensures inputs are applied more responsively and not just on tick boundaries

            // --- Tick-Based Movement Prediction ---
            const delta = timestamp - lastUpdateTimeRef.current;
            const estimatedServerTime = Date.now() - (latency / 2); // Account for one-way latency
            
            if (delta >= CLIENT_TICK_RATE) { // Use reverted tick rate
                lastUpdateTimeRef.current = timestamp;

                 // Ensure we have segments to predict from *inside* the tick
                 if (predictedSegments.length === 0 && !isClientRespawning) {
                     // Skip if segments are empty but not officially respawning yet
                 } else if (predictedSegments.length > 0) { // Only predict if we have segments
                    setPredictedSegments(prevSegments => {
                        // This state update function now contains the core prediction logic

                        // Should not happen due to checks above, but safeguard
                        if (prevSegments.length === 0) return [];

                        const currentHead = { ...prevSegments[0] };
                        const nextHead = { ...currentHead };
                        const currentGridSize = gameState?.gridSize ?? GRID_SIZE;

                        // Calculate next head position based on the *current* predictedDirection
                        // (which might have just been updated by the queue processing above)
                        switch (predictedDirection) {
                            case 'up': nextHead.y -= 1; break;
                            case 'down': nextHead.y += 1; break;
                            case 'left': nextHead.x -= 1; break;
                            case 'right': nextHead.x += 1; break;
                        }

                        // --- Predict Wall Collision ---
                        // ... existing logic ...
                        const wallCollision =
                            nextHead.x < 0 ||
                            nextHead.x >= currentGridSize ||
                            nextHead.y < 0 ||
                            nextHead.y >= currentGridSize;

                        if (wallCollision) {
                            console.warn(`[Client ${clientId}] Predicted wall collision. Triggering respawn locally.`);
                            predictedDeathRef.current = true; // Set flag: waiting for server confirmation
                            const estimatedEndTime = Date.now() + RESPAWN_DELAY;
                            setIsClientRespawning(true);
                            setRespawnEndTime(estimatedEndTime);
                            setRespawnCountdown(Math.ceil(RESPAWN_DELAY / 1000));
                            sendMessage({ type: 'died' });
                            return [];
                        }

                        // --- Predict Self-Collision ---
                        // ... existing logic ...
                         const selfCollision = prevSegments.slice(1).some(
                            segment => nextHead.x === segment.x && nextHead.y === segment.y
                        );

                        if (selfCollision) {
                            console.warn(`[Client ${clientId}] Predicted self-collision. Triggering respawn locally.`);
                            predictedDeathRef.current = true; // Set flag: waiting for server confirmation
                            const estimatedEndTime = Date.now() + RESPAWN_DELAY;
                            setIsClientRespawning(true);
                            setRespawnEndTime(estimatedEndTime);
                            setRespawnCountdown(Math.ceil(RESPAWN_DELAY / 1000));
                            sendMessage({ type: 'died' });
                            return [];
                        }

                        // --- Prevent Double-Back (Check against prevSegments[1]) ---
                        // Note: This check might be less critical now server handles it, but keep for local prediction sanity
                        if (prevSegments.length > 1) {
                            const secondSegment = prevSegments[1];
                            if (nextHead.x === secondSegment.x && nextHead.y === secondSegment.y) {
                                // If the calculated move hits the neck, it implies an invalid immediate reversal attempt.
                                // Instead of moving, effectively skip the move for this tick by returning prevSegments.
                                // Or, more accurately, recalculate nextHead based on the direction *before* the invalid queued input was processed.
                                // For simplicity here, let's just log and potentially revert to currentHead - server will correct.
                                console.warn("Client Prediction: Double-back prevented locally.");
                                // Revert nextHead to currentHead to effectively stall for this tick
                                nextHead.x = currentHead.x;
                                nextHead.y = currentHead.y;
                            }
                        }

                        // --- Predict Apple Eating ---
                        // ... existing logic ...
                        let ateApplePredicted = false;
                        if (gameState?.apple && nextHead.x === gameState.apple.x && nextHead.y === gameState.apple.y) {
                            console.log(`[Client ${clientId}] Predicted eating apple.`);
                            ateApplePredicted = true;
                        }

                        // --- Update Segments ---
                        const newSegments = [...prevSegments];
                        // Only add the head if it actually moved (didn't stall due to double-back prediction)
                        if (nextHead.x !== currentHead.x || nextHead.y !== currentHead.y) {
                             newSegments.unshift(nextHead);
                        }

                        // --- Tail Removal Logic ---
                        // ... existing logic ...
                        const serverSnakeState = gameState?.snakes.find(s => s.id === clientId);
                        const serverLength = serverSnakeState?.segments?.length ?? 0;
                        const grewOnServer = serverSnakeState && !serverSnakeState.isRespawning && serverLength > prevSegments.length;

                        if (!ateApplePredicted && !grewOnServer) {
                             if (!serverSnakeState || serverSnakeState.isRespawning || newSegments.length > serverLength) {
                                  // Only pop if the snake actually moved/grew in this prediction step
                                  if (newSegments.length > prevSegments.length || newSegments.length > 1) {
                                       newSegments.pop();
                                  }
                             }
                        }

                        return newSegments;
                    });
                 }
            }

            gameLoopRef.current = requestAnimationFrame(runPredictionLoop);
        };

        // Start the loop
        lastUpdateTimeRef.current = performance.now();
        gameLoopRef.current = requestAnimationFrame(runPredictionLoop);

        // Cleanup function
        return () => {
            if (gameLoopRef.current) {
                cancelAnimationFrame(gameLoopRef.current);
            }
        };
    }, [clientId, predictedDirection, gameState, predictedSegments.length, isClientRespawning, queuedDirection, sendMessage, latency]); // sendMessage is technically not needed here anymore, but harmless

    // --- Respawn Countdown Timer ---
    useEffect(() => {
        let intervalId: NodeJS.Timeout | null = null;

        if (isClientRespawning && respawnEndTime) {
            const updateCountdown = () => {
                const now = Date.now();
                const remainingSeconds = Math.max(0, Math.ceil((respawnEndTime - now) / 1000));
                setRespawnCountdown(remainingSeconds);

                if (remainingSeconds <= 0) {
                    // Although server state dictates the end, we can clear interval early
                    if (intervalId) clearInterval(intervalId);
                }
            };

            updateCountdown(); // Initial update
            intervalId = setInterval(updateCountdown, 1000); // Update every second
        }

        // Cleanup function
        return () => {
            if (intervalId) {
                clearInterval(intervalId);
            }
        };
    }, [isClientRespawning, respawnEndTime]); // Run when respawn state or end time changes

    // When component unmounts or when key dependencies change, clear the direction queue
    useEffect(() => {
        return () => {
            directionQueueRef.current = [];
        };
    }, [clientId, isClientRespawning]);

    // --- Rendering ---
    const gridSize = gameState?.gridSize ?? GRID_SIZE;
    const connectionStatus = {
        [WebSocket.CONNECTING]: 'Connecting...',
        [WebSocket.OPEN]: 'Connected',
        [WebSocket.CLOSING]: 'Closing...',
        [WebSocket.CLOSED]: 'Disconnected',
    }[readyState];
    const gameBoardSize = 'min(80vw, 80vh)';
    const clientSnakeHue = gameState?.snakes.find(s => s.id === clientId)?.hue ?? 120;

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 p-4">
            {/* ... Header, Status, Client ID ... */}
             <h1 className="text-3xl font-bold mb-2 text-gray-800 dark:text-gray-200">Multiplayer Snake</h1>
            <p className="mb-1 text-sm text-gray-600 dark:text-gray-400">Status: {connectionStatus}</p>
            {clientId && <p className="mb-3 text-sm text-blue-600 dark:text-blue-400">Your ID: {clientId} - Ping: {latency}ms</p>}

            <div
                className="relative game-grid-bg border-2 border-gray-500 dark:border-gray-700 shadow-lg overflow-hidden" // Added overflow-hidden
                style={{
                    width: gameBoardSize,
                    height: gameBoardSize,
                    maxWidth: '600px',
                    maxHeight: '600px',
                 }}
            >
                {gameState ? (
                    <>
                        {/* Render other snakes from gameState (only if not respawning) */}
                        {gameState.snakes
                            .filter(snake => snake.id !== clientId && !snake.isRespawning) // Exclude client and respawning snakes
                            .map((snake) => (
                                <Snake
                                    key={snake.id}
                                    segments={snake.segments}
                                    hue={snake.hue} // Pass hue instead of color
                                    gridSize={gridSize}
                                />
                            ))}

                        {/* Render client's snake OR respawn message */}
                        {clientId && !isClientRespawning && predictedSegments.length > 0 && (
                            <Snake
                                key={clientId}
                                segments={predictedSegments}
                                hue={clientSnakeHue} // Pass client's hue
                                gridSize={gridSize}
                            />
                        )}
                        {clientId && isClientRespawning && (
                             <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-black/60 text-xl font-bold z-10">
                                <div>Respawning...</div>
                                {/* Display countdown if available */}
                                {respawnCountdown !== null && (
                                    // Increased text size using text-7xl
                                    <div className="text-7xl mt-2 font-mono">{respawnCountdown}</div>
                                )}
                             </div>
                        )}

                        {/* Render apple from gameState */}
                        <Apple position={gameState.apple} gridSize={gridSize} />
                    </>
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-gray-500 dark:text-gray-400">
                        {readyState === WebSocket.OPEN ? 'Waiting for game state...' : connectionStatus}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Game;
