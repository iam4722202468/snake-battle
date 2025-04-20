import React, { useEffect, useState, useMemo } from 'react';

// Adjust transition duration to be slightly less than the tick rate (200ms)
const TRANSITION_DURATION_MS = 180; // Increased from 80ms to 180ms

interface SnakeProps {
    segments: { x: number; y: number }[];
    hue: number;
    gridSize: number;
    isBoosting?: boolean; // Add boosting prop
}

const Snake: React.FC<SnakeProps> = ({ segments, hue, gridSize, isBoosting = false }) => {
    // Use a more efficient approach for color cycling
    const [colorCycle, setColorCycle] = useState(0);
    
    // Memoize segment colors to reduce calculations
    const segmentColors = useMemo(() => {
        if (!isBoosting) return null;
        
        // Precalculate colors for all segments when boosting state changes
        return segments.map((_, index) => {
            return (colorCycle + index * 20) % 360;
        });
    }, [segments.length, colorCycle, isBoosting]);
    
    // Update color cycle less frequently (30fps instead of 60fps)
    useEffect(() => {
        if (!isBoosting) return;
        
        const intervalId = setInterval(() => {
            setColorCycle(prev => (prev + 5) % 360); // Increment by larger steps
        }, 33); // ~30fps
        
        return () => clearInterval(intervalId);
    }, [isBoosting]);
    
    return (
        <>
            {segments.map((segment, index) => {
                const isHead = index === 0;
                const imageUrl = isHead ? '/assets/snakehead.png' : '/assets/snakebody.png';
                
                // Use precalculated colors when boosting
                const segmentHue = isBoosting && segmentColors 
                    ? segmentColors[index]
                    : hue;
                
                const style = {
                    left: `${(segment.x / gridSize) * 100}%`,
                    top: `${(segment.y / gridSize) * 100}%`,
                    width: `${(1 / gridSize) * 100}%`,
                    height: `${(1 / gridSize) * 100}%`,
                    transition: `left ${isBoosting ? 160 : 180}ms linear, top ${isBoosting ? 160 : 180}ms linear`,
                    position: 'absolute' as const,
                    lineHeight: 0,
                    filter: `hue-rotate(${segmentHue}deg) ${isBoosting ? 'saturate(2) brightness(1.2)' : ''}`,
                    // Simpler transform without sine calculation for better performance
                    transform: isBoosting ? 'scale(1.05)' : 'scale(1)',
                    willChange: 'left, top, filter', // Hint to browser to optimize these properties
                };
                
                return (
                    <div 
                        key={index} 
                        className={`absolute ${isBoosting ? 'z-10' : ''}`}
                        style={style}
                    >
                        <img 
                            src={imageUrl} 
                            alt={isHead ? "Snake Head" : "Snake Body"} 
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                imageRendering: 'pixelated',
                            }} 
                        />
                    </div>
                );
            })}
        </>
    );
};

export default Snake;
