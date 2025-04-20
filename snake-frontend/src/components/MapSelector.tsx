import React, { useState } from 'react';
import { availableMaps } from '../data/maps';
import { Player } from '../types/gameTypes';

interface PlayerAvatar {
  id: string;
  hue: number;
}

interface MapSelectorProps {
  clientId: string | null;
  players: Player[];
  selectedMapId: string | null;
  onSelectMap: (mapId: string) => void;
  onPlayNow: () => void;
}

const MapSelector: React.FC<MapSelectorProps> = ({ 
  clientId, 
  players, 
  selectedMapId, 
  onSelectMap,
  onPlayNow
}) => {
  // Track which images failed to load to avoid repeated requests
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  
  // Group players by their selected maps
  const playersByMap: Record<string, PlayerAvatar[]> = {};
  
  players.forEach(player => {
    if (player.selectedMapId) {
      if (!playersByMap[player.selectedMapId]) {
        playersByMap[player.selectedMapId] = [];
      }
      playersByMap[player.selectedMapId].push({
        id: player.id,
        hue: player.hue
      });
    }
  });

  // Get a fallback image for maps without thumbnails
  const getMapImage = (map: { id: string; thumbnail: string }) => {
    // If we already know this image failed, use a colored placeholder
    if (failedImages[map.thumbnail]) {
      return null;
    }
    return map.thumbnail;
  };

  const handleImageError = (mapId: string, thumbnail: string) => {
    // Mark this image as failed to prevent further attempts
    setFailedImages(prev => ({ ...prev, [thumbnail]: true }));
    console.log(`Image ${thumbnail} failed to load for map ${mapId}`);
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-4 text-center">Select a Map</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {availableMaps.map(map => {
          const isSelected = selectedMapId === map.id;
          const mapPlayers = playersByMap[map.id] || [];
          const mapImage = getMapImage(map);
          
          return (
            <div 
              key={map.id}
              className={`border-2 rounded-lg overflow-hidden cursor-pointer transition-all
                ${isSelected ? 'border-blue-500 shadow-lg scale-105' : 'border-gray-300 hover:border-blue-300'}`}
              onClick={() => onSelectMap(map.id)}
            >
              {/* Map thumbnail or colored placeholder */}
              <div className="relative h-40 bg-gray-100">
                {mapImage ? (
                  <img 
                    src={mapImage} 
                    alt={map.name}
                    className="w-full h-full object-cover"
                    onError={() => handleImageError(map.id, map.thumbnail)}
                  />
                ) : (
                  <div 
                    className="w-full h-full flex items-center justify-center"
                    style={{ 
                      backgroundColor: `hsl(${(map.id.charCodeAt(0) * 40) % 360}, 70%, 85%)`,
                    }}
                  >
                    <span className="text-lg font-semibold text-gray-800">{map.name}</span>
                  </div>
                )}
                
                {/* Player avatars */}
                <div className="absolute bottom-2 left-2 flex -space-x-2">
                  {mapPlayers.map(player => (
                    <div 
                      key={player.id}
                      className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${player.id === clientId ? 'border-white' : 'border-gray-200'}`}
                      style={{ 
                        backgroundColor: `hsl(${player.hue}, 70%, 50%)`,
                        zIndex: player.id === clientId ? 10 : 'auto'
                      }}
                      title={player.id === clientId ? 'You' : `Player ${player.id}`}
                    >
                      {player.id === clientId && (
                        <span className="text-xs text-white font-bold">You</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Map info */}
              <div className="p-3">
                <h3 className="font-bold">{map.name}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">{map.description}</p>
                
                {/* Player count */}
                <div className="flex items-center mt-2 text-xs text-gray-500">
                  <span>
                    {mapPlayers.length} player{mapPlayers.length !== 1 ? 's' : ''} selected
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      <div className="mt-6 text-center">
        <button 
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
          disabled={!selectedMapId}
          onClick={onPlayNow}
          title={!selectedMapId ? "You must select a map first" : "Start the game with the selected map"}
        >
          Start Game For Everyone
        </button>
        <p className="mt-2 text-xs text-gray-500">This will start the game for all connected players</p>
      </div>
    </div>
  );
};

export default MapSelector;
