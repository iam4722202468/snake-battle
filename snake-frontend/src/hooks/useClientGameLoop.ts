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

interface ClientGameLoopState {
    segments: Position[];
    displayDirection: Direction;
    addInput: (newDirection: Direction) => void;
    setSegments: React.Dispatch<React.SetStateAction<Position[]>>;
}

export const useClientGameLoop = ({
    gridSize = 20,
    apple,
    tickRate = 200,
    isRespawning,
    initialPosition,
    onPositionUpdate,
    isBoosting = false,
    tickMultiplier = 1.5,
    gameMode = 'playing',
}: UseClientGameLoopProps): ClientGameLoopState => {
    const [segments, setSegments] = useState<Position[]>([{ x: 10, y: 10 }]);
    const [displayDirection, setDisplayDirection] = useState<Direction>('right');

    const currentDirectionRef = useRef<Direction>('right');
    const inputBufferRef = useRef<Direction[]>([]);
    const onPositionUpdateRef = useRef(onPositionUpdate);
    const appleRef = useRef(apple);
    const isBoostingRef = useRef(isBoosting);
    const lastTickTimeRef = useRef<number>(0);
    const tickRateRef = useRef(tickRate);
    const animationFrameIdRef = useRef<number | null>(null);
    const segmentsRef = useRef(segments); 

    useEffect(() => { onPositionUpdateRef.current = onPositionUpdate; }, [onPositionUpdate]);
    useEffect(() => { appleRef.current = apple; }, [apple]);
    useEffect(() => { isBoostingRef.current = isBoosting; }, [isBoosting]);
    useEffect(() => { tickRateRef.current = tickRate; }, [tickRate]);
    useEffect(() => { segmentsRef.current = segments; }, [segments]);

    useEffect(() => {
        if (initialPosition) {
            setSegments([initialPosition]);
            const initialDir = 'right';
            setDisplayDirection(initialDir);
            currentDirectionRef.current = initialDir;
            inputBufferRef.current = [];
        }
    }, [initialPosition]);

    const addInput = useCallback((newDirection: Direction) => {
        if (isRespawning || gameMode !== 'playing') return;

        const lastQueuedDirection = inputBufferRef.current.length > 0
            ? inputBufferRef.current[inputBufferRef.current.length - 1]
            : currentDirectionRef.current;

        const isOpposite =
            (newDirection === 'up' && lastQueuedDirection === 'down') ||
            (newDirection === 'down' && lastQueuedDirection === 'up') ||
            (newDirection === 'left' && lastQueuedDirection === 'right') ||
            (newDirection === 'right' && lastQueuedDirection === 'left');

        if (isOpposite && segments.length > 1) return;

        if (inputBufferRef.current.length < 2 && newDirection !== lastQueuedDirection) {
            inputBufferRef.current.push(newDirection);
            setDisplayDirection(newDirection);
        }
    }, [isRespawning, segments.length, gameMode]);

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
                currentDirectionRef.current = moveDirection; 

                const currentSegments = segmentsRef.current;
                if (currentSegments.length === 0) {
                     animationFrameIdRef.current = requestAnimationFrame(gameLoop);
                     return;
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

                if (onPositionUpdateRef.current) {
                    onPositionUpdateRef.current(newPredictedSegments, moveDirection);
                }
                
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
    }, [isRespawning, gridSize, tickMultiplier, gameMode]);

    return {
        segments,
        displayDirection,
        addInput,
        setSegments,
    };
};

export default useClientGameLoop;

