export {
  bindSaveLifecycle,
  type SaveLifecycleTargets,
} from './bindSaveLifecycle';
export {
  ensureGuestSession,
  type GuestAuthClient,
  type GuestSessionResult,
  type GuestSessionToken,
  type GuestSessionUser,
} from './guestSession';
export {
  beginGoogleAccountSwitch,
  beginGoogleSignIn,
  detectGoogleIdentityCollision,
  signOutOfSession,
  type GoogleAuthClient,
  type GoogleSignInResult,
  type SignOutResult,
} from './googleSignIn';
export {
  createSupabaseClient,
  type SupabaseClient,
} from './supabaseClient';
export {
  adoptExistingLocalSave,
  downloadCloudSaveViaFetch,
  reconcileCloudSaveAtBoot,
  type AdoptExistingLocalSaveDeps,
  type CloudSaveDownload,
  type CloudSaveReconcileDeps,
  type CloudSaveReconcileOutcome,
  type DownloadCloudSave,
  type LocalSaveAdoptionResult,
} from './cloudSaveReconcile';
export {
  LIFECYCLE_SAVE_JOURNAL_KEY,
  LifecycleSafeActiveSaveRepository,
  WebLifecycleSaveJournal,
  type KeyValueStorage,
} from './WebLifecycleSaveJournal';
export {
  generateRecoveryCode,
  redeemRecoveryCode,
  type GenerateRecoveryCodeResult,
  type RecoveryCodeAuthClient,
  type RedeemRecoveryCodeResult,
} from './recoveryCode';
export {
  uploadCloudSaveViaFetch,
  type CloudSaveUploadAuthClient,
} from './cloudSaveUpload';
