export type DirAbs = "+X" | "+Y" | "-X" | "-Y" | "+Z" | "-Z";

export interface Vec3Dict {
  x: number;
  y: number;
  z: number;
}

export interface RotAbs {
  p: number;
  y: number;
  r: number;
}

export interface ExitLogic {
  Pos: Vector3;
  RotOffset: number;
  LocalRot: RotAbs;
  SpinDiff: number[];
}

export interface RailConfigItem {
  rowName: string;
  cnName?: string;
  enName?: string;
  diffBase: number;
  sizeRev: Vector3;
  exitsLogic: ExitLogic[];
  isEnd: boolean;
  isStart: boolean;
  isCheckpoint: boolean;
}

export interface OpenConnector {
  targetPos: Vector3;
  parentId: number;
  parentExitIdx: number;
  accumulatedDiff: number;
  parentRotIndex: number;
  parentRotAbs: RotAbs;
  spinDiffs: number[];
  parentExitRotOffset: number;
  parentExitLocalRot: RotAbs;
  forbiddenCandidates: Set<string>;
}

export interface RailInstance {
  railIndex: number;
  railId: string;
  posRev: Vector3;
  rotIndex: number;
  rotAbs: RotAbs;
  sizeRev: Vector3;
  diffAct: number;
  spinRot: number;
  prevIndex: number;
  nextIndices: number[];
  exitStatus: RailExitStatus[];
  forbiddenSiblings: Set<string>;
  occupiedCellsRev: Vector3[];
}

export interface RailExitStatus {
  Index: number;
  IsConnected: boolean;
  TargetID: number;
  WorldPos: Vec3Dict | null;
}

export interface BakedExit {
  Index: number;
  Exit_Pos_Rev: Vec3Dict;
  Exit_Pos_Abs: Vec3Dict;
  Exit_Rot_Abs: RotAbs;
  Exit_Dir_Abs: DirAbs;
  SpinDiff?: number[];
  IsConnected: boolean;
  TargetInstanceID: number;
}

export interface MazeRailJson {
  Rail_Index: number;
  Rail_ID: string;
  Pos_Rev: Vec3Dict;
  Pos_Abs: Vec3Dict;
  Rot_Abs: RotAbs;
  Dir_Abs: DirAbs;
  Size_Rev: Vec3Dict;
  Occupied_Cells_Rev: Vec3Dict[];
  Diff_Base: number;
  Diff_Act: number;
  Prev_Index: number;
  Next_Index: number[];
  Exit: BakedExit[];
}

export interface MazeLayout {
  MapMeta: {
    LevelName: string;
    RailCount: number;
    MazeDiff: number;
    CheckpointCount?: number;
    SegmentDiffs?: number[];
    SpinCount?: number;
    MaxSpins?: number;
    Seed?: string;
  };
  Rail: MazeRailJson[];
}

export interface GeneratorOptions {
  targetDifficulty: number;
  targetCheckpoints: number;
  maxSpins: number;
  boundaryMode: 0 | 1;
  bounds: Vector3;
  seed?: number;
}

export interface GenerationLogEntry {
  kind: "info" | "success" | "warn" | "fail";
  message: string;
}

export class Vector3 {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
  ) {}

  toDict(): Vec3Dict {
    return { x: this.x, y: this.y, z: this.z };
  }

  toWorldDict(scale: number): Vec3Dict {
    const clean = (value: number) => (Object.is(value, -0) ? 0 : value);
    return {
      x: clean(Number((this.x * scale).toFixed(8))),
      y: clean(Number((this.y * scale).toFixed(8))),
      z: clean(Number((this.z * scale).toFixed(8))),
    };
  }

  asTuple(): [number, number, number] {
    return [this.x, this.y, this.z];
  }

  add(other: Vector3): Vector3 {
    return new Vector3(this.x + other.x, this.y + other.y, this.z + other.z);
  }

  rotateZ(rotIndex: number): Vector3 {
    let rx = this.x;
    let ry = this.y;
    for (let i = 0; i < ((rotIndex % 4) + 4) % 4; i += 1) {
      [rx, ry] = [-ry, rx];
    }
    return new Vector3(rx, ry, this.z);
  }

  rotateX(rotIndex: number): Vector3 {
    let ry = this.y;
    let rz = this.z;
    for (let i = 0; i < ((rotIndex % 4) + 4) % 4; i += 1) {
      [ry, rz] = [-rz, ry];
    }
    return new Vector3(this.x, ry, rz);
  }

  rotateY(rotIndex: number): Vector3 {
    let rx = this.x;
    let rz = this.z;
    for (let i = 0; i < ((rotIndex % 4) + 4) % 4; i += 1) {
      [rx, rz] = [-rz, rx];
    }
    return new Vector3(rx, this.y, rz);
  }

  clone(): Vector3 {
    return new Vector3(this.x, this.y, this.z);
  }
}
