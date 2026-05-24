import { RotAbs, Vec3Dict } from "./types";

export type RotationInput = Partial<RotAbs> & Partial<Vec3Dict>;
export const UE_ROTATION_CONVENTION = "ue-rpy-viewer-y-mirror-v1";

function normalizeQuarterTurn(value: number | undefined): number {
  return (((Math.round((value ?? 0) / 90) * 90) % 360) + 360) % 360;
}

function signedQuarterTurn(value: number | undefined): number {
  const normalized = normalizeQuarterTurn(value);
  const signed = normalized > 180 ? normalized - 360 : normalized;
  return Object.is(signed, -0) ? 0 : signed;
}

export function normalizeRotationInput(rot: RotationInput | undefined): RotAbs {
  if (!rot) return { p: 0, y: 0, r: 0 };
  const hasUeXyz = rot.x !== undefined || rot.z !== undefined;
  if (hasUeXyz) return ueXyzToRotAbs(rot);
  return {
    p: normalizeQuarterTurn(rot.p),
    y: normalizeQuarterTurn(rot.y),
    r: normalizeQuarterTurn(rot.r),
  };
}

export function legacyXyzToRotAbs(rot: RotationInput | undefined): RotAbs {
  if (!rot) return { p: 0, y: 0, r: 0 };
  return {
    p: normalizeQuarterTurn(rot.y ?? rot.p),
    y: normalizeQuarterTurn(rot.z ?? rot.y),
    r: normalizeQuarterTurn(rot.x ?? rot.r),
  };
}

export function ueXyzToRotAbs(rot: RotationInput | undefined): RotAbs {
  if (!rot) return { p: 0, y: 0, r: 0 };
  if (rot.x === undefined && rot.z === undefined) return normalizeRotationInput(rot);
  return {
    p: normalizeQuarterTurn(rot.y ?? rot.p),
    y: normalizeQuarterTurn(-(rot.z ?? 0)),
    r: normalizeQuarterTurn(-(rot.x ?? rot.r ?? 0)),
  };
}

export function rotAbsToUeXyz(rot: RotationInput | undefined): Vec3Dict {
  const normalized = normalizeRotationInput(rot);
  return {
    x: signedQuarterTurn(-normalized.r),
    y: signedQuarterTurn(normalized.p),
    z: signedQuarterTurn(-normalized.y),
  };
}

export function formatRollPitchYaw(rot: RotationInput | undefined): string {
  const ueRot = rotAbsToUeXyz(rot);
  return `${ueRot.x} / ${ueRot.y} / ${ueRot.z}`;
}
