import React from 'react';

interface AppleProps {
    position: { x: number; y: number };
    gridSize: number;
}

const Apple: React.FC<AppleProps> = ({ position, gridSize }) => {
    const style: React.CSSProperties = {
        left: `${(position.x / gridSize) * 100}%`,
        top: `${(position.y / gridSize) * 100}%`,
        width: `${(1 / gridSize) * 100}%`,
        height: `${(1 / gridSize) * 100}%`,
        position: 'absolute',
        objectFit: 'contain',
        imageRendering: 'pixelated',
    };
    return <img src="/assets/coin.png" alt="Coin" className="absolute" style={style} />;
};

export default Apple;
