import { GRID_TO_WORLD_SCALE } from "./constants";
import { ExitLogic, RailConfigItem, RotAbs, Vector3 } from "./types";

function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];

    if (ch === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
    } else if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.trim() !== "")) rows.push(row);
  }

  return rows;
}

function normalizeNumber(value: string | undefined, fallback = 0): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeColumnName(name: string): string {
  return name.replace(/[\s_-]/g, "").toLowerCase();
}

function getRowValue(row: Record<string, string>, names: string[]): string | undefined {
  const normalizedNames = new Set(names.map(normalizeColumnName));

  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value.trim() !== "") return value;
  }

  for (const [name, value] of Object.entries(row)) {
    if (normalizedNames.has(normalizeColumnName(name)) && value.trim() !== "") return value;
  }

  return undefined;
}

function getFlexibleRowValue(
  row: Record<string, string>,
  exactNames: string[],
  matchesColumn: (normalizedName: string) => boolean,
): string | undefined {
  const exactValue = getRowValue(row, exactNames);
  if (exactValue !== undefined) return exactValue;

  for (const [name, value] of Object.entries(row)) {
    if (value.trim() !== "" && matchesColumn(normalizeColumnName(name))) return value;
  }

  return undefined;
}

function isNameLikeColumn(normalizedName: string): boolean {
  return /(name|display|label|title|名称|名字|中文名|英文名)/.test(normalizedName);
}

function isChineseNameColumn(normalizedName: string): boolean {
  return isNameLikeColumn(normalizedName) && /(cn|zh|chinese|中文|汉语|简体)/.test(normalizedName);
}

function isEnglishNameColumn(normalizedName: string): boolean {
  return isNameLikeColumn(normalizedName) && /(en|english|英文)/.test(normalizedName);
}

function isDisplayNameColumn(normalizedName: string): boolean {
  if (/rowname|filename|blueprint|side|tag|ground|exit|diff|size|type/.test(normalizedName)) return false;
  return /(displayname|railname|label|title|显示名称|名称|名字)/.test(normalizedName);
}

function parseSize(row: Record<string, string>, name: string): Vector3 {
  const sx = normalizeNumber(row.SizeX, NaN);
  const sy = normalizeNumber(row.SizeY, NaN);
  const sz = normalizeNumber(row.SizeZ, NaN);
  if ([sx, sy, sz].every(Number.isFinite)) {
    return new Vector3(Math.trunc(sx), Math.trunc(sy), Math.trunc(sz));
  }

  const sizeColumn = row.Size?.match(/X\s*=\s*(\d+).*Y\s*=\s*(\d+).*Z\s*=\s*(\d+)/i);
  if (sizeColumn) {
    return new Vector3(Number(sizeColumn[1]), Number(sizeColumn[2]), Number(sizeColumn[3]));
  }

  const fromName = name.match(/_X(\d+)_Y(\d+)_Z(\d+)/i);
  if (fromName) {
    return new Vector3(Number(fromName[1]), Number(fromName[2]), Number(fromName[3]));
  }

  return new Vector3(1, 1, 1);
}

function parseSpinDiff(text: string, startIndex: number): number[] {
  const spinMatch = text.slice(startIndex).match(/SpinDiff=\(X=([\d.-]+),Y=([\d.-]+),Z=([\d.-]+),W=([\d.-]+)\)/);
  if (!spinMatch) return [1, 1, 1, 1];
  return spinMatch.slice(1).map((value) => Number(value));
}

function parseExitArray(exitStr: string) {
  const exits = [];
  const pattern =
    /Pos=\(X=([\d.-]+),Y=([\d.-]+),Z=([\d.-]+)\),BaseRot=\(P=([\d.-]+),Y=([\d.-]+),R=([\d.-]+)\)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(exitStr)) !== null) {
    const [px, py, pz, rp, ry, rr] = match.slice(1).map((value) => Number(value));
    const localRot: RotAbs = { p: rp, y: ry, r: rr };
    exits.push({
      Pos: new Vector3(
        Math.round(px / GRID_TO_WORLD_SCALE),
        Math.round(py / GRID_TO_WORLD_SCALE),
        Math.round(pz / GRID_TO_WORLD_SCALE),
      ),
      RotOffset: Math.trunc(ry / 90) % 4,
      LocalRot: localRot,
      SpinDiff: parseSpinDiff(exitStr, pattern.lastIndex),
    });
  }

  return exits;
}

function defaultSpinDiff(): number[] {
  return [1, 1, 1, 1];
}

function createExit(pos: Vector3, localRot: RotAbs): ExitLogic {
  return {
    Pos: pos,
    RotOffset: Math.trunc(localRot.y / 90) % 4,
    LocalRot: localRot,
    SpinDiff: defaultSpinDiff(),
  };
}

function inferExitsFromRailName(rowName: string, size: Vector3): ExitLogic[] {
  const rid = rowName.toUpperCase();
  const forward = () => createExit(new Vector3(size.x, 0, 0), { p: 0, y: 0, r: 0 });
  const left = () => createExit(new Vector3(size.x - 1, -size.y, 0), { p: 0, y: -90, r: 0 });
  const right = () => createExit(new Vector3(size.x - 1, size.y, 0), { p: 0, y: 90, r: 0 });
  const up = () => createExit(new Vector3(size.x - 1, 0, size.z), { p: 90, y: 0, r: 0 });
  const down = () => createExit(new Vector3(size.x - 1, 0, -size.z), { p: -90, y: 0, r: 0 });
  const forwardUp = () => createExit(new Vector3(size.x, 0, size.z - 1), { p: 0, y: 0, r: 0 });
  const forwardDown = () => createExit(new Vector3(size.x, 0, -(size.z - 1)), { p: 0, y: 0, r: 0 });

  if (rid.includes("_FR90_")) return [forward(), right()];
  if (rid.includes("_FL90_")) return [forward(), left()];
  if (rid.includes("_T_") || rid.includes("_CR_")) return [right(), left()];
  if (rid.includes("_L90_")) return [left()];
  if (rid.includes("_R90_")) return [right()];
  if (rid.includes("_U90_")) return [up()];
  if (rid.includes("_D90_")) return [down()];
  if (rid.includes("_FU_")) return [forwardUp()];
  if (rid.includes("_FD_")) return [forwardDown()];
  if (rid.includes("_F_")) return [forward()];
  return [];
}

const RIGHT_HANDED_L90_EXIT_OVERRIDES = new Set([
  "BP_Curve_L90_X4_Y4_Z1_Rail",
  "BP_Curve_L90_Borderless_O_X2_Y2_Z1_Rail",
]);

function normalizeRailConfigItem(item: RailConfigItem): RailConfigItem {
  if (!RIGHT_HANDED_L90_EXIT_OVERRIDES.has(item.rowName)) return item;

  return {
    ...item,
    exitsLogic: item.exitsLogic.map((exit) => ({
      ...exit,
      Pos: new Vector3(exit.Pos.x, Math.abs(exit.Pos.y), exit.Pos.z),
      RotOffset: 1,
      LocalRot: {
        ...exit.LocalRot,
        y: Math.abs(exit.LocalRot.y),
      },
    })),
  };
}

export function loadConfigFromCsv(csvText: string): Map<string, RailConfigItem> {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) throw new Error("CSV does not contain any rail rows.");

  const headers = rows[0].map((header) => header.trim());
  const config = new Map<string, RailConfigItem>();

  for (const columns of rows.slice(1)) {
    const row = Object.fromEntries(headers.map((header, index) => [header, columns[index] ?? ""]));
    const rowName = getRowValue(row, ["RowName", "Name"]);
    if (!rowName) continue;

    const diffBase = normalizeNumber(getRowValue(row, ["Diff_Base", "Difficulty"]), 0);
    const sizeRev = parseSize(row, rowName);
    let exitsLogic = row.Exit_Array ? parseExitArray(row.Exit_Array) : [];

    if (exitsLogic.length === 0) {
      exitsLogic = [1, 2, 3]
        .map((idx) => {
          const pos = row[`Exit${idx}Pos`];
          if (!pos) return null;
          const [x, y, z] = pos
            .replace(/^"|"$/g, "")
            .split(",")
            .map((value) => Number(value));
          if (![x, y, z].every(Number.isFinite)) return null;
          const rot = normalizeNumber(row[`Exit${idx}Rot`], 0);
          return {
            Pos: new Vector3(x, y, z),
            RotOffset: Math.trunc(rot) % 4,
            LocalRot: { p: 0, y: rot * 90, r: 0 },
            SpinDiff: [1, 1, 1, 1],
          };
        })
        .filter((exit): exit is NonNullable<typeof exit> => exit !== null);
    }

    const inferredExits = inferExitsFromRailName(rowName, sizeRev);
    if (inferredExits.length > exitsLogic.length) {
      exitsLogic = inferredExits;
    }

    const displayName = getFlexibleRowValue(
      row,
      ["DisplayName", "Display_Name", "Label", "RailName", "Rail_Name", "显示名称", "名称"],
      isDisplayNameColumn,
    )?.trim();
    const cnName = getFlexibleRowValue(
      row,
      ["CN_Name", "cn_name", "CNName", "Name_CN", "NameCN", "ChineseName", "Chinese_Name", "ZhName", "ZH_Name", "Name_ZH", "DisplayName_CN", "Display_CN", "DisplayName_ZH", "Display_ZH", "RailName_CN", "RailName_ZH", "CN", "ZH", "中文", "中文名", "中文名称"],
      isChineseNameColumn,
    )?.trim();
    const enName = getFlexibleRowValue(
      row,
      ["EN_Name", "en_name", "ENName", "Name_EN", "NameEN", "EnglishName", "English_Name", "EnName", "Name_En", "DisplayName_EN", "Display_EN", "RailName_EN", "EN", "英文", "英文名", "英文名称"],
      isEnglishNameColumn,
    )?.trim();
    const railType = row.Type?.trim().toLowerCase() || rowName.toLowerCase();
    config.set(rowName, normalizeRailConfigItem({
      rowName,
      displayName,
      cnName,
      enName,
      diffBase,
      sizeRev,
      exitsLogic,
      isEnd: railType.includes("end"),
      isStart: railType.includes("start"),
      isCheckpoint: railType.includes("checkpoint"),
    }));
  }

  return config;
}
