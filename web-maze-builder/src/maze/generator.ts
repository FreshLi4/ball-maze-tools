import { DEFAULT_GENERATOR_OPTIONS, GRID_TO_WORLD_SCALE } from "./constants";
import { SeededRandom } from "./random";
import {
  DirAbs,
  GenerationLogEntry,
  GeneratorOptions,
  MazeLayout,
  OpenConnector,
  RailConfigItem,
  RailInstance,
  RotAbs,
  Vector3,
} from "./types";

type CellKey = `${number},${number},${number}`;

function keyOf(cell: [number, number, number]): CellKey {
  return `${cell[0]},${cell[1]},${cell[2]}`;
}

function cloneRot(rot: RotAbs): RotAbs {
  return { p: rot.p, y: rot.y, r: rot.r };
}

function mod360(value: number): number {
  return ((value % 360) + 360) % 360;
}

function boundRadius(size: number): number {
  return Math.max(0, Math.floor((size - 1) / 2));
}

function rotIndexFromDegrees(degrees: number): number {
  return Math.trunc(degrees / 90) % 4;
}

export function transformByRotAbs(vec: Vector3, rotAbs: RotAbs): Vector3 {
  return vec
    .rotateX(rotIndexFromDegrees(rotAbs.r))
    .rotateY(rotIndexFromDegrees(rotAbs.p))
    .rotateZ(rotIndexFromDegrees(rotAbs.y));
}

function sameVector(a: Vector3, b: Vector3): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

export function composeRotAbs(parent: RotAbs, local: RotAbs): RotAbs {
  const basis = [
    new Vector3(1, 0, 0),
    new Vector3(0, 1, 0),
    new Vector3(0, 0, 1),
  ];
  const target = basis.map((vec) => transformByRotAbs(transformByRotAbs(vec, local), parent));

  for (const p of [0, 90, 180, 270]) {
    for (const y of [0, 90, 180, 270]) {
      for (const r of [0, 90, 180, 270]) {
        const candidate = { p, y, r };
        const matches = basis.every((vec, index) => sameVector(transformByRotAbs(vec, candidate), target[index]));
        if (matches) return candidate;
      }
    }
  }

  throw new Error(`Unable to compose rotations parent=${JSON.stringify(parent)} local=${JSON.stringify(local)}`);
}

export function forwardDirFromRotAbs(rotAbs: RotAbs): DirAbs {
  return dirFromVector(transformByRotAbs(new Vector3(1, 0, 0), rotAbs));
}

function dirFromVector(vec: Vector3): DirAbs {
  const values = [
    { dir: "+X" as const, value: vec.x },
    { dir: "-X" as const, value: -vec.x },
    { dir: "+Y" as const, value: vec.y },
    { dir: "-Y" as const, value: -vec.y },
    { dir: "+Z" as const, value: vec.z },
    { dir: "-Z" as const, value: -vec.z },
  ];
  return values.reduce((best, item) => (item.value > best.value ? item : best)).dir;
}

export function exitDirFromLocalRot(railRotAbs: RotAbs, exitLocalRot: RotAbs): DirAbs {
  const localExitForward = transformByRotAbs(new Vector3(1, 0, 0), exitLocalRot);
  return dirFromVector(transformByRotAbs(localExitForward, railRotAbs));
}

const RIGHT_HANDED_L90_MODEL_OVERRIDES = new Set([
  "BP_Curve_L90_X4_Y4_Z1_Rail",
  "BP_Curve_L90_Borderless_O_X2_Y2_Z1_Rail",
]);

function horizontalModelSideOverride(railId: string): "left" | "right" | null {
  if (RIGHT_HANDED_L90_MODEL_OVERRIDES.has(railId)) return "right";
  return null;
}

export function calculateOccupiedCells(
  railId: string,
  pos: Vector3,
  size: Vector3,
  rotIdx: number,
  rollIdx = 0,
): [number, number, number][] {
  return calculateOccupiedCellsWithRotAbs(railId, pos, size, { p: 0, y: rotIdx * 90, r: rollIdx * 90 });
}

export function calculateOccupiedCellsWithRotAbs(
  railId: string,
  pos: Vector3,
  size: Vector3,
  rotAbs: RotAbs,
): [number, number, number][] {
  return calculateLocalOccupiedCells(railId, size).map((cell) => {
    const rotated = transformByRotAbs(cell, rotAbs);
    return [pos.x + rotated.x, pos.y + rotated.y, pos.z + rotated.z];
  });
}

export function localOccupiedCellsForConfig(config: RailConfigItem): Vector3[] {
  if (config.localOccupiedCells?.length) return config.localOccupiedCells.map((cell) => cell.clone());
  return calculateLocalOccupiedCells(config.rowName, config.sizeRev);
}

export function calculateOccupiedCellsForConfig(
  config: RailConfigItem,
  pos: Vector3,
  rotAbs: RotAbs,
): [number, number, number][] {
  return localOccupiedCellsForConfig(config).map((cell) => {
    const rotated = transformByRotAbs(cell, rotAbs);
    return [pos.x + rotated.x, pos.y + rotated.y, pos.z + rotated.z];
  });
}

export function calculateLocalOccupiedCells(railId: string, size: Vector3): Vector3[] {
  let yMin = 0;
  let yMax = 0;
  let zMin = 0;
  let zMax = 0;
  const rid = railId.toUpperCase();
  const horizontalOverride = horizontalModelSideOverride(railId);

  if (horizontalOverride === "right") {
    yMax = size.y - 1;
  } else if (horizontalOverride === "left") {
    yMin = -(size.y - 1);
  } else if (rid.includes("_L90_") || rid.includes("_FL90_")) {
    yMin = -(size.y - 1);
  } else if (rid.includes("_R90_") || rid.includes("_FR90_")) {
    yMax = size.y - 1;
  } else if (rid.includes("_T_") || rid.includes("_CR_")) {
    yMin = -(size.y - 1);
    yMax = size.y - 1;
  }

  if (rid.includes("_U90_") || rid.includes("_FU_")) {
    zMax = size.z - 1;
  } else if (rid.includes("_D90_") || rid.includes("_FD_")) {
    zMin = -(size.z - 1);
  }

  const cells: Vector3[] = [];
  for (let lx = 0; lx < size.x; lx += 1) {
    for (let ly = yMin; ly <= yMax; ly += 1) {
      for (let lz = zMin; lz <= zMax; lz += 1) {
        cells.push(new Vector3(lx, ly, lz));
      }
    }
  }

  return cells;
}

export class MazeGenerator {
  readonly logs: GenerationLogEntry[] = [];
  readonly options: GeneratorOptions;
  placedRails: RailInstance[] = [];
  occupiedCells = new Map<CellKey, number>();
  openList: OpenConnector[] = [];
  currentTotalDifficulty = 0;
  backtrackCount = 0;
  usedSpinCount = 0;
  private globalIndexCounter = 0;
  private placedCheckpointsCount = 0;
  private segmentDiffAcc = 0;
  private segmentDiffs: number[] = [];
  private random: SeededRandom;
  private globalBounds?: [number, number, number, number, number, number];

  constructor(
    private configMap: Map<string, RailConfigItem>,
    options: Partial<GeneratorOptions> = {},
  ) {
    this.options = { ...DEFAULT_GENERATOR_OPTIONS, ...options };
    this.random = new SeededRandom(this.options.seed);
  }

  generate(): MazeLayout {
    this.log(
      "info",
      `Start Generating... Target Diff: ${this.options.targetDifficulty}, Target Rails: ${this.targetRailCount()}, Avg Diff: ${this.targetAverageDifficulty().toFixed(2)}`,
    );
    const startCandidates = [...this.configMap.values()].filter((item) => item.isStart);
    if (startCandidates.length === 0) throw new Error("No Start Rail defined.");

    const start = this.random.choice(startCandidates);
    const radiusX = boundRadius(this.options.bounds.x);
    const radiusY = boundRadius(this.options.bounds.y);
    const minX = -radiusX;
    const maxX = radiusX - start.sizeRev.x + 1;
    const minY = -radiusY;
    const maxY = radiusY - start.sizeRev.y + 1;
    const startPos = new Vector3(this.random.int(Math.min(minX, maxX), Math.max(minX, maxX)), this.random.int(Math.min(minY, maxY), Math.max(minY, maxY)), 0);

    const startRotAbs = { p: 0, y: 0, r: 0 };
    const startResult = this.placeRailV2(start.rowName, startPos, 0, startRotAbs, 0, 1, -1, 0);
    if (typeof startResult === "string") {
      throw new Error(`Start Rail Placement Failed: ${startResult}, pos=${this.formatVec(startPos)}, rot=${this.formatRot(startRotAbs)}`);
    }
    this.log("success", `Start: ${start.rowName}, ${this.formatRailPose(startResult)}`);

    const checkpointTarget = Math.max(0, Math.floor(this.options.targetCheckpoints));
    const segmentTargetDiff = checkpointTarget > 0 ? this.options.targetDifficulty / (checkpointTarget + 1) : Infinity;
    let forceCheckpoint = false;
    let forcedCheckpointConnector: OpenConnector | null = null;
    if (checkpointTarget > 0) this.log("info", `Checkpoint target: ${checkpointTarget}, segment diff threshold: ${segmentTargetDiff.toFixed(2)}`);

    while (true) {
      const allCheckpointsPlaced = this.placedCheckpointsCount >= checkpointTarget;
      const mustEnd = this.currentTotalDifficulty >= this.options.targetDifficulty && allCheckpointsPlaced;
      const hasSegmentProgress = this.segmentDiffAcc > 0;
      const triggerCheckpoint =
        !mustEnd &&
        (forceCheckpoint ||
          (hasSegmentProgress && this.placedCheckpointsCount < checkpointTarget && this.segmentDiffAcc > segmentTargetDiff));

      if (triggerCheckpoint && !forceCheckpoint) {
        forcedCheckpointConnector = this.backtrackForCheckpointConnector();
        if (!forcedCheckpointConnector) break;
        forceCheckpoint = true;
        this.log("info", `Checkpoint threshold reached. Backtracked 1 rail before placing checkpoint fork.`);
        continue;
      }

      if (!forceCheckpoint && this.openList.length === 0) {
        if (!this.backtrackLastRail()) break;
        continue;
      }

      const connector = forceCheckpoint
        ? forcedCheckpointConnector
        : this.openList.splice(this.random.int(0, this.openList.length - 1), 1)[0];
      forcedCheckpointConnector = null;
      if (!connector) break;
      const candidates = this.getCandidates(mustEnd, triggerCheckpoint).filter(
        (candidate) => !connector.forbiddenCandidates.has(candidate),
      );
      const spinOptions = this.availableSpinOptions(connector.spinDiffs);

      let success = false;
      let attempts = 0;
      let placed: RailInstance | null = null;
      let placedId = "";
      const failReasons = new Map<string, number>();

      for (const { railId: candidate, spinRot, ratio } of this.difficultyGuidedAttempts(candidates, spinOptions, connector.accumulatedDiff)) {
        attempts += 1;
        const [targetRot, targetRotAbs, targetRoll] = this.calculateRailTransform(connector, spinRot);
        const result = this.placeRailV2(
          candidate,
          connector.targetPos,
          targetRot,
          targetRotAbs,
          connector.accumulatedDiff,
          ratio,
          connector.parentId,
          targetRoll,
        );

        if (typeof result !== "string") {
          const parent = this.placedRails.find((rail) => rail.railIndex === connector.parentId);
          if (parent) {
            parent.nextIndices.push(result.railIndex);
            parent.exitStatus[connector.parentExitIdx].IsConnected = true;
            parent.exitStatus[connector.parentExitIdx].TargetID = result.railIndex;
          }

          result.forbiddenSiblings = new Set(connector.forbiddenCandidates);
          placed = result;
          placedId = candidate;
          if (triggerCheckpoint) {
            const checkpoint = this.placeCheckpointOnFork(result, connector.accumulatedDiff + result.diffAct);
            if (checkpoint) {
              this.placedCheckpointsCount += 1;
              this.segmentDiffAcc += result.diffAct + checkpoint.diffAct;
              this.segmentDiffs.push(Number(this.segmentDiffAcc.toFixed(8)));
              this.segmentDiffAcc = 0;
              forceCheckpoint = false;
              success = true;
              this.log(
                "success",
                `Checkpoint ${this.placedCheckpointsCount}/${checkpointTarget}: ${checkpoint.railId}, ${this.formatRailPose(checkpoint)} after fork ${result.railId}, fork ${this.formatRailPose(result)}`,
              );
              break;
            }

            this.rollbackPlacedRail(result);
            placed = null;
            placedId = "";
            failReasons.set("CheckpointPlacementFailed", (failReasons.get("CheckpointPlacementFailed") ?? 0) + 1);
            continue;
          }

          success = true;
          this.segmentDiffAcc += result.diffAct;
          break;
        }

        failReasons.set(result, (failReasons.get(result) ?? 0) + 1);
      }

      if (!success) {
        this.log(
          "fail",
          `Step failed at pos=${this.formatVec(connector.targetPos)}, parent=${connector.parentId}, exit=${connector.parentExitIdx}, baseDir=${forwardDirFromRotAbs(this.exitRotAbs(connector))}, baseRot=${this.formatRot(this.exitRotAbs(connector))}: ${JSON.stringify(Object.fromEntries(failReasons))}`,
        );
        if (forceCheckpoint) {
          forcedCheckpointConnector = this.backtrackForCheckpointConnector();
          if (!forcedCheckpointConnector) {
            this.log("fail", "Checkpoint fork placement failed and no earlier placement remains for retry.");
            break;
          }
          this.log("warn", "Checkpoint fork placement failed. Backtracked again to retry checkpoint placement earlier in the segment.");
        }
      } else if (placed) {
        this.log(
          "success",
          `[Step ${placed.railIndex}] ${placedId}, ${this.formatRailPose(placed)}, attempts=${attempts}, diff=${placed.diffAct.toFixed(2)}, backtracks=${this.backtrackCount}`,
        );
      }

      if (mustEnd && success) {
        this.log("success", `Target difficulty reached (${this.currentTotalDifficulty.toFixed(2)}).`);
        break;
      }
    }

    return this.exportLayout();
  }

  exportLayout(): MazeLayout {
    const segmentDiffs = [...this.segmentDiffs];
    if (this.segmentDiffAcc > 0 || segmentDiffs.length === 0 || segmentDiffs.length <= this.placedCheckpointsCount) {
      segmentDiffs.push(Number(this.segmentDiffAcc.toFixed(8)));
    }
    const rails = this.placedRails.map((rail) => {
      const cfg = this.requireConfig(rail.railId);
      const exits = rail.exitStatus.map((status, i) => {
        const logicOffset = cfg.exitsLogic[i].Pos;
        const worldLogicOffset = transformByRotAbs(logicOffset, rail.rotAbs);
        const worldLogicPos = rail.posRev.add(worldLogicOffset);
        const localRot = cfg.exitsLogic[i].LocalRot;
        const exitRotAbs = composeRotAbs(rail.rotAbs, localRot);

        const exitDirAbs = exitDirFromLocalRot(rail.rotAbs, localRot);

        return {
          Index: i,
          Exit_Pos_Rev: worldLogicPos.toDict(),
          Exit_Pos_Abs: worldLogicPos.toWorldDict(GRID_TO_WORLD_SCALE),
          Exit_Rot_Abs: exitRotAbs,
          Exit_Dir_Abs: exitDirAbs,
          SpinDiff: [...cfg.exitsLogic[i].SpinDiff],
          IsConnected: status.IsConnected,
          TargetInstanceID: status.TargetID !== -1 ? status.TargetID : -1,
        };
      });

      return {
        Rail_Index: rail.railIndex,
        Rail_ID: rail.railId,
        Pos_Rev: rail.posRev.toDict(),
        Pos_Abs: rail.posRev.toWorldDict(GRID_TO_WORLD_SCALE),
        Rot_Abs: cloneRot(rail.rotAbs),
        Dir_Abs: forwardDirFromRotAbs(rail.rotAbs),
        Size_Rev: rail.sizeRev.toDict(),
        Occupied_Cells_Rev: rail.occupiedCellsRev.map((cell) => cell.toDict()),
        Diff_Base: 0,
        Diff_Act: rail.diffAct,
        Prev_Index: rail.prevIndex,
        Next_Index: rail.nextIndices,
        Exit: exits,
      };
    });

    return {
      MapMeta: {
        LevelName: "TypeScript_Generated_Web",
        RailCount: rails.length,
        MazeDiff: rails.reduce((sum, rail) => sum + rail.Diff_Act, 0),
        TargetRailCount: this.targetRailCount(),
        TargetAverageDiff: Number(this.targetAverageDifficulty().toFixed(8)),
        CheckpointCount: rails.filter((rail) => rail.Rail_ID.toLowerCase().includes("checkpoint")).length,
        SegmentDiffs: segmentDiffs,
        SpinCount: this.usedSpinCount,
        MaxSpins: this.maxSpins(),
      },
      Rail: rails,
    };
  }

  private placeCheckpointOnFork(fork: RailInstance, accumulatedDiff: number): RailInstance | null {
    const checkpointCandidates = [...this.configMap.values()].filter((item) => item.isCheckpoint);
    if (checkpointCandidates.length === 0) return null;

    const forkConfig = this.requireConfig(fork.railId);
    const openExits = fork.exitStatus.filter((status) => !status.IsConnected);
    if (openExits.length < 2) return null;

    for (const status of openExits) {
      const exit = forkConfig.exitsLogic[status.Index];
      const connector: OpenConnector = {
        targetPos: fork.posRev.add(transformByRotAbs(exit.Pos, fork.rotAbs)),
        parentId: fork.railIndex,
        parentExitIdx: status.Index,
        accumulatedDiff,
        parentRotIndex: fork.rotIndex,
        parentRotAbs: cloneRot(fork.rotAbs),
        spinDiffs: exit.SpinDiff,
        parentExitRotOffset: exit.RotOffset,
        parentExitLocalRot: cloneRot(exit.LocalRot),
        forbiddenCandidates: new Set(),
      };
      const spinOptions = this.availableSpinOptions(connector.spinDiffs);

      for (const candidate of checkpointCandidates) {
        for (const { spinRot, ratio } of spinOptions) {
          const [targetRot, targetRotAbs, targetRoll] = this.calculateRailTransform(connector, spinRot);
          const result = this.placeRailV2(
            candidate.rowName,
            connector.targetPos,
            targetRot,
            targetRotAbs,
            accumulatedDiff,
            ratio,
            fork.railIndex,
            targetRoll,
          );

          if (typeof result !== "string") {
            fork.nextIndices.push(result.railIndex);
            fork.exitStatus[status.Index].IsConnected = true;
            fork.exitStatus[status.Index].TargetID = result.railIndex;
            this.removeOpenConnector(fork.railIndex, status.Index);
            this.removeOpenConnectorsForParent(result.railIndex);
            return result;
          }
        }
      }
    }

    return null;
  }

  private placeRailV2(
    railId: string,
    pos: Vector3,
    rot: number,
    rotAbs: RotAbs,
    diffBaseAcc: number,
    ratio: number,
    prevIdx: number,
    roll = 0,
  ): RailInstance | string {
    const cfg = this.requireConfig(railId);
    const expectedCells = calculateOccupiedCellsForConfig(cfg, pos, rotAbs);
    const collision = this.findCollision(expectedCells);
    if (collision !== null) return `Collision with Rail ${collision}`;
    if (!this.isInBounds(expectedCells)) return "OutOfBounds";

    const idx = this.globalIndexCounter;
    this.globalIndexCounter += 1;
    const diffAct = (1 + diffBaseAcc * 0.1) * cfg.diffBase * ratio;
    const instance: RailInstance = {
      railIndex: idx,
      railId,
      posRev: pos.clone(),
      rotIndex: rot,
      rotAbs: cloneRot(rotAbs),
      sizeRev: cfg.sizeRev.clone(),
      diffAct,
      spinRot: roll,
      prevIndex: prevIdx,
      nextIndices: [],
      exitStatus: cfg.exitsLogic.map((_, i) => ({ Index: i, IsConnected: false, TargetID: -1, WorldPos: null })),
      forbiddenSiblings: new Set(),
      occupiedCellsRev: expectedCells.map(([x, y, z]) => new Vector3(x, y, z)),
    };

    this.markOccupied(expectedCells, idx);
    this.placedRails.push(instance);
    this.currentTotalDifficulty += diffAct;
    if (roll !== 0) this.usedSpinCount += 1;

    cfg.exitsLogic.forEach((exit, i) => {
      const worldExitPos = pos.add(transformByRotAbs(exit.Pos, rotAbs));
      this.openList.push({
        targetPos: worldExitPos,
        parentId: idx,
        parentExitIdx: i,
        accumulatedDiff: diffAct,
        parentRotIndex: rot,
        parentRotAbs: cloneRot(rotAbs),
        spinDiffs: exit.SpinDiff,
        parentExitRotOffset: exit.RotOffset,
        parentExitLocalRot: cloneRot(exit.LocalRot),
        forbiddenCandidates: new Set(),
      });
    });

    return instance;
  }

  private backtrackLastRail(): boolean {
    if (this.placedRails.length === 0) return false;
    this.backtrackCount += 1;
    const lastRail = this.placedRails.pop();
    if (!lastRail) return false;

    this.globalIndexCounter -= 1;
    this.currentTotalDifficulty -= lastRail.diffAct;
    if (lastRail.spinRot !== 0) this.usedSpinCount = Math.max(0, this.usedSpinCount - 1);
    if (this.requireConfig(lastRail.railId).isCheckpoint) {
      this.placedCheckpointsCount = Math.max(0, this.placedCheckpointsCount - 1);
      this.segmentDiffAcc = Math.max(0, (this.segmentDiffs.pop() ?? 0) - lastRail.diffAct);
    } else {
      this.segmentDiffAcc = Math.max(0, this.segmentDiffAcc - lastRail.diffAct);
    }
    this.removeOpenConnectorsForParent(lastRail.railIndex);
    for (const cell of lastRail.occupiedCellsRev) {
      const key = keyOf(cell.asTuple());
      if (this.occupiedCells.get(key) === lastRail.railIndex) this.occupiedCells.delete(key);
    }

    if (lastRail.prevIndex === -1) return this.placedRails.length > 0;
    const parent = this.placedRails.find((rail) => rail.railIndex === lastRail.prevIndex);
    if (!parent) return true;

    const exitIdx = parent.exitStatus.findIndex((status) => status.TargetID === lastRail.railIndex);
    if (exitIdx === -1) return true;
    const status = parent.exitStatus[exitIdx];
    status.IsConnected = false;
    status.TargetID = -1;
    parent.nextIndices = parent.nextIndices.filter((index) => index !== lastRail.railIndex);

    const exitData = this.requireConfig(parent.railId).exitsLogic[exitIdx];
    const forbiddenCandidates = new Set(lastRail.forbiddenSiblings);
    forbiddenCandidates.add(lastRail.railId);
    this.openList.push({
      targetPos: parent.posRev.add(transformByRotAbs(exitData.Pos, parent.rotAbs)),
      parentId: parent.railIndex,
      parentExitIdx: exitIdx,
      accumulatedDiff: this.currentTotalDifficulty,
      parentRotIndex: parent.rotIndex,
      parentRotAbs: cloneRot(parent.rotAbs),
      spinDiffs: exitData.SpinDiff,
      parentExitRotOffset: exitData.RotOffset,
      parentExitLocalRot: cloneRot(exitData.LocalRot),
      forbiddenCandidates,
    });

    return true;
  }

  private backtrackForCheckpointConnector(): OpenConnector | null {
    if (!this.backtrackLastRail()) return null;
    return this.openList.pop() ?? null;
  }

  private rollbackPlacedRail(rail: RailInstance): void {
    const railIndex = this.placedRails.findIndex((item) => item.railIndex === rail.railIndex);
    if (railIndex !== -1) this.placedRails.splice(railIndex, 1);
    if (rail.railIndex === this.globalIndexCounter - 1) this.globalIndexCounter -= 1;
    this.currentTotalDifficulty -= rail.diffAct;
    if (rail.spinRot !== 0) this.usedSpinCount = Math.max(0, this.usedSpinCount - 1);
    this.removeOpenConnectorsForParent(rail.railIndex);

    for (const cell of rail.occupiedCellsRev) {
      const key = keyOf(cell.asTuple());
      if (this.occupiedCells.get(key) === rail.railIndex) this.occupiedCells.delete(key);
    }

    if (rail.prevIndex === -1) return;
    const parent = this.placedRails.find((item) => item.railIndex === rail.prevIndex);
    if (!parent) return;
    const exit = parent.exitStatus.find((status) => status.TargetID === rail.railIndex);
    if (!exit) return;
    exit.IsConnected = false;
    exit.TargetID = -1;
    parent.nextIndices = parent.nextIndices.filter((index) => index !== rail.railIndex);
  }

  private removeOpenConnectorsForParent(parentId: number): void {
    this.openList = this.openList.filter((connector) => connector.parentId !== parentId);
  }

  private removeOpenConnector(parentId: number, parentExitIdx: number): void {
    this.openList = this.openList.filter(
      (connector) => connector.parentId !== parentId || connector.parentExitIdx !== parentExitIdx,
    );
  }

  private availableSpinOptions(spinDiffs: number[]): { spinRot: number; ratio: number }[] {
    const canUseSpin = this.usedSpinCount < this.maxSpins();
    return spinDiffs
      .map((ratio, spinRot) => ({ spinRot, ratio }))
      .filter((item) => item.ratio > 0 && (item.spinRot === 0 || canUseSpin));
  }

  private maxSpins(): number {
    return Math.max(0, Math.floor(this.options.maxSpins));
  }

  private targetRailCount(): number {
    return Math.max(1, Math.floor(this.options.targetRailCount));
  }

  private targetAverageDifficulty(): number {
    return this.options.targetDifficulty / this.targetRailCount();
  }

  private difficultyGuidedAttempts(
    candidates: string[],
    spinOptions: { spinRot: number; ratio: number }[],
    accumulatedDiff: number,
  ): { railId: string; spinRot: number; ratio: number }[] {
    const average = this.targetAverageDifficulty();
    const expectedCurrent = this.placedRails.length * average;
    const expectedNext = (this.placedRails.length + 1) * average;
    const behindTarget = this.currentTotalDifficulty < expectedCurrent;
    const aheadTarget = this.currentTotalDifficulty > expectedCurrent;

    return candidates
      .flatMap((railId) => spinOptions.map(({ spinRot, ratio }) => {
        const predictedDiff = (1 + accumulatedDiff * 0.1) * this.requireConfig(railId).diffBase * ratio;
        const onPreferredSide =
          (!behindTarget && !aheadTarget) ||
          (behindTarget && predictedDiff >= average) ||
          (aheadTarget && predictedDiff <= average);
        return {
          railId,
          spinRot,
          ratio,
          onPreferredSide,
          distance: Math.abs(this.currentTotalDifficulty + predictedDiff - expectedNext),
          randomOrder: this.random.next(),
        };
      }))
      .sort((a, b) =>
        Number(b.onPreferredSide) - Number(a.onPreferredSide) ||
        a.distance - b.distance ||
        a.randomOrder - b.randomOrder,
      )
      .map(({ railId, spinRot, ratio }) => ({ railId, spinRot, ratio }));
  }

  private getCandidates(mustEnd: boolean, triggerCheckpoint: boolean): string[] {
    const all = [...this.configMap.values()];
    if (mustEnd) return all.filter((item) => item.isEnd).map((item) => item.rowName);
    if (triggerCheckpoint) {
      const forkCandidates = all
        .filter((item) => !item.isEnd && !item.isStart && !item.isCheckpoint && item.exitsLogic.length >= 2)
        .map((item) => item.rowName);
      if (forkCandidates.length > 0) return forkCandidates;
    }
    return all.filter((item) => !item.isEnd && !item.isStart && !item.isCheckpoint).map((item) => item.rowName);
  }

  private calculateRailTransform(connector: OpenConnector, spinRot: number): [number, RotAbs, number] {
    const rotIdx = (connector.parentRotIndex + connector.parentExitRotOffset) % 4;
    const exitRotAbs = composeRotAbs(connector.parentRotAbs, connector.parentExitLocalRot);
    const targetRotAbs = composeRotAbs(exitRotAbs, { p: 0, y: 0, r: spinRot * 90 });
    return [
      rotIdx,
      targetRotAbs,
      spinRot,
    ];
  }

  private isInBounds(cells: [number, number, number][]): boolean {
    const xs = cells.map((cell) => cell[0]);
    const ys = cells.map((cell) => cell[1]);
    const zs = cells.map((cell) => cell[2]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const radiusX = boundRadius(this.options.bounds.x);
    const radiusY = boundRadius(this.options.bounds.y);
    const radiusZ = boundRadius(this.options.bounds.z);

    if (this.options.boundaryMode === 0) {
      return (
        minX >= -radiusX &&
        maxX <= radiusX &&
        minY >= -radiusY &&
        maxY <= radiusY &&
        minZ >= -radiusZ &&
        maxZ <= radiusZ
      );
    }

    const curr = this.globalBounds ?? [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
    const next: [number, number, number, number, number, number] = [
      Math.min(curr[0], minX),
      Math.max(curr[1], maxX),
      Math.min(curr[2], minY),
      Math.max(curr[3], maxY),
      Math.min(curr[4], minZ),
      Math.max(curr[5], maxZ),
    ];

    return (
      next[1] - next[0] + 1 <= this.options.bounds.x &&
      next[3] - next[2] + 1 <= this.options.bounds.y &&
      next[5] - next[4] + 1 <= this.options.bounds.z
    );
  }

  private markOccupied(cells: [number, number, number][], railIndex: number): void {
    if (this.options.boundaryMode === 1) {
      const xs = cells.map((cell) => cell[0]);
      const ys = cells.map((cell) => cell[1]);
      const zs = cells.map((cell) => cell[2]);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const minZ = Math.min(...zs);
      const maxZ = Math.max(...zs);
      const curr = this.globalBounds ?? [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
      this.globalBounds = [
        Math.min(curr[0], minX),
        Math.max(curr[1], maxX),
        Math.min(curr[2], minY),
        Math.max(curr[3], maxY),
        Math.min(curr[4], minZ),
        Math.max(curr[5], maxZ),
      ];
    }

    for (const cell of cells) this.occupiedCells.set(keyOf(cell), railIndex);
  }

  private findCollision(cells: [number, number, number][]): number | null {
    for (const cell of cells) {
      const existing = this.occupiedCells.get(keyOf(cell));
      if (existing !== undefined) return existing;
    }
    return null;
  }

  private requireConfig(railId: string): RailConfigItem {
    const config = this.configMap.get(railId);
    if (!config) throw new Error(`Unknown rail id: ${railId}`);
    return config;
  }

  private exitRotAbs(connector: OpenConnector): RotAbs {
    return composeRotAbs(connector.parentRotAbs, connector.parentExitLocalRot);
  }

  private formatRailPose(rail: RailInstance): string {
    return `pos=${this.formatVec(rail.posRev)}, dir=${forwardDirFromRotAbs(rail.rotAbs)}, rot=${this.formatRot(rail.rotAbs)}`;
  }

  private formatVec(vec: Vector3): string {
    return `(${vec.x},${vec.y},${vec.z})`;
  }

  private formatRot(rot: RotAbs): string {
    return `(p=${rot.p},y=${rot.y},r=${rot.r})`;
  }

  private log(kind: GenerationLogEntry["kind"], message: string): void {
    this.logs.push({ kind, message });
  }
}
