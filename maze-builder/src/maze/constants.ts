import { Vector3 } from "./types";

export const GRID_TO_WORLD_SCALE = 16;

export const DEFAULT_GENERATOR_OPTIONS = {
  targetDifficulty: 15,
  targetCheckpoints: 0,
  maxSpins: 0,
  boundaryMode: 0 as const,
  bounds: new Vector3(7, 7, 7),
};
