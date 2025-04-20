import React, { useEffect, useState, useMemo } from 'react';

interface SnakeProps {
    segments: { x: number; y: number }[];
    hue: number;
    gridSize: number;
    isBoosting?: boolean;
}

const Snake: React.FC<SnakeProps> = ({ segments, hue, gridSize, isBoosting = false }) => {
    // Use reduced update frequency for color cycling to improve performance
    const [colorCycle, setColorCycle] = useState(0);
    
    // Precalculate segment colors when boosting to avoid recalculation during rendering
    const segmentColors = useMemo(() => {
        if (!isBoosting) return null;
        return segments.map((_, index) => (colorCycle + index * 20) % 360);
    }, [segments.length, colorCycle, isBoosting]);
    
    // Update color cycle at 30fps to reduce CPU usage
    useEffect(() => {
        if (!isBoosting) return;
        
        const intervalId = setInterval(() => {
            setColorCycle(prev => (prev + 5) % 360);
        }, 33);
        
        return () => clearInterval(intervalId);
    }, [isBoosting]);
    
    return (
        <>
            {segments.map((segment, index) => {
                const isHead = index === 0;
                const imageUrl = isHead ? '/assets/snakehead.png' : '/assets/snakebody.png';
                
                // Use precalculated color for this segment when boosting
                const segmentHue = isBoosting && segmentColors 
                    ? segmentColors[index]
                    : hue;
                
                // Optimize rendering performance with hardware accelerated properties
                const style = {
                    left: `${(segment.x / gridSize) * 100}%`,
                    top: `${(segment.y / gridSize) * 100}%`,
                    width: `${(1 / gridSize) * 100}%`,
                    height: `${(1 / gridSize) * 100}%`,
                    transition: `left ${isBoosting ? 160 : 180}ms linear, top ${isBoosting ? 160 : 180}ms linear`,
                    position: 'absolute' as const,
                    lineHeight: 0,
                    filter: `hue-rotate(${segmentHue}deg) ${isBoosting ? 'saturate(2) brightness(1.2)' : ''}`,
                    transform: isBoosting ? 'scale(1.05)' : 'scale(1)',
                    willChange: 'left, top, filter',
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
