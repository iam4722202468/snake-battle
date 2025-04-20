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
    isBoosting: boolean; // Add boosting prop
    tickMultiplier?: number; // Add speed multiplier for boost
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
    isBoosting = false,
    tickMultiplier = 1.5, // Default boost is 1.5x speed
}: UseClientGameLoopProps): ClientGameLoopState & { setSegments: typeof setSegments } => {
    // Snake state
    const [segments, setSegments] = useState<Position[]>([
        { x: 10, y: 10 }, // Default initial, will be overwritten by server/respawn
    ]);
    const [direction, setDirection] = useState<Direction>('right');
    const [displayDirection, setDisplayDirection] = useState<Direction>('right'); // For UI display only

    // Refs for internal state
    const currentDirectionRef = useRef<Direction>('right');
    const inputBufferRef = useRef<Direction[]>([]);
    const gameLoopIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const onPositionUpdateRef = useRef(onPositionUpdate); // Ref for the callback
    const appleRef = useRef(apple); // Ref for the current apple position
    const isBoostingRef = useRef(isBoosting); // Reference to current boost state
    const lastTickTimeRef = useRef<number>(0);
    const tickRateRef = useRef(tickRate);
    const animationFrameIdRef = useRef<number | null>(null);

    // Keep the callback ref updated
    useEffect(() => {
        onPositionUpdateRef.current = onPositionUpdate;
    }, [onPositionUpdate]);

    useEffect(() => {
        appleRef.current = apple;
    }, [apple]);

    useEffect(() => {
        isBoostingRef.current = isBoosting;
    }, [isBoosting]);

    useEffect(() => {
        tickRateRef.current = tickRate;
    }, [tickRate]);

    // Update the currentDirectionRef whenever the actual direction changes
    useEffect(() => {
        currentDirectionRef.current = direction;
    }, [direction]);

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

    const reset = useCallback(() => {
        setSegments([{ x: 10, y: 10 }]); // Example reset position
        setDirection('right');
        setDisplayDirection('right');
        currentDirectionRef.current = 'right';
        inputBufferRef.current = [];
    }, []);

    const addInput = useCallback((newDirection: Direction) => {
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

    // Game loop using requestAnimationFrame instead of setInterval for smoother performance
    useEffect(() => {
        if (isRespawning) {
            if (animationFrameIdRef.current) {
                cancelAnimationFrame(animationFrameIdRef.current);
                animationFrameIdRef.current = null;
            }
            inputBufferRef.current = [];
            return;
        }

        lastTickTimeRef.current = performance.now();

        const gameLoop = (timestamp: number) => {
            const currentTickRate = isBoostingRef.current 
                ? tickRateRef.current / tickMultiplier 
                : tickRateRef.current;
                
            // Check if enough time has passed for a tick
            if (timestamp - lastTickTimeRef.current >= currentTickRate) {
                lastTickTimeRef.current = timestamp;
                
                // Process movement - same logic as before
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

                    // Client-side prediction of eating apple
                    const currentApple = appleRef.current; // Get latest apple position from ref
                    const ateApple = newHead.x === currentApple.x && newHead.y === currentApple.y;

                    let newSegments = [newHead, ...prevSegments];

                    // Remove tail unless apple was eaten
                    if (!ateApple) {
                        newSegments = newSegments.slice(0, -1);
                    }

                    // Send updated position to server via callback ref
                    if (onPositionUpdateRef.current) {
                        onPositionUpdateRef.current(newSegments, moveDirection);
                    }

                    return newSegments;
                });
            }
            
            // Schedule next frame
            animationFrameIdRef.current = requestAnimationFrame(gameLoop);
        };

        // Start the animation loop
        animationFrameIdRef.current = requestAnimationFrame(gameLoop);

        // Cleanup
        return () => {
            if (animationFrameIdRef.current) {
                cancelAnimationFrame(animationFrameIdRef.current);
                animationFrameIdRef.current = null;
            }
        };
    }, [isRespawning, gridSize, tickMultiplier]);

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

