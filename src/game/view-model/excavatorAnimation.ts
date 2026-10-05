/** Boru's presentation follows the core extraction lap; it never awards gold. */
export type ExcavatorAction = 'travel-empty' | 'scoop' | 'travel-loaded' | 'deposit';

export function calculateExcavatorPose(progress: number, startX: number, endX: number) {
  if (!Number.isFinite(progress) || progress < 0 || progress >= 1 ||
      !Number.isFinite(startX) || !Number.isFinite(endX) || endX < startX) {
    throw new Error('Excavator progress and ordered route bounds must be valid.');
  }
  let action: ExcavatorAction;
  let local: number;
  let x: number;
  if (progress < 0.32) {
    action = 'travel-empty';
    local = progress / 0.32;
    x = startX + (endX - startX) * local;
  } else if (progress < 0.58) {
    action = 'scoop';
    local = (progress - 0.32) / 0.26;
    x = endX;
  } else if (progress < 0.84) {
    action = 'travel-loaded';
    local = (progress - 0.58) / 0.26;
    x = endX - (endX - startX) * local;
  } else {
    action = 'deposit';
    local = (progress - 0.84) / 0.16;
    x = startX;
  }
  return { action, frame: Math.min(7, Math.floor(local * 8)), x,
    facesLeft: action === 'travel-loaded' || action === 'deposit' };
}
