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
  selectedMapId: string | null;
}

export interface GameMap {
  id: string;
  name: string;
  description: string;
  thumbnail: string;
  tunnels?: Tunnel[];
  teleporters?: Teleporter[];
}

export interface Tunnel {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  direction: 'horizontal' | 'vertical';
}

export interface Teleporter {
  id: number;
  position: Position;
  color: string;
  destination: number;
}

export interface MapSelection {
  playerId: string;
  mapId: string;
}
