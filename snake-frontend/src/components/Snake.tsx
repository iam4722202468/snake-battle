import React, { useEffect, useState, useMemo } from 'react';

interface SnakeProps {
    segments: { x: number; y: number }[];
    hue: number;
    gridSize: number;
    isBoosting?: boolean;
    isTeleporting?: boolean;
    // Add props to better handle teleportation
    teleportOrigin?: {x: number, y: number} | null;
    teleportTarget?: {x: number, y: number} | null;
}

const Snake: React.FC<SnakeProps> = ({ 
    segments, 
    hue, 
    gridSize, 
    isBoosting = false,
    isTeleporting = false,
    teleportOrigin = null,
    teleportTarget = null
}) => {
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
    
    // Improved teleportation effects
    const segmentStyles = useMemo(() => {
        return segments.map((segment, index) => {
            const isHead = index === 0;
            let baseStyle: React.CSSProperties = {
                left: `${(segment.x / gridSize) * 100}%`,
                top: `${(segment.y / gridSize) * 100}%`,
                width: `${(1 / gridSize) * 100}%`,
                height: `${(1 / gridSize) * 100}%`,
                position: 'absolute',
                transition: `left ${isBoosting ? 160 : 180}ms linear, top ${isBoosting ? 160 : 180}ms linear`,
                zIndex: isHead ? 11 : 10 - Math.min(index, 9),
                willChange: 'transform, opacity, left, top',
            };
            
            // If actively teleporting, apply special effects
            if (isTeleporting) {
                const teleportDelay = index * 30; // Delay effect for each segment
                
                baseStyle = {
                    ...baseStyle,
                    transitionDuration: '250ms',
                    transitionTimingFunction: 'cubic-bezier(0.65, 0, 0.35, 1)',
                    opacity: index === 0 ? 1 : Math.max(0.4, 1 - index * 0.05),
                    filter: `hue-rotate(${hue}deg) brightness(${1.2 - index * 0.02}) saturate(${1.3})`,
                    transform: `scale(${isHead ? 1.15 : 1})`,
                    animation: `snake-segment-teleport 300ms ${teleportDelay}ms ease-in-out`,
                };
            } else if (isBoosting) {
                // Apply boosting effects
                const segmentHue = (colorCycle + index * 20) % 360;
                baseStyle = {
                    ...baseStyle,
                    filter: `hue-rotate(${segmentHue}deg) saturate(1.8) brightness(1.2)`,
                    transform: 'scale(1.05)',
                    boxShadow: '0 0 8px rgba(255,255,255,0.5)',
                };
            } else {
                // Normal state
                baseStyle = {
                    ...baseStyle,
                    filter: `hue-rotate(${hue}deg)`,
                };
            }
            
            return baseStyle;
        });
    }, [segments, gridSize, isBoosting, isTeleporting, hue, colorCycle]);

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
                        
                        {/* Teleport effect particles on head */}
                        {isHead && isTeleporting && (
                            <div className="absolute inset-0 z-20">
                                <div className="absolute inset-0 animate-ping bg-white rounded-full opacity-60"></div>
                                {Array.from({length: 6}).map((_, idx) => (
                                    <div 
                                        key={idx}
                                        className="absolute w-1 h-1 bg-white rounded-full animate-teleport-particle"
                                        style={{
                                            left: '50%',
                                            top: '50%',
                                            transform: `rotate(${idx * 60}deg) translateX(100%)`,
                                            opacity: 0.8,
                                            animationDelay: `${idx * 0.05}s`
                                        }}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </>
    );
};

export default Snake;
