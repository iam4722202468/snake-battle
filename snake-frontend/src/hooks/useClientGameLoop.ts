import { useState, useEffect, useRef, useCallback } from 'react';

interface Position { x: number; y: number; }
export type Direction = 'up' | 'down' | 'left' | 'right';

interface UseClientGameLoopProps {
    gridSize: number;
    apple: Position;
    tickRate: number;
    clientId?: string | null;
    isRespawning: boolean;
    initialPosition?: Position | null;
    onPositionUpdate?: (segments: Position[], direction: Direction) => void;
    isBoosting: boolean;
    tickMultiplier?: number;
    gameMode: 'selection' | 'playing'; // Add game mode prop
}

interface ClientGameLoopState {
    segments: Position[];
    direction: Direction;
    displayDirection: Direction;
    addInput: (newDirection: Direction) => void;
    setSegments: React.Dispatch<React.SetStateAction<Position[]>>;
}

export const useClientGameLoop = ({
    gridSize = 20,
    apple,
    tickRate = 200,
    clientId,
    isRespawning,
    initialPosition,
    onPositionUpdate,
    isBoosting = false,
    tickMultiplier = 1.5,
    gameMode = 'playing', // Add default
}: UseClientGameLoopProps): ClientGameLoopState => {
    const [segments, setSegments] = useState<Position[]>([{ x: 10, y: 10 }]);
    const [direction, setDirection] = useState<Direction>('right');
    const [displayDirection, setDisplayDirection] = useState<Direction>('right');

    // Refs for values used in animation frame logic
    const currentDirectionRef = useRef<Direction>('right');
    const inputBufferRef = useRef<Direction[]>([]);
    const onPositionUpdateRef = useRef(onPositionUpdate);
    const appleRef = useRef(apple);
    const isBoostingRef = useRef(isBoosting);
    const lastTickTimeRef = useRef<number>(0);
    const tickRateRef = useRef(tickRate);
    const animationFrameIdRef = useRef<number | null>(null);

    // Keep refs updated with latest prop values
    useEffect(() => { onPositionUpdateRef.current = onPositionUpdate; }, [onPositionUpdate]);
    useEffect(() => { appleRef.current = apple; }, [apple]);
    useEffect(() => { isBoostingRef.current = isBoosting; }, [isBoosting]);
    useEffect(() => { tickRateRef.current = tickRate; }, [tickRate]);
    useEffect(() => { currentDirectionRef.current = direction; }, [direction]);

    // Reset state when initial position changes (after respawn)
    useEffect(() => {
        if (initialPosition) {
            setSegments([initialPosition]);
            const initialDir = 'right';
            setDirection(initialDir);
            setDisplayDirection(initialDir);
            currentDirectionRef.current = initialDir;
            inputBufferRef.current = [];
        }
    }, [initialPosition]);

    // Handle user input for direction changes
    const addInput = useCallback((newDirection: Direction) => {
        // Don't process inputs in selection mode
        if (isRespawning || gameMode !== 'playing') return;

        const lastQueuedDirection = inputBufferRef.current.length > 0
            ? inputBufferRef.current[inputBufferRef.current.length - 1]
            : currentDirectionRef.current;

        // Prevent 180-degree turns
        const isOpposite =
            (newDirection === 'up' && lastQueuedDirection === 'down') ||
            (newDirection === 'down' && lastQueuedDirection === 'up') ||
            (newDirection === 'left' && lastQueuedDirection === 'right') ||
            (newDirection === 'right' && lastQueuedDirection === 'left');

        if (isOpposite && segments.length > 1) return;

        // Limit input buffer to 2 moves and prevent duplicates
        if (inputBufferRef.current.length < 2 && newDirection !== lastQueuedDirection) {
            inputBufferRef.current.push(newDirection);
            setDisplayDirection(newDirection);
        }
    }, [isRespawning, segments.length, gameMode]);

    // Game loop using requestAnimationFrame for smoother performance
    useEffect(() => {
        // Only run game loop if in playing mode and not respawning
        if (isRespawning || gameMode !== 'playing') {
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
                
                // Get next direction from input buffer or continue in current direction
                let moveDirection: Direction;
                if (inputBufferRef.current.length > 0) {
                    moveDirection = inputBufferRef.current.shift()!;
                } else {
                    moveDirection = currentDirectionRef.current;
                }

                setDirection(moveDirection);

                // Update segments based on moveDirection
                setSegments(prevSegments => {
                    if (prevSegments.length === 0) return prevSegments;

                    const head = prevSegments[0];
                    const newHead = { ...head };

                    // Move head in the current direction
                    switch (moveDirection) {
                        case 'up': newHead.y -= 1; break;
                        case 'down': newHead.y += 1; break;
                        case 'left': newHead.x -= 1; break;
                        case 'right': newHead.x += 1; break;
                    }

                    // Client-side prediction of eating apple
                    const currentApple = appleRef.current;
                    const ateApple = newHead.x === currentApple.x && newHead.y === currentApple.y;

                    let newSegments = [newHead, ...prevSegments];

                    // Remove tail unless apple was eaten
                    if (!ateApple) {
                        newSegments = newSegments.slice(0, -1);
                    }

                    // Send position update to server
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

        // Cleanup on unmount or dependencies change
        return () => {
            if (animationFrameIdRef.current) {
                cancelAnimationFrame(animationFrameIdRef.current);
                animationFrameIdRef.current = null;
            }
        };
    }, [isRespawning, gridSize, tickMultiplier, gameMode]);

    return {
        segments,
        direction,
        displayDirection,
        addInput,
        setSegments
    };
};

export default useClientGameLoop;

