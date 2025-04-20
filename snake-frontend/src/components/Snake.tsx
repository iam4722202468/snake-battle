import React from 'react';

// Adjust transition duration to be slightly less than the tick rate (200ms)
const TRANSITION_DURATION_MS = 180; // Increased from 80ms to 180ms

interface SnakeProps {
    segments: { x: number; y: number }[];
    hue: number;
    gridSize: number;
}

const Snake: React.FC<SnakeProps> = ({ segments, hue, gridSize }) => {
    const baseHueOffset = 0;
    const hueRotation = hue - baseHueOffset;

    return (
        <>
            {segments.map((segment, index) => {
                const isHead = index === 0;
                const imageUrl = isHead ? '/assets/snakehead.png' : '/assets/snakebody.png';
                const style: React.CSSProperties = {
                    left: `${(segment.x / gridSize) * 100}%`,
                    top: `${(segment.y / gridSize) * 100}%`,
                    width: `${(1 / gridSize) * 100}%`,
                    height: `${(1 / gridSize) * 100}%`,
                    transition: `left ${TRANSITION_DURATION_MS}ms linear, top ${TRANSITION_DURATION_MS}ms linear`, 
                    position: 'absolute',
                    lineHeight: 0,
                    filter: `hue-rotate(${hueRotation}deg)`,
                };
                const imgStyle: React.CSSProperties = {
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    imageRendering: 'pixelated',
                };
                return (
                    <div key={index} className="absolute" style={style}>
                        <img src={imageUrl} alt={isHead ? "Snake Head" : "Snake Body"} style={imgStyle} />
                    </div>
                );
            })}
        </>
    );
};

export default Snake;
