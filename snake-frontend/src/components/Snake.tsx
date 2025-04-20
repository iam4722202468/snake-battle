import React, { useEffect, useState, useMemo } from 'react';

interface SnakeProps {
    segments: { x: number; y: number }[];
    hue: number;
    gridSize: number;
    isBoosting?: boolean;
}

const Snake: React.FC<SnakeProps> = ({ 
    segments, 
    hue, 
    gridSize, 
    isBoosting = false,
}) => {
    const [colorCycle, setColorCycle] = useState(0);

    useEffect(() => {
        if (!isBoosting) return;
        
        const intervalId = setInterval(() => {
            setColorCycle(prev => (prev + 5) % 360);
        }, 33);
        
        return () => clearInterval(intervalId);
    }, [isBoosting]);
    
    const segmentStyles = useMemo(() => {
        return segments.map((segment, index) => {
            const isHead = index === 0;
            let baseStyle: React.CSSProperties = {
                left: `${(segment.x / gridSize) * 100}%`,
                top: `${(segment.y / gridSize) * 100}%`,
                width: `${(1 / gridSize) * 100}%`,
                height: `${(1 / gridSize) * 100}%`,
                position: 'absolute',
                transition: `left ${isBoosting ? 160 : 180}ms linear, top ${isBoosting ? 160 : 180}ms linear, filter 100ms linear, transform 100ms linear`, 
                zIndex: isHead ? 11 : 10 - Math.min(index, 9),
                willChange: 'transform, filter, left, top',
            };
            
            if (isBoosting) {
                const segmentHue = (colorCycle + index * 20) % 360;
                baseStyle = {
                    ...baseStyle,
                    filter: `hue-rotate(${segmentHue}deg) saturate(1.8) brightness(1.2)`,
                    transform: 'scale(1.05)',
                };
            } else {
                baseStyle = {
                    ...baseStyle,
                    filter: `hue-rotate(${hue}deg)`,
                    transform: 'scale(1)',
                };
            }
            
            return baseStyle;
        });
    }, [segments, gridSize, isBoosting, hue, colorCycle]);

    return (
        <>
            {segments.map((segment, index) => {
                const isHead = index === 0;
                const imageUrl = isHead ? '/assets/snakehead.png' : '/assets/snakebody.png';
                
                return (
                    <div 
                        key={index} 
                        style={segmentStyles[index]}
                        className={`absolute ${isHead ? 'z-11' : ''}`}
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
