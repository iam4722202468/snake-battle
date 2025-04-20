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
    gameMode: 'selection' | 'playing';
}

// Remove teleport-related state from return type
interface ClientGameLoopState {
    segments: Position[];
    direction: Direction;
    displayDirection: Direction;
    addInput: (newDirection: Direction) => void;
    setSegments: React.Dispatch<React.SetStateAction<Position[]>>; // Expose raw setter
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
    gameMode = 'playing',
}: UseClientGameLoopProps): ClientGameLoopState => {
    const [segments, setSegments] = useState<Position[]>([{ x: 10, y: 10 }]);
    const [direction, setDirection] = useState<Direction>('right');
    const [displayDirection, setDisplayDirection] = useState<Direction>('right');

    // Remove teleport state: isTeleporting, teleportInfo, justTeleportedRef, lastPositionsRef

    // Refs for values used in animation frame logic
    const currentDirectionRef = useRef<Direction>('right');
    const inputBufferRef = useRef<Direction[]>([]);
    const onPositionUpdateRef = useRef(onPositionUpdate);
    const appleRef = useRef(apple);
    const isBoostingRef = useRef(isBoosting);
    const lastTickTimeRef = useRef<number>(0);
    const tickRateRef = useRef(tickRate);
    const animationFrameIdRef = useRef<number | null>(null);
    // Ref to hold the current segments state for use in callbacks
    const segmentsRef = useRef(segments); 

    // Keep refs updated
    useEffect(() => { onPositionUpdateRef.current = onPositionUpdate; }, [onPositionUpdate]);
    useEffect(() => { appleRef.current = apple; }, [apple]);
    useEffect(() => { isBoostingRef.current = isBoosting; }, [isBoosting]);
    useEffect(() => { tickRateRef.current = tickRate; }, [tickRate]);
    useEffect(() => { currentDirectionRef.current = direction; }, [direction]);
    useEffect(() => { segmentsRef.current = segments; }, [segments]); // Keep segmentsRef updated

    // Reset state when initial position changes (after respawn)
    useEffect(() => {
        if (initialPosition) {
            setSegments([initialPosition]);
            const initialDir = 'right';
            setDirection(initialDir);
            setDisplayDirection(initialDir);
            currentDirectionRef.current = initialDir;
            inputBufferRef.current = [];
            // No teleport state to reset here
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

    // Remove setSegmentsWithTeleportCheck

    // Game loop using requestAnimationFrame for smoother performance
    useEffect(() => {
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
            // Remove justTeleportedRef check

            const currentTickRate = isBoostingRef.current 
                ? tickRateRef.current / tickMultiplier 
                : tickRateRef.current;
                
            if (timestamp - lastTickTimeRef.current >= currentTickRate) {
                lastTickTimeRef.current = timestamp;
                
                let moveDirection: Direction;
                if (inputBufferRef.current.length > 0) {
                    moveDirection = inputBufferRef.current.shift()!;
                } else {
                    moveDirection = currentDirectionRef.current;
                }
                // Only update internal direction ref, state update happens via server
                currentDirectionRef.current = moveDirection; 
                // setDirection(moveDirection); // Let server state dictate this via Game.tsx

                // Perform local prediction
                const currentSegments = segmentsRef.current; // Use ref for prediction base
                if (currentSegments.length === 0) {
                     animationFrameIdRef.current = requestAnimationFrame(gameLoop);
                     return; // Skip prediction if no segments
                }

                const head = currentSegments[0];
                const newHead = { ...head };

                switch (moveDirection) {
                    case 'up': newHead.y -= 1; break;
                    case 'down': newHead.y += 1; break;
                    case 'left': newHead.x -= 1; break;
                    case 'right': newHead.x += 1; break;
                }

                const currentApple = appleRef.current;
                const ateApple = newHead.x === currentApple.x && newHead.y === currentApple.y;

                let newPredictedSegments = [newHead, ...currentSegments];
                if (!ateApple) {
                    newPredictedSegments = newPredictedSegments.slice(0, -1);
                }

                // Send predicted position update to server
                if (onPositionUpdateRef.current) {
                    onPositionUpdateRef.current(newPredictedSegments, moveDirection);
                }
                
                // *** Restore local state update for smooth visuals ***
                setSegments(newPredictedSegments); 
            }
            
            animationFrameIdRef.current = requestAnimationFrame(gameLoop);
        };

        animationFrameIdRef.current = requestAnimationFrame(gameLoop);

        return () => {
            if (animationFrameIdRef.current) {
                cancelAnimationFrame(animationFrameIdRef.current);
                animationFrameIdRef.current = null;
            }
        };
    }, [isRespawning, gridSize, tickMultiplier, gameMode]); // Removed setSegments dependency

    return {
        segments,
        direction, // This might become slightly out of sync, displayDirection is better for UI
        displayDirection,
        addInput,
        setSegments, // Expose the raw setter for Game.tsx to use
        // Remove isTeleporting and teleportInfo from return
    };
};

export default useClientGameLoop;

