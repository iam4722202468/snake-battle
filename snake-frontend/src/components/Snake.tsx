import React, { useEffect, useState } from 'react';

// Adjust transition duration to be slightly less than the tick rate (200ms)
const TRANSITION_DURATION_MS = 180; // Increased from 80ms to 180ms

interface SnakeProps {
    segments: { x: number; y: number }[];
    hue: number;
    gridSize: number;
    isBoosting?: boolean; // Add boosting prop
}

const Snake: React.FC<SnakeProps> = ({ segments, hue, gridSize, isBoosting = false }) => {
    // Add color cycling with animation frame for smooth transitions
    const [colorCycleOffset, setColorCycleOffset] = useState(0);
    
    // Use an effect to animate color cycling when boosting
    useEffect(() => {
        if (!isBoosting) return;
        
        let animationFrameId: number;
        let lastTimestamp: number;
        
        // Animate at 60fps for smooth color cycling
        const animateColors = (timestamp: number) => {
            if (!lastTimestamp) lastTimestamp = timestamp;
            const elapsed = timestamp - lastTimestamp;
            
            // Update color cycle - adjust speed value (10) to control cycle speed
            setColorCycleOffset(prev => (prev + elapsed * 0.3) % 360);
            
            lastTimestamp = timestamp;
            animationFrameId = requestAnimationFrame(animateColors);
        };
        
        animationFrameId = requestAnimationFrame(animateColors);
        
        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, [isBoosting]);
    
    return (
        <>
            {segments.map((segment, index) => {
                const isHead = index === 0;
                const imageUrl = isHead ? '/assets/snakehead.png' : '/assets/snakebody.png';
                
                // Calculate hue for this segment
                let segmentHue = hue;
                
                if (isBoosting) {
                    // Create a vibrant, flashing color effect
                    // Base hue alternates through the spectrum rapidly
                    const baseHue = (colorCycleOffset + index * 20) % 360;
                    segmentHue = baseHue;
                }
                
                const style: React.CSSProperties = {
                    left: `${(segment.x / gridSize) * 100}%`,
                    top: `${(segment.y / gridSize) * 100}%`,
                    width: `${(1 / gridSize) * 100}%`,
                    height: `${(1 / gridSize) * 100}%`,
                    // Faster transition when boosting
                    transition: `left ${isBoosting ? TRANSITION_DURATION_MS * 0.6 : TRANSITION_DURATION_MS}ms linear, 
                                top ${isBoosting ? TRANSITION_DURATION_MS * 0.6 : TRANSITION_DURATION_MS}ms linear`,
                    position: 'absolute',
                    lineHeight: 0,
                    filter: `hue-rotate(${segmentHue}deg) ${isBoosting ? 'saturate(2) brightness(1.2)' : ''}`,
                    // Optional: add slight pulse effect when boosting
                    transform: isBoosting ? `scale(${1 + Math.sin(colorCycleOffset / 50) * 0.05})` : 'scale(1)',
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
