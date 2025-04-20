export interface Position {
  x: number;
  y: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Player {
  id: string;
  segments: Position[];
  direction: Direction;
  hue: number;
  size: number;
  isRespawning: boolean;
  isBoosting: boolean;
  selectedMapId?: string;
}

export interface GameMap {
  id: string;
  name: string;
  description: string;
  thumbnail: string;
}

export interface MapSelection {
  playerId: string;
  mapId: string;
}
