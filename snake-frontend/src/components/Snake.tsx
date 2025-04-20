import React from 'react';

// --- Constants ---
const TRANSITION_DURATION_MS = 180; // Smoother transitions with longer duration

interface SnakeProps {
    segments: { x: number; y: number }[];
    hue: number; // Changed from color to hue
    gridSize: number;
}

const Snake: React.FC<SnakeProps> = ({ segments, hue, gridSize }) => {
    // Calculate the hue rotation needed.
    // Assumes the base image color corresponds to 0 degrees (or adjust baseHueOffset).
    const baseHueOffset = 0; // Adjust if your base image isn't red (0deg)
    const hueRotation = hue - baseHueOffset;

    return (
        <>
            {segments.map((segment, index) => {
                const isHead = index === 0;
                const imageUrl = isHead ? '/assets/snakehead.png' : '/assets/snakebody.png';

                // Style object for the container div
                const style: React.CSSProperties = {
                    left: `${(segment.x / gridSize) * 100}%`,
                    top: `${(segment.y / gridSize) * 100}%`,
                    width: `${(1 / gridSize) * 100}%`,
                    height: `${(1 / gridSize) * 100}%`,
                    // Smoother transition
                    transition: `left ${TRANSITION_DURATION_MS}ms ease-out, top ${TRANSITION_DURATION_MS}ms ease-out`,
                    position: 'absolute',
                    lineHeight: 0,
                    // Apply hue-rotate filter
                    filter: `hue-rotate(${hueRotation}deg)`,
                };

                // Style for the image itself
                const imgStyle: React.CSSProperties = {
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    imageRendering: 'pixelated',
                };

                return (
                    <div
                        key={index}
                        className="absolute"
                        style={style}
                    >
                        <img
                            src={imageUrl}
                            alt={isHead ? "Snake Head" : "Snake Body"}
                            style={imgStyle}
                        />
                    </div>
                );
            })}
        </>
    );
};

export default Snake;
