import { GameMap } from '../types/gameTypes';

export const availableMaps: GameMap[] = [
  {
    id: 'classic',
    name: 'Classic Arena',
    description: 'The original Snake experience with no obstacles',
    thumbnail: '/assets/maps/classic.png'
  },
  {
    id: 'tunnels',
    name: 'Tunnels',
    description: 'Pass through tunnels to avoid collisions',
    thumbnail: '/assets/maps/tunnels.png',
    tunnels: [
      // Horizontal tunnels
      { startX: 5, startY: 5, endX: 8, endY: 5, direction: 'horizontal' },
      { startX: 12, startY: 12, endX: 15, endY: 12, direction: 'horizontal' },
      // Vertical tunnels
      { startX: 5, startY: 12, endX: 5, endY: 15, direction: 'vertical' },
      { startX: 15, startY: 5, endX: 15, endY: 8, direction: 'vertical' },
    ]
  },
  {
    id: 'teleporters',
    name: 'Teleporters',
    description: 'Travel through colored teleporters',
    thumbnail: '/assets/maps/teleporters.png',
    teleporters: [
      // Red teleporter pair
      { id: 1, position: { x: 5, y: 5 }, color: '#FF0000', destination: 2 },
      { id: 2, position: { x: 15, y: 15 }, color: '#FF0000', destination: 1 },
      
      // Blue teleporter pair
      { id: 3, position: { x: 5, y: 15 }, color: '#0000FF', destination: 4 },
      { id: 4, position: { x: 15, y: 5 }, color: '#0000FF', destination: 3 },
      
      // Green teleporter pair
      { id: 5, position: { x: 10, y: 3 }, color: '#00FF00', destination: 6 },
      { id: 6, position: { x: 10, y: 17 }, color: '#00FF00', destination: 5 },
    ]
  }
];

export const getMapById = (id: string): GameMap | undefined => {
  return availableMaps.find(map => map.id === id);
};
