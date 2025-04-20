import { useState, useEffect, useRef, useCallback } from 'react';

interface Position { x: number; y: number; }
export type Direction = 'up' | 'down' | 'left' | 'right';

interface UseClientGameLoopProps {
    gridSize: number;
    apple: Position;
    tickRate: number;
}

interface ClientGameLoopState {
    segments: Position[];
    direction: Direction; // The direction the snake moved in the last tick
    requestedDirection: Direction; // The direction requested by the last input (for display)
    // No longer exposing requestedDirection state directly for movement logic
    addInput: (newDirection: Direction) => void;
    reset: () => void;
    appleEaten: boolean;
    gameOver: boolean;
}

export const useClientGameLoop = ({
    gridSize = 20,
    apple,
    tickRate = 200,
}: UseClientGameLoopProps): ClientGameLoopState => {
    // Snake state
    const [segments, setSegments] = useState<Position[]>([
        { x: 10, y: 10 },
        { x: 9, y: 10 },
        { x: 8, y: 10 }
    ]);
    const [direction, setDirection] = useState<Direction>('right');
    const [displayDirection, setDisplayDirection] = useState<Direction>('right'); // For UI display only
    const [appleEaten, setAppleEaten] = useState<boolean>(false);
    const [gameOver, setGameOver] = useState<boolean>(false);

    // Refs for internal state
    const currentDirectionRef = useRef<Direction>('right'); // Tracks the actual current direction of movement
    const inputBufferRef = useRef<Direction[]>([]); // Input buffer queue
    const gameLoopIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const appleEatenRef = useRef<boolean>(false);
    
    // Update the currentDirectionRef whenever the actual direction changes
    useEffect(() => {
        currentDirectionRef.current = direction;
    }, [direction]);
    
    // Reset game state
    const reset = useCallback(() => {
        setSegments([
            { x: 10, y: 10 },
            { x: 9, y: 10 },
            { x: 8, y: 10 }
        ]);
        setDirection('right');
        setDisplayDirection('right'); // Reset display state
        currentDirectionRef.current = 'right';
        inputBufferRef.current = []; // Clear the input buffer
        setAppleEaten(false);
        appleEatenRef.current = false;
        setGameOver(false);
    }, []);
    
    // Handle direction input - Add to buffer
    const addInput = useCallback((newDirection: Direction) => {
        if (gameOver) return;
        
        // Determine the last direction in the buffer, or the current direction if buffer is empty
        const lastQueuedDirection = inputBufferRef.current.length > 0
            ? inputBufferRef.current[inputBufferRef.current.length - 1]
            : currentDirectionRef.current;

        // Prevent adding opposite direction relative to the last queued/current direction
        const isOpposite =
            (newDirection === 'up' && lastQueuedDirection === 'down') ||
            (newDirection === 'down' && lastQueuedDirection === 'up') ||
            (newDirection === 'left' && lastQueuedDirection === 'right') ||
            (newDirection === 'right' && lastQueuedDirection === 'left');

        if (isOpposite && segments.length > 1) {
            return; 
        }

        // Add to buffer if buffer size < 2 and it's different from the last buffered input
        if (inputBufferRef.current.length < 2 && newDirection !== lastQueuedDirection) {
            inputBufferRef.current.push(newDirection);
            setDisplayDirection(newDirection); // Update display state with the latest input
        }
    }, [gameOver, segments.length]);
    
    // Game loop - main game mechanics
    useEffect(() => {
        // Don't start if game is over
        if (gameOver) {
            if (gameLoopIntervalRef.current) {
                clearInterval(gameLoopIntervalRef.current);
                gameLoopIntervalRef.current = null;
            }
            return;
        }
        
        // Clear any existing interval
        if (gameLoopIntervalRef.current) {
            clearInterval(gameLoopIntervalRef.current);
        }
        
        // Start a new game loop interval
        gameLoopIntervalRef.current = setInterval(() => {
            let moveDirection: Direction;

            // Determine direction for this tick: take from buffer or continue current direction
            if (inputBufferRef.current.length > 0) {
                moveDirection = inputBufferRef.current.shift()!; // Take the first direction from buffer
            } else {
                moveDirection = currentDirectionRef.current; // Continue current direction if buffer empty
            }

            // Update the actual direction state
            setDirection(moveDirection); 
            // currentDirectionRef is updated via its own useEffect dependency on `direction`

            // Update segments based on moveDirection
            setSegments(prevSegments => {
                if (prevSegments.length === 0) return prevSegments;
                
                // Update the head position based on moveDirection
                const head = prevSegments[0];
                const newHead = { ...head };
                
                switch (moveDirection) {
                    case 'up': newHead.y -= 1; break;
                    case 'down': newHead.y += 1; break;
                    case 'left': newHead.x -= 1; break;
                    case 'right': newHead.x += 1; break;
                }
                
                // Check for wall collision
                if (newHead.x < 0 || newHead.x >= gridSize || newHead.y < 0 || newHead.y >= gridSize) {
                    setGameOver(true);
                    inputBufferRef.current = []; // Clear buffer on death
                    return prevSegments;
                }
                
                // Check for self collision
                if (prevSegments.some(segment => segment.x === newHead.x && segment.y === newHead.y)) {
                    setGameOver(true);
                    inputBufferRef.current = []; // Clear buffer on death
                    return prevSegments;
                }
                
                // Create new segments array with new head
                let newSegments = [newHead, ...prevSegments];
                
                // Check if we've eaten an apple
                const ateApple = newHead.x === apple.x && newHead.y === apple.y;
                if (ateApple) {
                    setAppleEaten(true);
                    appleEatenRef.current = true;
                    
                    // Snake grows, so we don't remove the tail
                } else {
                    // If no apple was eaten, remove the tail
                    newSegments = newSegments.slice(0, -1);
                }
                
                return newSegments;
            });
            
            // Reset apple eaten flag after processing
            if (appleEatenRef.current) {
                setTimeout(() => {
                    setAppleEaten(false);
                    appleEatenRef.current = false;
                }, 0);
            }
        }, tickRate);
        
        // Clean up
        return () => {
            if (gameLoopIntervalRef.current) {
                clearInterval(gameLoopIntervalRef.current);
                gameLoopIntervalRef.current = null;
            }
        };
    }, [gameOver, apple, gridSize, tickRate, reset]); // Added reset dependency for safety, though unlikely needed here
    
    return {
        segments,
        direction, // Last applied direction
        requestedDirection: displayDirection, // Use displayDirection for the UI
        addInput,
        reset,
        appleEaten,
        gameOver, // Expose gameOver to the component
    };
};

export default useClientGameLoop;

