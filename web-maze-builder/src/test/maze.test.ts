import { describe, expect, it } from "vitest";
import railConfigCsv from "../../rail_config.csv?raw";
import { loadConfigFromCsv } from "../maze/csv";
import {
  calculateOccupiedCells,
  calculateOccupiedCellsForConfig,
  calculateOccupiedCellsWithRotAbs,
  exitDirFromLocalRot,
  MazeGenerator,
  transformByRotAbs,
} from "../maze/generator";
import { buildFamilyDisplayName, parseRailNameParts, railDirectionDisplayName, railFamilyDisplayName } from "../maze/railLibrary";
import { formatRollPitchYaw, normalizeRotationInput, rotAbsToUeXyz } from "../maze/rotation";
import { MazeLayout, Vector3 } from "../maze/types";

function expectedDirFromRot(rot: { p: number; y: number; r: number }): "+X" | "+Y" | "-X" | "-Y" | "+Z" | "-Z" {
  return expectedDirFromVector(rotateByRot({ x: 1, y: 0, z: 0 }, rot));
}

function rotateByRot(vec: { x: number; y: number; z: number }, rot: { p: number; y: number; r: number }): { x: number; y: number; z: number } {
  let { x, y, z } = vec;
  const rotate = (degrees: number, step: () => void) => {
    for (let i = 0; i < (((Math.trunc(degrees / 90) % 4) + 4) % 4); i += 1) step();
  };
  rotate(rot.r, () => {
    [y, z] = [-z, y];
  });
  rotate(rot.p, () => {
    [x, z] = [-z, x];
  });
  rotate(rot.y, () => {
    [x, y] = [-y, x];
  });
  return { x, y, z };
}

function expectedDirFromVector(vec: { x: number; y: number; z: number }): "+X" | "+Y" | "-X" | "-Y" | "+Z" | "-Z" {
  const values = [
    ["+X", vec.x],
    ["-X", -vec.x],
    ["+Y", vec.y],
    ["-Y", -vec.y],
    ["+Z", vec.z],
    ["-Z", -vec.z],
  ] as const;
  return values.reduce((best, item) => (item[1] > best[1] ? item : best))[0];
}

function expectConnectedLayoutConsistent(layout: MazeLayout): void {
  for (const rail of layout.Rail) {
    expect(new Set(rail.Next_Index).size).toBe(rail.Next_Index.length);
    for (const nextIndex of rail.Next_Index) {
      expect(rail.Exit.some((exit) => exit.TargetInstanceID === nextIndex)).toBe(true);
    }

    for (const exit of rail.Exit.filter((item) => item.TargetInstanceID !== -1)) {
      const child = layout.Rail.find((item) => item.Rail_Index === exit.TargetInstanceID);
      expect(child).toBeDefined();
      expect({ parent: rail.Rail_Index, child: child?.Rail_Index, exitPos: exit.Exit_Pos_Rev, childPos: child?.Pos_Rev }).toEqual({
        parent: rail.Rail_Index,
        child: child?.Rail_Index,
        exitPos: child?.Pos_Rev,
        childPos: child?.Pos_Rev,
      });
      expect({ parent: rail.Rail_Index, child: child?.Rail_Index, exitDir: exit.Exit_Dir_Abs, childDir: child?.Dir_Abs }).toEqual({
        parent: rail.Rail_Index,
        child: child?.Rail_Index,
        exitDir: exit.Exit_Dir_Abs,
        childDir: exit.Exit_Dir_Abs,
      });
    }
  }
}

describe("TypeScript maze port", () => {
  it("converts internal rotation to UE XYZ Roll/Pitch/Yaw order", () => {
    expect(rotAbsToUeXyz({ p: 0, y: 90, r: 0 })).toEqual({ x: 0, y: 0, z: 90 });
    expect(normalizeRotationInput({ x: 0, y: 0, z: 90 })).toEqual({ p: 0, y: 90, r: 0 });
    expect(formatRollPitchYaw({ p: 0, y: 90, r: 0 })).toBe("0 / 0 / 90");
  });

  it("loads UE CSV config and recognizes key rail types", () => {
    const config = loadConfigFromCsv(railConfigCsv);
    expect(config.size).toBeGreaterThan(30);
    expect([...config.values()].some((rail) => rail.isStart)).toBe(true);
    expect([...config.values()].some((rail) => rail.isEnd)).toBe(true);
    expect(config.get("BP_Start_F_X1_Y1_Z1_Rail")?.exitsLogic[0].Pos.toDict()).toEqual({ x: 1, y: 0, z: 0 });
    expect(config.get("BP_Curve_L90_X2_Y2_Z1_Rail")?.localOccupiedCells).toHaveLength(4);
  });

  it("loads configured display names from flexible CSV name columns", () => {
    const config = loadConfigFromCsv([
      "RowName,DisplayName_ZH,DisplayName_EN,DisplayName,Diff_Base,Size,Exit_Array",
      'BP_Straight_F_X1_Y1_Z1_Rail,直线轨道,Straight Rail,Fallback Name,0,"(X=1,Y=1,Z=1)","((Pos=(X=16,Y=0,Z=0),BaseRot=(P=0,Y=0,R=0),SpinDiff=(X=1,Y=1,Z=1,W=1)))"',
    ].join("\n"));

    const rail = config.get("BP_Straight_F_X1_Y1_Z1_Rail");
    expect(rail?.cnName).toBe("直线轨道");
    expect(rail?.enName).toBe("Straight Rail");
    expect(rail?.displayName).toBe("Fallback Name");
  });

  it("loads normalized rail config exits, spin config, and occupation cells", () => {
    const config = loadConfigFromCsv([
      "---,OccupiedCells,Exits,Diff_Base",
      'BP_Curve_L90_X4_Y4_Z1_Rail,"((X=0,Y=0,Z=0),(X=1,Y=-1,Z=0))","((ExitIndex=0,Location=(X=3,Y=-4,Z=0),Rotation=(Pitch=0,Yaw=-90,Roll=0),SpinConfig=(S0=(Enable=True,Difficulty=1),S90=(Enable=False,Difficulty=1.5),S180=(Enable=True,Difficulty=2),S270=(Enable=False,Difficulty=1.5))))",1.25',
    ].join("\n"));
    const rail = config.get("BP_Curve_L90_X4_Y4_Z1_Rail");

    expect(rail?.exitsLogic[0].Pos.toDict()).toEqual({ x: 3, y: -4, z: 0 });
    expect(rail?.exitsLogic[0].LocalRot).toEqual({ p: 0, y: -90, r: 0 });
    expect(rail?.exitsLogic[0].SpinDiff).toEqual([1, 0, 2, 0]);
    expect(rail?.localOccupiedCells?.map((cell) => cell.toDict())).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: -1, z: 0 },
    ]);
    expect(rail ? calculateOccupiedCellsForConfig(rail, new Vector3(10, 0, 0), { p: 0, y: 0, r: 0 }) : []).toEqual([
      [10, 0, 0],
      [11, -1, 0],
    ]);
  });

  it("treats single-origin occupation as a placeholder for larger named rails", () => {
    const config = loadConfigFromCsv([
      "---,OccupiedCells,Exits,Diff_Base",
      'BP_Curve_L90_X2_Y2_Z1_Rail,"((X=0,Y=0,Z=0))","((ExitIndex=0,Location=(X=1,Y=-2,Z=0),Rotation=(Pitch=0,Yaw=-90,Roll=0),SpinConfig=(S0=(Enable=True,Difficulty=1))))",0.65',
    ].join("\n"));
    const rail = config.get("BP_Curve_L90_X2_Y2_Z1_Rail");

    expect(rail?.localOccupiedCells?.map((cell) => cell.toDict()).sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z)).toEqual([
      { x: 0, y: -1, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 1, y: -1, z: 0 },
      { x: 1, y: 0, z: 0 },
    ]);
    expect(rail ? calculateOccupiedCellsForConfig(rail, new Vector3(-2, 3, 1), { p: 0, y: 90, r: 0 }) : []).toHaveLength(4);
  });

  it("parses build-library grouping from rail role names", () => {
    expect(parseRailNameParts("BP_Straight_F_X1_Y1_Z1_Rail")).toEqual({
      group: "Straight",
      direction: "F",
      descriptor: "Normal",
      familyKey: "Straight|Normal|F",
    });
    expect(parseRailNameParts("BP_Straight_FR90_Borderless_Caved_X1_Y1_Z1_Rail")).toEqual({
      group: "Straight",
      direction: "FR90",
      descriptor: "Borderless Caved",
      familyKey: "Straight|Borderless Caved|FR90",
    });
    expect(parseRailNameParts("BP_Curve_R90_Borderless_L_X2_Y2_Z1_Rail")).toEqual({
      group: "Curve",
      direction: "R90",
      descriptor: "Borderless L",
      familyKey: "Curve|Borderless L|R90",
    });
  });

  it("uses the first named size variant as the build-family display name", () => {
    const config = loadConfigFromCsv([
      "RowName,CN_Name,EN_Name,Diff_Base,Size,Exit_Array",
      'BP_Straight_F_X1_Y1_Z1_Rail,直线轨道,Straight Rail,0,"(X=1,Y=1,Z=1)","((Pos=(X=16,Y=0,Z=0),BaseRot=(P=0,Y=0,R=0),SpinDiff=(X=1,Y=1,Z=1,W=1)))"',
      'BP_Straight_F_X2_Y1_Z1_Rail,直线轨道,Straight Rail,0,"(X=2,Y=1,Z=1)","((Pos=(X=32,Y=0,Z=0),BaseRot=(P=0,Y=0,R=0),SpinDiff=(X=1,Y=1,Z=1,W=1)))"',
    ].join("\n"));
    const variants = [
      config.get("BP_Straight_F_X1_Y1_Z1_Rail"),
      config.get("BP_Straight_F_X2_Y1_Z1_Rail"),
    ].filter((rail): rail is NonNullable<typeof rail> => rail !== undefined);

    expect(railFamilyDisplayName(variants, "zh")).toBe("直线轨道");
    expect(railFamilyDisplayName(variants, "en")).toBe("Straight Rail");
    expect(buildFamilyDisplayName(variants, "F", "zh")).toBe("直线轨道");
    expect(buildFamilyDisplayName(variants, "F", "en")).toBe("Straight Rail");
  });

  it("falls back to direction labels instead of blueprint names for unnamed build families", () => {
    const config = loadConfigFromCsv([
      "RowName,Diff_Base,Size,Exit_Array",
      'BP_Straight_FR90_X1_Y1_Z1_Rail,0,"(X=1,Y=1,Z=1)","((Pos=(X=16,Y=16,Z=0),BaseRot=(P=0,Y=90,R=0),SpinDiff=(X=1,Y=1,Z=1,W=1)))"',
    ].join("\n"));
    const rail = config.get("BP_Straight_FR90_X1_Y1_Z1_Rail");

    expect(railDirectionDisplayName("FR90", "zh")).toBe("前右 90");
    expect(railDirectionDisplayName("FR90", "en")).toBe("Forward Right 90");
    expect(buildFamilyDisplayName(rail ? [rail] : [], "FR90", "zh")).toBe("前右 90");
  });

  it("matches occupied cell behavior for a downward bump", () => {
    const cells = calculateOccupiedCells("BP_Bump_FD_X2_Y1_Z2_Rail", new Vector3(-2, 2, 0), new Vector3(2, 1, 2), 0);
    expect(cells.sort()).toEqual([
      [-1, 2, -1],
      [-1, 2, 0],
      [-2, 2, -1],
      [-2, 2, 0],
    ].sort());
  });

  it("keeps forward-up occupied cells above the start cell", () => {
    const cells = calculateOccupiedCells("BP_Bump_FU_X2_Y1_Z2_Rail", new Vector3(0, 0, 0), new Vector3(2, 1, 2), 0);
    expect(cells.sort()).toEqual([
      [0, 0, 0],
      [0, 0, 1],
      [1, 0, 0],
      [1, 0, 1],
    ].sort());
  });

  it("rotates occupied cells by full UE absolute rotation", () => {
    const cells = calculateOccupiedCellsWithRotAbs(
      "BP_Curve_U90_Borderless_Caved_X3_Y1_Z3_Rail",
      new Vector3(0, 0, 0),
      new Vector3(3, 1, 3),
      { p: 90, y: 90, r: 0 },
    );
    expect(cells).toContainEqual([0, 0, 0]);
    expect(cells.some((cell) => cell[1] < 0)).toBe(true);
    expect(cells.some((cell) => cell[2] > 0)).toBe(true);
  });

  it("keeps curve-down exits below their entry height", () => {
    const config = loadConfigFromCsv(railConfigCsv);
    const downCurves = [...config.values()].filter((rail) => rail.rowName.includes("_D90_"));
    expect(downCurves.length).toBeGreaterThan(0);

    for (const rail of downCurves) {
      expect(rail.exitsLogic[0].LocalRot.p).toBeLessThan(0);
      expect(rail.exitsLogic[0].Pos.z).toBeLessThan(0);
    }
  });

  it("matches right-handed L90 curve overrides to their model direction", () => {
    const config = loadConfigFromCsv([
      "RowName,Diff_Base,Size,Exit_Array",
      'BP_Curve_L90_X4_Y4_Z1_Rail,1,"(X=4,Y=4,Z=1)","((Pos=(X=48,Y=-64,Z=0),BaseRot=(P=0,Y=-90,R=0),SpinDiff=(X=1,Y=1,Z=1,W=1)))"',
      'BP_Curve_L90_Borderless_O_X2_Y2_Z1_Rail,1,"(X=2,Y=2,Z=1)","((Pos=(X=16,Y=-32,Z=0),BaseRot=(P=0,Y=-90,R=0),SpinDiff=(X=1,Y=1,Z=1,W=1)))"',
    ].join("\n"));
    const expected = [
      ["BP_Curve_L90_X4_Y4_Z1_Rail", new Vector3(4, 4, 1), { x: 3, y: 4, z: 0 }],
      ["BP_Curve_L90_Borderless_O_X2_Y2_Z1_Rail", new Vector3(2, 2, 1), { x: 1, y: 2, z: 0 }],
    ] as const;

    for (const [railId, size, exitPos] of expected) {
      const curve = config.get(railId);
      expect(curve?.exitsLogic[0].Pos.toDict()).toEqual(exitPos);
      expect(curve?.exitsLogic[0].LocalRot.y).toBe(90);
      expect(curve?.exitsLogic[0].RotOffset).toBe(1);

      const cells = calculateOccupiedCells(railId, new Vector3(0, 0, 0), size, 0);
      expect(cells.some((cell) => cell[1] > 0)).toBe(true);
      expect(cells.some((cell) => cell[1] < 0)).toBe(false);
    }
  });

  it("keeps other L90 curves left-handed", () => {
    const config = loadConfigFromCsv(railConfigCsv);
    const curve = config.get("BP_Curve_L90_X3_Y3_Z1_Rail");
    expect(curve?.exitsLogic[0].Pos.toDict()).toEqual({ x: 2, y: -3, z: 0 });
    expect(curve?.exitsLogic[0].LocalRot.y).toBe(-90);
  });

  it("keeps Curve R90 X3 exit and footprint on the right side", () => {
    const config = loadConfigFromCsv(railConfigCsv);
    const curve = config.get("BP_Curve_R90_X3_Y3_Z1_Rail");
    expect(curve?.exitsLogic[0].Pos.toDict()).toEqual({ x: 2, y: 3, z: 0 });
    expect(curve?.exitsLogic[0].LocalRot.y).toBe(90);

    const cells = calculateOccupiedCells("BP_Curve_R90_X3_Y3_Z1_Rail", new Vector3(0, 0, 0), new Vector3(3, 3, 1), 0);
    expect(cells.some((cell) => cell[1] > 0)).toBe(true);
    expect(cells.some((cell) => cell[1] < 0)).toBe(false);
  });

  it("keeps the reported R90 X3 occupied side aligned after full absolute rotation", () => {
    const rotAbs = { p: 270, y: 0, r: 270 };
    const pos = new Vector3(0, -3, 0);
    const sideDir = rotateByRot({ x: 0, y: 1, z: 0 }, rotAbs);
    const cells = calculateOccupiedCellsWithRotAbs("BP_Curve_R90_X3_Y3_Z1_Rail", pos, new Vector3(3, 3, 1), rotAbs);
    const axis = Math.abs(sideDir.x) > 0 ? 0 : Math.abs(sideDir.y) > 0 ? 1 : 2;
    const sign = [sideDir.x, sideDir.y, sideDir.z][axis];
    const offsets = cells.map((cell) => cell[axis] - pos.asTuple()[axis]);

    expect({
      axis,
      sign,
      hasExpectedSide: offsets.some((offset) => offset * sign > 0),
      hasOppositeSide: offsets.some((offset) => offset * sign < 0),
    }).toEqual({
      axis,
      sign,
      hasExpectedSide: true,
      hasOppositeSide: false,
    });
  });

  it("keeps turn footprints aligned with their exit side", () => {
    const config = loadConfigFromCsv([
      "RowName,Diff_Base,Size,Exit_Array",
      'BP_Curve_L90_X3_Y3_Z1_Rail,1,"(X=3,Y=3,Z=1)","((Pos=(X=32,Y=-48,Z=0),BaseRot=(P=0,Y=-90,R=0),SpinDiff=(X=1,Y=1,Z=1,W=1)))"',
      'BP_Curve_R90_X3_Y3_Z1_Rail,1,"(X=3,Y=3,Z=1)","((Pos=(X=32,Y=48,Z=0),BaseRot=(P=0,Y=90,R=0),SpinDiff=(X=1,Y=1,Z=1,W=1)))"',
      'BP_Blank_U90_X1_Y1_Z1_Rail,1,"(X=1,Y=1,Z=1)","((Pos=(X=0,Y=0,Z=16),BaseRot=(P=90,Y=0,R=0),SpinDiff=(X=1,Y=1,Z=1,W=1)))"',
    ].join("\n"));

    for (const rail of config.values()) {
      const horizontal = rail.rowName.includes("_L90_") || rail.rowName.includes("_R90_");
      const vertical = rail.rowName.includes("_U90_") || rail.rowName.includes("_D90_");
      if (!horizontal && !vertical) continue;

      const axis = horizontal ? 1 : 2;
      if (horizontal && rail.sizeRev.y <= 1) continue;
      if (vertical && rail.sizeRev.z <= 1) continue;

      const exit = rail.exitsLogic.find((item) => item.Pos.asTuple()[axis] !== 0);
      if (!exit) continue;
      const exitValue = exit.Pos.asTuple()[axis];
      const expectedPositive = exitValue > 0;

      const cells = calculateOccupiedCells(rail.rowName, new Vector3(0, 0, 0), rail.sizeRev, 0);
      const hasNegative = cells.some((cell) => cell[axis] < 0);
      const hasPositive = cells.some((cell) => cell[axis] > 0);
      expect({ rail: rail.rowName, axis, hasNegative, hasPositive, exitValue }).toEqual({
        rail: rail.rowName,
        axis,
        hasNegative: !expectedPositive,
        hasPositive: expectedPositive,
        exitValue,
      });
    }
  });

  it("treats bounds as actual odd grid size", () => {
    const config = loadConfigFromCsv(railConfigCsv);
    const tiny = new MazeGenerator(config, { bounds: new Vector3(1, 1, 1), targetDifficulty: 1 });
    expect(tiny["isInBounds"]([[0, 0, 0]])).toBe(true);
    expect(tiny["isInBounds"]([[1, 0, 0]])).toBe(false);

    const three = new MazeGenerator(config, { bounds: new Vector3(3, 3, 3), targetDifficulty: 1 });
    expect(three["isInBounds"]([[-1, 0, 0], [1, 0, 0]])).toBe(true);
    expect(three["isInBounds"]([[-2, 0, 0]])).toBe(false);
  });

  it("generates a connected layout in the exported JSON shape", () => {
    const config = loadConfigFromCsv(railConfigCsv);
    const layout = new MazeGenerator(config, { seed: 20260425, targetDifficulty: 15 }).generate();
    expect(layout.MapMeta.RailCount).toBe(layout.Rail.length);
    expect(layout.Rail.filter((rail) => rail.Rail_ID.includes("Start"))).toHaveLength(1);
    expect(layout.Rail.filter((rail) => rail.Rail_ID.includes("End"))).toHaveLength(1);
    expect(layout.MapMeta.MazeDiff).toBeGreaterThanOrEqual(15);
    for (const rail of layout.Rail) {
      expect(Math.abs(rail.Pos_Abs.x % 16)).toBe(0);
      expect(Math.abs(rail.Pos_Abs.y % 16)).toBe(0);
      expect(Math.abs(rail.Pos_Abs.z % 16)).toBe(0);
    }
  });

  it("disables self-spin by default", () => {
    const config = loadConfigFromCsv(railConfigCsv);
    const generator = new MazeGenerator(config, { seed: 20260425, targetDifficulty: 15 });
    const layout = generator.generate();
    expect(layout.MapMeta.SpinCount).toBe(0);
    expect(layout.MapMeta.MaxSpins).toBe(0);
    expect(generator.placedRails.every((rail) => rail.spinRot === 0)).toBe(true);
  });

  it("never exceeds the configured self-spin count", () => {
    const config = loadConfigFromCsv(railConfigCsv);
    const generator = new MazeGenerator(config, { seed: 20260425, targetDifficulty: 15, maxSpins: 1 });
    const layout = generator.generate();
    expect(layout.MapMeta.SpinCount).toBeLessThanOrEqual(1);
    expect(generator.placedRails.filter((rail) => rail.spinRot !== 0)).toHaveLength(layout.MapMeta.SpinCount ?? 0);
  });

  it("transforms FR90 exits through pitch", () => {
    const config = loadConfigFromCsv(railConfigCsv);
    const rail = config.get("BP_Straight_FR90_X1_Y1_Z1_Rail");
    expect(rail).toBeDefined();
    const rotAbs = { p: 90, y: 0, r: 0 };
    const exits = rail?.exitsLogic.map((exit) => ({
      pos: transformByRotAbs(exit.Pos, rotAbs),
      dir: exitDirFromLocalRot(rotAbs, exit.LocalRot),
    })) ?? [];

    expect(exits.some((exit) => exit.pos.z !== 0)).toBe(true);
    expect(exits.some((exit) => exit.dir !== "+Z")).toBe(true);
  });

  it("derives exported exit direction by applying local exit rotation before rail rotation", () => {
    const config = loadConfigFromCsv(railConfigCsv);
    const layout = new MazeGenerator(config, {
      seed: 790943075,
      targetDifficulty: 24,
      targetCheckpoints: 3,
      maxSpins: 0,
      bounds: new Vector3(13, 9, 5),
    }).generate();

    for (const rail of layout.Rail) {
      const cfg = config.get(rail.Rail_ID);
      expect(cfg).toBeDefined();
      for (const exit of rail.Exit) {
        const localRot = cfg?.exitsLogic[exit.Index].LocalRot ?? { p: 0, y: 0, r: 0 };
        const localForward = rotateByRot({ x: 1, y: 0, z: 0 }, localRot);
        const expectedDir = expectedDirFromVector(rotateByRot(localForward, rail.Rot_Abs));
        expect({ rail: rail.Rail_ID, index: exit.Index, dir: exit.Exit_Dir_Abs }).toEqual({
          rail: rail.Rail_ID,
          index: exit.Index,
          dir: expectedDir,
        });
      }
    }
  });

  it("places requested checkpoints on fork branches and reports segment difficulty", () => {
    const config = loadConfigFromCsv(railConfigCsv);
    const layout = new MazeGenerator(config, {
      seed: 20260425,
      targetDifficulty: 15,
      targetCheckpoints: 2,
      maxSpins: 4,
      bounds: new Vector3(13, 13, 5),
    }).generate();

    const checkpoints = layout.Rail.filter((rail) => rail.Rail_ID.toLowerCase().includes("checkpoint"));
    expect(checkpoints).toHaveLength(2);
    expect(layout.MapMeta.CheckpointCount).toBe(2);
    expect(layout.MapMeta.SegmentDiffs).toHaveLength(3);

    for (const checkpoint of checkpoints) {
      const parent = layout.Rail.find((rail) => rail.Rail_Index === checkpoint.Prev_Index);
      expect(parent).toBeDefined();
      expect(parent?.Exit.length).toBeGreaterThanOrEqual(2);
      expect(parent?.Exit.some((exit) => exit.TargetInstanceID === checkpoint.Rail_Index)).toBe(true);
    }
  });

  it("does not force a checkpoint after backtracking removes all segment progress", () => {
    const config = loadConfigFromCsv(railConfigCsv);
    const layout = new MazeGenerator(config, {
      seed: 654324621,
      targetDifficulty: 25,
      targetCheckpoints: 3,
      maxSpins: 3,
      bounds: new Vector3(13, 7, 3),
    }).generate();

    expect(layout.MapMeta.CheckpointCount).toBeGreaterThan(0);
    expect(layout.MapMeta.SegmentDiffs).toHaveLength((layout.MapMeta.CheckpointCount ?? 0) + 1);
    expect(layout.MapMeta.SegmentDiffs?.slice(0, -1).every((diff) => diff > 0)).toBe(true);
  });

  it("keeps child enter direction aligned with the parent exit after pitched fork exits", () => {
    const config = loadConfigFromCsv(railConfigCsv);
    const layout = new MazeGenerator(config, {
      seed: 2106175761,
      targetDifficulty: 15,
      targetCheckpoints: 3,
      maxSpins: 1,
      bounds: new Vector3(13, 11, 5),
    }).generate();

    for (const parent of layout.Rail) {
      for (const exit of parent.Exit.filter((item) => item.TargetInstanceID !== -1)) {
        const child = layout.Rail.find((rail) => rail.Rail_Index === exit.TargetInstanceID);
        expect(child).toBeDefined();
        expect({
          parent: parent.Rail_Index,
          exit: exit.Index,
          child: child?.Rail_Index,
          exitDir: exit.Exit_Dir_Abs,
          childEnterDir: expectedDirFromRot(child?.Rot_Abs ?? { p: 0, y: 0, r: 0 }),
        }).toEqual({
          parent: parent.Rail_Index,
          exit: exit.Index,
          child: child?.Rail_Index,
          exitDir: exit.Exit_Dir_Abs,
          childEnterDir: exit.Exit_Dir_Abs,
        });
      }
    }
  });

  it("keeps connected target indices, positions, and directions consistent for the reported spin seed", () => {
    const config = loadConfigFromCsv(railConfigCsv);
    const layout = new MazeGenerator(config, {
      seed: 1977755683,
      targetDifficulty: 9,
      targetCheckpoints: 0,
      maxSpins: 4,
      bounds: new Vector3(7, 7, 7),
    }).generate();

    expectConnectedLayoutConsistent(layout);
  });

  it("keeps connected target indices, positions, and directions consistent when a spin is used", () => {
    const config = loadConfigFromCsv([
      "RowName,Diff_Base,Size,Exit_Array",
      'BP_Start_F_X1_Y1_Z1_Rail,0,"(X=1,Y=1,Z=1)","((Pos=(X=16,Y=0,Z=0),BaseRot=(P=0,Y=0,R=0),SpinDiff=(X=0,Y=1,Z=0,W=0)))"',
      'BP_End_F_X1_Y1_Z1_Rail,1,"(X=1,Y=1,Z=1)",""',
    ].join("\n"));
    const layout = new MazeGenerator(config, {
      seed: 1,
      targetDifficulty: 0,
      targetCheckpoints: 0,
      maxSpins: 4,
      bounds: new Vector3(5, 5, 5),
    }).generate();

    expect(layout.MapMeta.SpinCount).toBeGreaterThan(0);
    expectConnectedLayoutConsistent(layout);
  });
});
