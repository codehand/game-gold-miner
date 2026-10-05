/**
 * Engine-independent cat ownership and assignment domain.
 *
 * This module deliberately contains no renderer, network, or persistence
 * imports. Asset IDs are opaque blueprint references; catInstanceId is the
 * ownership identity and is never derived from an asset path or display name.
 */

export const CAT_CALCULATION_VERSION = 1 as const;

export type CatRole = 'elevator' | 'warehouse' | 'miner' | 'hauler';
export type CatRarityTier = 'N' | 'R' | 'SR' | 'SSR' | 'UR';
export type CatAvailabilityState =
  | 'Idle'
  | 'Assigned'
  | 'Listed'
  | 'Rented'
  | 'Expired'
  | 'Locked';

export interface CatAttributes {
  readonly power: number;
  readonly speed: number;
  readonly capacity: number;
  readonly efficiency: number;
}

export interface CatInstance {
  readonly catInstanceId: string;
  readonly ownerUserId: string;
  readonly assetId: string;
  readonly displayName: string;
  readonly roleId: CatRole;
  readonly rarityTier: CatRarityTier;
  readonly level: number;
  readonly attributes: CatAttributes;
  readonly calculationVersion: number;
  readonly availabilityState: CatAvailabilityState;
  readonly assignedSlotKey: string | null;
  readonly updatedAt: number;
}

export interface CatAssignment {
  readonly slotKey: CatSlotKey;
  readonly catInstanceId: string;
}

export interface CatRosterState {
  readonly cats: readonly CatInstance[];
  readonly assignments: readonly CatAssignment[];
  readonly assignmentRevision: number;
  readonly collectionRevision: number;
}

export type BareCatSlotKey =
  | `miner:${string}`
  | `hauler:${1 | 2 | 3 | 4 | 5}`
  | 'elevator:main'
  | 'warehouse:main';

export type CatSlotKey = BareCatSlotKey | `mine:${string}:${BareCatSlotKey}`;

export type CatBenefitMetric =
  | 'mining-output'
  | 'elevator-throughput'
  | 'warehouse-processing'
  | 'surface-hauling';

export interface CatRoleEffect {
  readonly roleId: CatRole;
  readonly roleScore: number;
  readonly primarySkill: string;
  readonly skillBonus: number;
  readonly affectedMetric: CatBenefitMetric;
  readonly benefitLabel: string;
}

export interface CatComparison {
  readonly slotKey: CatSlotKey;
  readonly currentRoleScore: number;
  readonly candidateRoleScore: number;
  readonly currentSkillBonus: number;
  readonly candidateSkillBonus: number;
  readonly skillBonusDelta: number;
  readonly affectedMetric: CatBenefitMetric;
}

export type CatAssignmentFailureReason =
  | 'stale-revision'
  | 'unknown-slot'
  | 'unknown-cat'
  | 'wrong-role'
  | 'cat-not-assignable'
  | 'cat-already-assigned'
  | 'no-op';

export type CatAssignmentResult =
  | { readonly success: true; readonly state: CatRosterState }
  | { readonly success: false; readonly reason: CatAssignmentFailureReason };

const ROLE_PROFILES: Readonly<Record<CatRole, {
  readonly weights: CatAttributes;
  readonly primarySkill: string;
  readonly baseBonus: number;
  readonly maxVariableBonus: number;
  readonly affectedMetric: CatBenefitMetric;
}>> = {
  elevator: {
    weights: { power: 0.1, speed: 0.45, capacity: 0.3, efficiency: 0.15 },
    primarySkill: 'Lift Mastery',
    baseBonus: 0.02,
    maxVariableBonus: 0.28,
    affectedMetric: 'elevator-throughput',
  },
  warehouse: {
    weights: { power: 0.1, speed: 0.25, capacity: 0.4, efficiency: 0.25 },
    primarySkill: 'Storage Mastery',
    baseBonus: 0.02,
    maxVariableBonus: 0.28,
    affectedMetric: 'warehouse-processing',
  },
  miner: {
    weights: { power: 0.45, speed: 0.3, capacity: 0.05, efficiency: 0.2 },
    primarySkill: 'Mining Mastery',
    baseBonus: 0,
    maxVariableBonus: 0.25,
    affectedMetric: 'mining-output',
  },
  hauler: {
    weights: { power: 0.1, speed: 0.4, capacity: 0.35, efficiency: 0.15 },
    primarySkill: 'Hauling Mastery',
    baseBonus: 0.02,
    maxVariableBonus: 0.28,
    affectedMetric: 'surface-hauling',
  },
};

const SLOT_ROLES: Readonly<Record<'elevator:main' | 'warehouse:main', CatRole>> = {
  'elevator:main': 'elevator',
  'warehouse:main': 'warehouse',
};

export function createEmptyCatRoster(): CatRosterState {
  return {
    cats: [],
    assignments: [],
    assignmentRevision: 0,
    collectionRevision: 0,
  };
}

export function calculateRoleScore(cat: Pick<CatInstance, 'roleId' | 'attributes'>): number {
  const profile = ROLE_PROFILES[cat.roleId];
  const score =
    cat.attributes.power * profile.weights.power +
    cat.attributes.speed * profile.weights.speed +
    cat.attributes.capacity * profile.weights.capacity +
    cat.attributes.efficiency * profile.weights.efficiency;

  return roundScore(score);
}

export function calculateCatRoleEffect(
  cat: Pick<CatInstance, 'roleId' | 'attributes'>,
): CatRoleEffect {
  const profile = ROLE_PROFILES[cat.roleId];
  const roleScore = calculateRoleScore(cat);
  const skillBonus = profile.baseBonus + profile.maxVariableBonus * (roleScore / 100);

  return {
    roleId: cat.roleId,
    roleScore,
    primarySkill: profile.primarySkill,
    skillBonus,
    affectedMetric: profile.affectedMetric,
    benefitLabel: formatBenefitLabel(skillBonus, profile.affectedMetric),
  };
}

export function getRoleForSlot(slotKey: string): CatRole | null {
  const localSlotKey = /^mine:[a-z][a-z0-9-]*:(.+)$/.exec(slotKey)?.[1] ?? slotKey;
  if (/^hauler:[1-5]$/.test(localSlotKey)) return 'hauler';
  if (localSlotKey.startsWith('miner:') && localSlotKey.length > 'miner:'.length) {
    return 'miner';
  }

  return SLOT_ROLES[localSlotKey as keyof typeof SLOT_ROLES] ?? null;
}

export function isCatAssignable(cat: CatInstance): boolean {
  return cat.availabilityState === 'Idle' && cat.assignedSlotKey === null;
}

export function getCatForSlot(
  roster: CatRosterState,
  slotKey: CatSlotKey,
): CatInstance | null {
  const assignment = roster.assignments.find((candidate) => candidate.slotKey === slotKey);
  return assignment === undefined
    ? null
    : roster.cats.find((cat) => cat.catInstanceId === assignment.catInstanceId) ?? null;
}

export function getAssignableCats(
  roster: CatRosterState,
  slotKey: CatSlotKey,
): readonly CatInstance[] {
  const role = getRoleForSlot(slotKey);
  if (role === null) {
    return [];
  }

  return roster.cats.filter((cat) => cat.roleId === role && isCatAssignable(cat));
}

export function compareCatForSlot(
  roster: CatRosterState,
  slotKey: CatSlotKey,
  candidateCatInstanceId: string,
): CatComparison | null {
  const current = getCatForSlot(roster, slotKey);
  const candidate = roster.cats.find((cat) => cat.catInstanceId === candidateCatInstanceId);

  if (candidate === undefined) {
    return null;
  }

  const currentEffect = current === null ? emptyEffect(candidate.roleId) : calculateCatRoleEffect(current);
  const candidateEffect = calculateCatRoleEffect(candidate);

  return {
    slotKey,
    currentRoleScore: currentEffect.roleScore,
    candidateRoleScore: candidateEffect.roleScore,
    currentSkillBonus: currentEffect.skillBonus,
    candidateSkillBonus: candidateEffect.skillBonus,
    skillBonusDelta: candidateEffect.skillBonus - currentEffect.skillBonus,
    affectedMetric: candidateEffect.affectedMetric,
  };
}

export function assignCatToSlot(
  roster: CatRosterState,
  slotKey: CatSlotKey,
  catInstanceId: string | null,
  expectedAssignmentRevision: number,
  updatedAt: number,
): CatAssignmentResult {
  if (roster.assignmentRevision !== expectedAssignmentRevision) {
    return { success: false, reason: 'stale-revision' };
  }

  const role = getRoleForSlot(slotKey);
  if (role === null) {
    return { success: false, reason: 'unknown-slot' };
  }

  if (catInstanceId === null) {
    const current = roster.assignments.find((assignment) => assignment.slotKey === slotKey);
    if (role !== 'hauler') return { success: false, reason: 'wrong-role' };
    if (current === undefined) return { success: false, reason: 'no-op' };
    return {
      success: true,
      state: {
        cats: roster.cats.map((cat) => cat.catInstanceId === current.catInstanceId
          ? { ...cat, availabilityState: 'Idle' as const, assignedSlotKey: null, updatedAt }
          : cat),
        assignments: roster.assignments.filter((assignment) => assignment.slotKey !== slotKey),
        assignmentRevision: roster.assignmentRevision + 1,
        collectionRevision: roster.collectionRevision + 1,
      },
    };
  }

  const candidate = roster.cats.find((cat) => cat.catInstanceId === catInstanceId);
  if (candidate === undefined) {
    return { success: false, reason: 'unknown-cat' };
  }
  if (candidate.roleId !== role) {
    return { success: false, reason: 'wrong-role' };
  }

  const currentAssignment = roster.assignments.find((assignment) => assignment.slotKey === slotKey);
  if (currentAssignment?.catInstanceId === catInstanceId) {
    return { success: false, reason: 'no-op' };
  }
  if (!isCatAssignable(candidate)) {
    return candidate.assignedSlotKey === null
      ? { success: false, reason: 'cat-not-assignable' }
      : { success: false, reason: 'cat-already-assigned' };
  }

  const cats = roster.cats.map((cat) => {
    if (cat.catInstanceId === currentAssignment?.catInstanceId) {
      return {
        ...cat,
        availabilityState: 'Idle' as const,
        assignedSlotKey: null,
        updatedAt,
      };
    }
    if (cat.catInstanceId === catInstanceId) {
      return {
        ...cat,
        availabilityState: 'Assigned' as const,
        assignedSlotKey: slotKey,
        updatedAt,
      };
    }
    return cat;
  });

  const assignments = [
    ...roster.assignments.filter((assignment) => assignment.slotKey !== slotKey),
    { slotKey, catInstanceId },
  ].sort((left, right) => left.slotKey.localeCompare(right.slotKey));

  return {
    success: true,
    state: {
      cats,
      assignments,
      assignmentRevision: roster.assignmentRevision + 1,
      collectionRevision: roster.collectionRevision + 1,
    },
  };
}

export function validateCatRoster(roster: CatRosterState): void {
  if (!Number.isSafeInteger(roster.assignmentRevision) || roster.assignmentRevision < 0) {
    throw new Error('Cat assignment revision must be a non-negative safe integer.');
  }
  if (!Number.isSafeInteger(roster.collectionRevision) || roster.collectionRevision < 0) {
    throw new Error('Cat collection revision must be a non-negative safe integer.');
  }

  const catIds = new Set<string>();
  const assignedCatIds = new Set<string>();
  const assignedSlots = new Set<string>();

  roster.cats.forEach((cat) => {
    validateCatInstance(cat);
    if (catIds.has(cat.catInstanceId)) {
      throw new Error(`Duplicate cat instance ${cat.catInstanceId}.`);
    }
    catIds.add(cat.catInstanceId);

    if (cat.assignedSlotKey !== null) {
      if (cat.availabilityState !== 'Assigned') {
        throw new Error(`Assigned slot requires Assigned state for ${cat.catInstanceId}.`);
      }
      if (assignedCatIds.has(cat.catInstanceId)) {
        throw new Error(`Cat ${cat.catInstanceId} is assigned more than once.`);
      }
      assignedCatIds.add(cat.catInstanceId);
    }
  });

  roster.assignments.forEach((assignment) => {
    if (assignedSlots.has(assignment.slotKey)) {
      throw new Error(`Slot ${assignment.slotKey} is assigned more than once.`);
    }
    const cat = roster.cats.find((candidate) => candidate.catInstanceId === assignment.catInstanceId);
    if (cat === undefined) {
      throw new Error(`Assignment references unknown cat ${assignment.catInstanceId}.`);
    }
    if (cat.assignedSlotKey !== assignment.slotKey || cat.availabilityState !== 'Assigned') {
      throw new Error(`Assignment state is inconsistent for ${assignment.catInstanceId}.`);
    }
    if (getRoleForSlot(assignment.slotKey) !== cat.roleId) {
      throw new Error(`Cat ${assignment.catInstanceId} has the wrong role for ${assignment.slotKey}.`);
    }
    assignedSlots.add(assignment.slotKey);
  });

  if (assignedCatIds.size !== roster.assignments.length) {
    throw new Error('Cat assignment projection contains an unpaired assigned cat.');
  }
}

function validateCatInstance(cat: CatInstance): void {
  if (cat.catInstanceId.length === 0 || cat.ownerUserId.length === 0 || cat.assetId.length === 0) {
    throw new Error('Cat identity fields must be non-empty.');
  }
  if (!Number.isSafeInteger(cat.level) || cat.level < 1) {
    throw new Error(`Cat ${cat.catInstanceId} level must be a positive safe integer.`);
  }
  if (cat.calculationVersion !== CAT_CALCULATION_VERSION) {
    throw new Error(`Cat ${cat.catInstanceId} uses an unsupported calculation version.`);
  }
  if (!Number.isSafeInteger(cat.updatedAt) || cat.updatedAt < 0) {
    throw new Error(`Cat ${cat.catInstanceId} updatedAt must be a non-negative timestamp.`);
  }
  Object.entries(cat.attributes).forEach(([name, value]) => {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new Error(`Cat ${cat.catInstanceId} ${name} must be in the range 0–100.`);
    }
  });
}

function emptyEffect(roleId: CatRole): CatRoleEffect {
  const profile = ROLE_PROFILES[roleId];
  return {
    roleId,
    roleScore: 0,
    primarySkill: profile.primarySkill,
    skillBonus: 0,
    affectedMetric: profile.affectedMetric,
    benefitLabel: formatBenefitLabel(0, profile.affectedMetric),
  };
}

function formatBenefitLabel(bonus: number, metric: CatBenefitMetric): string {
  const label = {
    'mining-output': 'mining output',
    'elevator-throughput': 'elevator throughput',
    'warehouse-processing': 'warehouse processing',
    'surface-hauling': 'this cart\'s hauling',
  }[metric];
  return `+${(bonus * 100).toFixed(1)}% ${label}`;
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}
