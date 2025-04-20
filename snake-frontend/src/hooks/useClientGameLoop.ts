import { useState, useEffect, useRef, useCallback } from 'react';

interface Position { x: number; y: number; }
export type Direction = 'up' | 'down' | 'left' | 'right';

interface UseClientGameLoopProps {
    gridSize: number;
    apple: Position; // Apple position from server
    tickRate: number;
    clientId?: string | null; // Added
    isRespawning: boolean; // Added
    initialPosition?: Position | null; // Added
    onPositionUpdate?: (segments: Position[], direction: Direction) => void; // Added
}

interface ClientGameLoopState {
    segments: Position[];
    direction: Direction; // The direction the snake moved in the last tick
    // Removed requestedDirection state, displayDirection is enough for UI
    addInput: (newDirection: Direction) => void;
    reset: () => void; // Keep reset for internal use if needed, but respawn handles state now
    // Removed appleEaten state
    // Removed gameOver state
    displayDirection: Direction; // Renamed for clarity, used for UI display
}

export const useClientGameLoop = ({
    gridSize = 20,
    apple, // Use apple from props (server state)
    tickRate = 200,
    clientId, // Added
    isRespawning, // Added
    initialPosition, // Added
    onPositionUpdate, // Added
}: UseClientGameLoopProps): ClientGameLoopState & { setSegments: typeof setSegments } => {
    // Snake state
    const [segments, setSegments] = useState<Position[]>([
        { x: 10, y: 10 }, // Default initial, will be overwritten by server/respawn
    ]);
    const [direction, setDirection] = useState<Direction>('right');
    const [displayDirection, setDisplayDirection] = useState<Direction>('right'); // For UI display only
    // Removed appleEaten state
    // Removed gameOver state

    // Refs for internal state
    const currentDirectionRef = useRef<Direction>('right');
    const inputBufferRef = useRef<Direction[]>([]);
    const gameLoopIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const onPositionUpdateRef = useRef(onPositionUpdate); // Ref for the callback

    // Keep the callback ref updated
    useEffect(() => {
        onPositionUpdateRef.current = onPositionUpdate;
    }, [onPositionUpdate]);

    // Update the currentDirectionRef whenever the actual direction changes
    useEffect(() => {
        currentDirectionRef.current = direction;
    }, [direction]);

    // Reset state based on initialPosition (e.g., after respawn)
    useEffect(() => {
        if (initialPosition) {
            console.log("Resetting to initial position:", initialPosition);
            setSegments([initialPosition]);
            const initialDir = 'right'; // Or use direction from server if provided
            setDirection(initialDir);
            setDisplayDirection(initialDir);
            currentDirectionRef.current = initialDir;
            inputBufferRef.current = [];
        }
    }, [initialPosition]);

    // Reset function (might not be strictly needed externally anymore)
    const reset = useCallback(() => {
        // This could be used internally if needed, but server dictates respawn state
        setSegments([{ x: 10, y: 10 }]); // Example reset position
        setDirection('right');
        setDisplayDirection('right');
        currentDirectionRef.current = 'right';
        inputBufferRef.current = [];
    }, []);

    // Handle direction input - Add to buffer
    const addInput = useCallback((newDirection: Direction) => {
        // Don't accept input while respawning
        if (isRespawning) return;

        const lastQueuedDirection = inputBufferRef.current.length > 0
            ? inputBufferRef.current[inputBufferRef.current.length - 1]
            : currentDirectionRef.current;

        const isOpposite =
            (newDirection === 'up' && lastQueuedDirection === 'down') ||
            (newDirection === 'down' && lastQueuedDirection === 'up') ||
            (newDirection === 'left' && lastQueuedDirection === 'right') ||
            (newDirection === 'right' && lastQueuedDirection === 'left');

        if (isOpposite && segments.length > 1) {
            return;
        }

        if (inputBufferRef.current.length < 2 && newDirection !== lastQueuedDirection) {
            inputBufferRef.current.push(newDirection);
            setDisplayDirection(newDirection);
        }
    }, [isRespawning, segments.length]); // Added isRespawning dependency

    // Game loop - main game mechanics
    useEffect(() => {
        // Stop loop if respawning
        if (isRespawning) {
            if (gameLoopIntervalRef.current) {
                clearInterval(gameLoopIntervalRef.current);
                gameLoopIntervalRef.current = null;
            }
            inputBufferRef.current = [];
            return;
        }

        if (!gameLoopIntervalRef.current) {
            console.log("Client loop: Starting interval...");
            gameLoopIntervalRef.current = setInterval(() => {
                let moveDirection: Direction;

                if (inputBufferRef.current.length > 0) {
                    moveDirection = inputBufferRef.current.shift()!;
                } else {
                    moveDirection = currentDirectionRef.current;
                }

                setDirection(moveDirection);

                // Update segments based on moveDirection
                setSegments(prevSegments => {
                    if (prevSegments.length === 0) return prevSegments; // Should not happen if not respawning

                    const head = prevSegments[0];
                    const newHead = { ...head };

                    switch (moveDirection) {
                        case 'up': newHead.y -= 1; break;
                        case 'down': newHead.y += 1; break;
                        case 'left': newHead.x -= 1; break;
                        case 'right': newHead.x += 1; break;
                    }

                    // Wrap around grid boundaries (client-side prediction)
                    newHead.x = (newHead.x + gridSize) % gridSize;
                    newHead.y = (newHead.y + gridSize) % gridSize;

                    // Client-side prediction of eating apple
                    const ateApple = newHead.x === apple.x && newHead.y === apple.y;

                    let newSegments = [newHead, ...prevSegments];

                    // Remove tail unless apple was eaten
                    if (!ateApple) {
                        newSegments = newSegments.slice(0, -1);
                    }
                    // Server will confirm apple eating and send new apple position

                    // Send updated position to server via callback ref
                    if (onPositionUpdateRef.current) {
                        onPositionUpdateRef.current(newSegments, moveDirection);
                    }

                    return newSegments;
                });

            }, tickRate);
        }

        // Clean up
        return () => {
            if (gameLoopIntervalRef.current) {
                console.log("Client loop: Cleaning up interval.");
                clearInterval(gameLoopIntervalRef.current);
                gameLoopIntervalRef.current = null;
            }
        };
    }, [isRespawning, gridSize, tickRate]);

    return {
        segments,
        direction, // Last applied direction
        requestedDirection: displayDirection, // Use displayDirection for the UI
        addInput,
        reset, // Keep reset available if needed internally
        displayDirection, // Export for UI
        setSegments, // <-- Export setSegments for external sync
    };
};

export default useClientGameLoop;

