import React from 'react';
import { Tunnel, Teleporter } from '../types/gameTypes';

interface TunnelsProps {
  tunnels: Tunnel[];
  gridSize: number;
}

interface TeleportersProps {
  teleporters: Teleporter[];
  gridSize: number;
  activeEffect?: { from: number, to: number } | null;
}

export const Tunnels: React.FC<TunnelsProps> = ({ tunnels, gridSize }) => {
  return (
    <>
      {tunnels.map((tunnel, index) => {
        const isHorizontal = tunnel.direction === 'horizontal';
        const startX = tunnel.startX / gridSize * 100;
        const startY = tunnel.startY / gridSize * 100;
        const endX = (tunnel.endX + 1) / gridSize * 100; // +1 to include end cell
        const endY = (tunnel.endY + 1) / gridSize * 100;
        
        const width = isHorizontal 
          ? `${endX - startX}%` 
          : `${1 / gridSize * 100}%`;
          
        const height = isHorizontal 
          ? `${1 / gridSize * 100}%` 
          : `${endY - startY}%`;
        
        return (
          <div 
            key={index}
            className="absolute bg-gray-700/40 border border-gray-600 z-5"
            style={{
              left: `${startX}%`,
              top: `${startY}%`,
              width,
              height,
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
              borderRadius: '4px'
            }}
          />
        );
      })}
    </>
  );
};

export const Teleporters: React.FC<TeleportersProps> = ({ teleporters, gridSize, activeEffect = null }) => {
  return (
    <>
      {teleporters.map((teleporter) => {
        const x = teleporter.position.x / gridSize * 100;
        const y = teleporter.position.y / gridSize * 100;
        const size = 1 / gridSize * 100;
        
        // Check if this teleporter is active in the current effect
        const isSource = activeEffect && activeEffect.from === teleporter.id;
        const isDestination = activeEffect && activeEffect.to === teleporter.id;
        const isActive = isSource || isDestination;
        
        // Find the paired teleporter
        const pairedWith = teleporters.find(t => t.id === teleporter.destination);
        const pairDirection = pairedWith ? {
          x: pairedWith.position.x - teleporter.position.x,
          y: pairedWith.position.y - teleporter.position.y
        } : null;
        
        // Determine direction indicators for teleporter
        let directionIndicator = null;
        if (pairDirection) {
          // Normalize direction to show where this teleporter leads
          const angle = Math.atan2(pairDirection.y, pairDirection.x) * (180 / Math.PI);
          directionIndicator = (
            <div 
              className="absolute w-1/3 h-1/3"
              style={{
                transform: `rotate(${angle}deg)`,
                animation: isActive ? 'pulse 0.5s infinite' : 'none'
              }}
            >
              <div className="w-full h-0.5 bg-white absolute top-1/2 left-0 transform -translate-y-1/2"></div>
              <div className="w-0 h-0 absolute right-0 top-1/2 transform -translate-y-1/2 border-t-4 border-b-4 border-r-0 border-l-4 border-transparent border-l-white"></div>
            </div>
          );
        }
        
        return (
          <div 
            key={teleporter.id}
            className="absolute flex items-center justify-center z-10"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              width: `${size}%`,
              height: `${size}%`,
              transition: 'all 0.3s'
            }}
          >
            {/* Portal particles */}
            <div className="absolute w-full h-full">
              {isActive && Array.from({length: 8}).map((_, idx) => (
                <div 
                  key={idx}
                  className="absolute w-1 h-1 bg-white rounded-full animate-portal-particle"
                  style={{
                    left: `${50}%`,
                    top: `${50}%`,
                    opacity: 0.7,
                    transform: `rotate(${idx * 45}deg)`,
                    animation: `portal-particle 1s infinite ${idx * 0.1}s ease-out`,
                    animationDuration: isSource ? '0.6s' : '0.8s'
                  }}
                />
              ))}
            </div>
            
            {/* Base teleporter */}
            <div 
              className={`absolute w-full h-full rounded-full transition-all duration-300 ${isActive ? 'animate-pulse' : ''}`}
              style={{
                backgroundColor: teleporter.color,
                boxShadow: `0 0 ${isActive ? '15px 10px' : '8px 4px'} ${teleporter.color}`,
                opacity: isActive ? 1 : 0.85,
                transform: isActive ? 'scale(1.1)' : 'scale(1)'
              }}
            >
              {/* Swirling effect */}
              <div 
                className="absolute inset-2 rounded-full animate-spin pointer-events-none opacity-75"
                style={{
                  background: `conic-gradient(transparent, ${teleporter.color}, transparent)`,
                  animationDuration: isActive ? '0.8s' : '2s',
                  animationDirection: isSource ? 'normal' : 'reverse'
                }}
              />
            </div>
            
            {/* Direction indicator */}
            {directionIndicator}
            
            {/* Teleporter ID */}
            <span className={`text-white font-bold text-[0.7rem] drop-shadow-md z-20`}>
              {teleporter.id}
            </span>
          </div>
        );
      })}
    </>
  );
};
