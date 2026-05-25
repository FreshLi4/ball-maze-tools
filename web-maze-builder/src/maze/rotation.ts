import { RotAbs, Vec3Dict } from "./types";

export type RotationInput = Partial<RotAbs> & Partial<Vec3Dict>;
export const UE_ROTATION_CONVENTION = "ue-rpy-roll-flip-v2";
export const INVERTED_YAW_ROTATION_CONVENTION = "ue-rpy-viewer-y-mirror-v1";

function normalizeQuarterTurn(value: number | undefined): number {
  return (((Math.round((value ?? 0) / 90) * 90) % 360) + 360) % 360;
}

function signedQuarterTurn(value: number | undefined): number {
  const normalized = normalizeQuarterTurn(value);
  const signed = normalized > 180 ? normalized - 360 : normalized;
  return Object.is(signed, -0) ? 0 : signed;
}

function canonicalizeUeXyz(rot: Vec3Dict): Vec3Dict {
  const roll = signedQuarterTurn(rot.x);
  const pitch = signedQuarterTurn(rot.y);
  const yaw = signedQuarterTurn(rot.z);

  // At +/-90 pitch, Roll and Yaw are coupled. Match UE's stable display form.
  if (pitch === 90) return { x: 0, y: pitch, z: signedQuarterTurn(yaw - roll) };
  if (pitch === -90) return { x: 0, y: pitch, z: signedQuarterTurn(yaw + roll) };
  return { x: roll, y: pitch, z: yaw };
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

export function invertedYawXyzToRotAbs(rot: RotationInput | undefined): RotAbs {
  if (!rot) return { p: 0, y: 0, r: 0 };
  const pitch = signedQuarterTurn(rot.y ?? rot.p);
  const yaw = signedQuarterTurn(rot.z);
  if (pitch === 90) return { p: 90, y: 0, r: normalizeQuarterTurn(yaw) };
  if (pitch === -90) return { p: 270, y: 0, r: normalizeQuarterTurn(-yaw) };
  return {
    p: normalizeQuarterTurn(pitch),
    y: normalizeQuarterTurn(-yaw),
    r: normalizeQuarterTurn(-(rot.x ?? rot.r ?? 0)),
  };
}

export function ueXyzToRotAbs(rot: RotationInput | undefined): RotAbs {
  if (!rot) return { p: 0, y: 0, r: 0 };
  if (rot.x === undefined && rot.z === undefined) return normalizeRotationInput(rot);
  const canonical = canonicalizeUeXyz({
    x: rot.x ?? rot.r ?? 0,
    y: rot.y ?? rot.p ?? 0,
    z: rot.z ?? 0,
  });
  if (canonical.y === 90) return { p: 90, y: 0, r: normalizeQuarterTurn(canonical.z) };
  if (canonical.y === -90) return { p: 270, y: 0, r: normalizeQuarterTurn(-canonical.z) };
  return {
    p: normalizeQuarterTurn(canonical.y),
    y: normalizeQuarterTurn(canonical.z),
    r: normalizeQuarterTurn(-canonical.x),
  };
}

export function rotAbsToUeXyz(rot: RotationInput | undefined): Vec3Dict {
  const normalized = normalizeRotationInput(rot);
  return canonicalizeUeXyz({
    x: signedQuarterTurn(-normalized.r),
    y: signedQuarterTurn(normalized.p),
    z: signedQuarterTurn(normalized.y),
  });
}

export function formatRollPitchYaw(rot: RotationInput | undefined): string {
  const ueRot = rotAbsToUeXyz(rot);
  return `${ueRot.x} / ${ueRot.y} / ${ueRot.z}`;
}
