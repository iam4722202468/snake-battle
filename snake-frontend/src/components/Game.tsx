'use client';
import React, { useEffect, useState, useRef } from 'react';
import useClientGameLoop, { Direction } from '../hooks/useClientGameLoop';
import Snake from './Snake';
import Apple from './Apple';

interface Position { x: number; y: number; }

const DEFAULT_GRID_SIZE = 20;
const CLIENT_TICK_RATE = 200; // Increased from 100ms to 200ms for slower movement
const RESPAWN_COUNTDOWN = 3; // Seconds before restart after death

const Game: React.FC = () => {
    // Game state
    const [gridSize] = useState<number>(DEFAULT_GRID_SIZE);
    const [apple, setApple] = useState<Position>({ x: 10, y: 10 });
    const [score, setScore] = useState<number>(0);
    const [respawnCountdown, setRespawnCountdown] = useState<number | null>(null);
    const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
    
    // Game loop hook
    const {
        segments,
        direction, // Last applied direction
        requestedDirection, // Last requested direction
        addInput,
        reset: resetGame,
        appleEaten,
        gameOver
    } = useClientGameLoop({
        gridSize,
        apple,
        tickRate: CLIENT_TICK_RATE,
    });
    
    // Start countdown when game over is detected
    useEffect(() => {
        // Clear any existing interval when gameOver state changes
        if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
        }

        if (gameOver) {
            // Start the countdown only if it's not already running
            setRespawnCountdown(RESPAWN_COUNTDOWN); // Set initial countdown value

            countdownIntervalRef.current = setInterval(() => {
                setRespawnCountdown(prev => {
                    if (prev === null || prev <= 1) {
                        // When countdown reaches 1 (or is null), clear interval and reset
                        if (countdownIntervalRef.current) {
                            clearInterval(countdownIntervalRef.current);
                            countdownIntervalRef.current = null;
                        }
                        resetGame(); // Reset the game state in the hook
                        return null; // Clear the countdown display
                    }
                    return prev - 1; // Decrement countdown
                });
            }, 1000);
        } else {
            // If game is not over, ensure countdown is null
            setRespawnCountdown(null);
        }

        // Cleanup function to clear interval on unmount or when gameOver changes
        return () => {
            if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
                countdownIntervalRef.current = null;
            }
        };
    }, [gameOver, resetGame]); // Depend only on gameOver and resetGame
    
    // Handle apple eaten
    useEffect(() => {
        if (appleEaten) {
            // Generate new apple position
            let newApple: Position;
            do {
                newApple = {
                    x: Math.floor(Math.random() * gridSize),
                    y: Math.floor(Math.random() * gridSize)
                };
                // Make sure the apple doesn't spawn on the snake
            } while (segments.some(segment => segment.x === newApple.x && segment.y === newApple.y));
            
            setApple(newApple);
            setScore(prevScore => prevScore + 1);
        }
    }, [appleEaten, segments, gridSize]);
    
    // Handle keyboard input
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Don't handle input if game over or key is already being held down
            if (event.repeat || gameOver) return;
            
            // Determine direction from key
            let newDirection: Direction | null = null;
            switch (event.key) {
                case 'ArrowUp': case 'w': case 'W':
                    newDirection = 'up';
                    event.preventDefault(); // Prevent page scrolling
                    break;
                case 'ArrowDown': case 's': case 'S':
                    newDirection = 'down';
                    event.preventDefault(); // Prevent page scrolling
                    break;
                case 'ArrowLeft': case 'a': case 'A':
                    newDirection = 'left';
                    event.preventDefault(); // Prevent page scrolling
                    break;
                case 'ArrowRight': case 'd': case 'D':
                    newDirection = 'right';
                    event.preventDefault(); // Prevent page scrolling
                    break;
                default:
                    return; // Unknown key, do nothing
            }
            
            // If we got a valid direction, send it to the game loop
            if (newDirection) {
                addInput(newDirection);
            }
        };
        
        // Add key event listener
        window.addEventListener('keydown', handleKeyDown);
        
        // Clean up event listener on unmount
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [addInput, gameOver]);
    
    // Reset score when game restarts (triggered by resetGame which changes gameOver)
    useEffect(() => {
        if (!gameOver && score > 0) {
            // If the game is not over (meaning it just restarted) and score was > 0, reset score
            setScore(0);
        }
        // No dependency on segments.length needed here
    }, [gameOver, score]);
    
    // Determine game board size
    const gameBoardSize = 'min(80vw, 80vh)';

    return (
        <div className="flex flex-col items-center">
            <h1 className="text-3xl font-bold mb-2 text-gray-800 dark:text-gray-200">Snake Game</h1>
            
            {/* Game stats */}
            <div className="mb-2 flex items-center gap-4 text-sm">
                <p className="font-bold">Score: {score}</p>
                <p>Length: {segments.length}</p>
                <p>Input: <span className="font-mono uppercase">{requestedDirection}</span></p> 
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
                {/* Apple */}
                <Apple position={apple} gridSize={gridSize} />
                
                {/* Snake */}
                {segments.length > 0 && (
                    <Snake
                        segments={segments}
                        hue={120} // Green for the snake
                        gridSize={gridSize}
                    />
                )}
                
                {/* Game over overlay with countdown */}
                {gameOver && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-black/60 text-xl font-bold z-20">
                        <div>Game Over!</div>
                        <div className="text-2xl mt-2">Score: {score}</div>
                        {respawnCountdown !== null && respawnCountdown > 0 && ( // Only show countdown if > 0
                            <>
                                <div className="text-7xl mt-4 font-mono">{respawnCountdown}</div>
                                <div className="text-lg mt-4">Restarting in {respawnCountdown} {respawnCountdown === 1 ? 'second' : 'seconds'}...</div>
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
