export interface Position { x: number; y: number; }
export type Direction = 'up' | 'down' | 'left' | 'right';

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

// Add other type definitions as needed...

export interface PlayerStateForClient {
  id: string;
  segments: Position[];
  direction: Direction;
  hue: number;
  size: number;
  isRespawning: boolean;
  isBoosting: boolean;
  selectedMapId?: string;
}

export interface GameStateData {
  players: PlayerStateForClient[];
  apple: Position;
  gridSize: number;
  gameMode: 'selection' | 'playing';
  currentMap: string; // Add current map
}
