import { GameMap } from '../types/gameTypes';

export const availableMaps: GameMap[] = [
  {
    id: 'classic',
    name: 'Classic Arena',
    description: 'The original Snake experience with no obstacles',
    thumbnail: '/assets/maps/classic.png'
  },
  {
    id: 'obstacles',
    name: 'Obstacle Course',
    description: 'Navigate through a maze of walls',
    thumbnail: '/assets/maps/obstacles.png'
  },
  {
    id: 'islands',
    name: 'Island Hopping',
    description: 'Small islands connected by narrow paths',
    thumbnail: '/assets/maps/islands.png'
  },
  {
    id: 'speedway',
    name: 'Speedway',
    description: 'Designed for fast-paced boosting action',
    thumbnail: '/assets/maps/speedway.png'
  }
];

export const getMapById = (id: string): GameMap | undefined => {
  return availableMaps.find(map => map.id === id);
};
