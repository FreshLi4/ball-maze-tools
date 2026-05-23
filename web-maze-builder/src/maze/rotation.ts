import { RotAbs, Vec3Dict } from "./types";

export type RotationInput = Partial<RotAbs> & Partial<Vec3Dict>;

function normalizeQuarterTurn(value: number | undefined): number {
  return (((Math.round((value ?? 0) / 90) * 90) % 360) + 360) % 360;
}

export function normalizeRotationInput(rot: RotationInput | undefined): RotAbs {
  if (!rot) return { p: 0, y: 0, r: 0 };
  const hasUeXyz = rot.x !== undefined || rot.z !== undefined;
  return {
    p: normalizeQuarterTurn(hasUeXyz ? rot.y : rot.p),
    y: normalizeQuarterTurn(hasUeXyz ? rot.z : rot.y),
    r: normalizeQuarterTurn(hasUeXyz ? rot.x : rot.r),
  };
}

export function rotAbsToUeXyz(rot: RotationInput | undefined): Vec3Dict {
  const normalized = normalizeRotationInput(rot);
  return {
    x: normalized.r,
    y: normalized.p,
    z: normalized.y,
  };
}

export function formatRollPitchYaw(rot: RotationInput | undefined): string {
  const ueRot = rotAbsToUeXyz(rot);
  return `${ueRot.x} / ${ueRot.y} / ${ueRot.z}`;
}
