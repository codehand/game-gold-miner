import { EMPTY_BOOST_STATE, validateBoostState, type BoostState } from '../../core';

export const LOCAL_BOOST_STORAGE_KEY = 'cat-mine-idle:boost:local';

/** Best-effort cache only. A configured backend remains authoritative. */
export function readLocalBoostState(
  storage: Pick<Storage, 'getItem'> | null,
  key = LOCAL_BOOST_STORAGE_KEY,
): BoostState {
  if (storage === null) return EMPTY_BOOST_STATE;
  try {
    const raw = storage.getItem(key);
    if (raw === null) return EMPTY_BOOST_STATE;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || !Object.hasOwn(value, 'lastActivatedAtMs')) {
      return EMPTY_BOOST_STATE;
    }
    return validateBoostState({ lastActivatedAtMs: Reflect.get(value, 'lastActivatedAtMs') });
  } catch {
    return EMPTY_BOOST_STATE;
  }
}

export function writeLocalBoostState(
  storage: Pick<Storage, 'setItem'> | null,
  boost: BoostState,
  key = LOCAL_BOOST_STORAGE_KEY,
): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(key, JSON.stringify(validateBoostState(boost)));
    return true;
  } catch {
    return false;
  }
}
