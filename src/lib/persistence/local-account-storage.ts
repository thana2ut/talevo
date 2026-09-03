import {
  APP_STATE_BACKUP_KEY,
  APP_STATE_STORAGE_KEY,
  clearLegacyAppState,
  LEGACY_KERNOVA_APP_STATE_BACKUP_KEY,
  LEGACY_KERNOVA_APP_STATE_KEY,
  type StorageLike,
} from "@/lib/persistence/app-state-storage";
import {
  TALEVO_ACCOUNT_STATE_PREFIX,
  TALEVO_APP_STATE_OWNER_KEY,
} from "@/lib/talevo-storage-keys";

type LocalOwnerBinding = {
  version: 1;
  userId: string;
};

export type LocalOwnershipStatus = "checking" | "ready" | "needs-adoption";
export type LocalOwnershipDecision = "adopted" | "fresh";
export type LocalMigrationOwnership =
  | { status: "confirmed"; source: "account-namespace" | "explicit-adoption" }
  | { status: "needs-adoption"; source: "legacy-unowned" }
  | { status: "owner-mismatch"; source: "legacy-owner"; ownerUserId: string }
  | { status: "no-local-state"; source: "account-namespace" };

function accountKey(userId: string, kind: "primary" | "backup") {
  return `${TALEVO_ACCOUNT_STATE_PREFIX}:${encodeURIComponent(userId)}:${kind}`;
}

export function getAccountStateKeys(userId: string) {
  return {
    primary: accountKey(userId, "primary"),
    backup: accountKey(userId, "backup"),
    legacyDecision: `${TALEVO_ACCOUNT_STATE_PREFIX}:${encodeURIComponent(userId)}:legacy-decision`,
  };
}

function readOwnerBinding(storage: StorageLike): LocalOwnerBinding | null {
  const raw = storage.getItem(TALEVO_APP_STATE_OWNER_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<LocalOwnerBinding>;
    return value.version === 1 && typeof value.userId === "string" && value.userId
      ? { version: 1, userId: value.userId }
      : null;
  } catch {
    return null;
  }
}

function hasCanonicalState(storage: StorageLike) {
  return [
    APP_STATE_STORAGE_KEY,
    APP_STATE_BACKUP_KEY,
    LEGACY_KERNOVA_APP_STATE_KEY,
    LEGACY_KERNOVA_APP_STATE_BACKUP_KEY,
  ].some((key) => storage.getItem(key) !== null);
}

export function hasLegacyLocalData(storage: StorageLike, userId?: string): boolean {
  if (!hasCanonicalState(storage)) return false;
  const owner = readOwnerBinding(storage);
  if (owner && userId && owner.userId !== userId) return false;
  return true;
}

export function inspectLocalOwnership(storage: StorageLike, userId: string): LocalOwnershipStatus {
  const keys = getAccountStateKeys(userId);
  const owner = readOwnerBinding(storage);
  if (owner?.userId === userId) return "ready";
  if (!owner && hasCanonicalState(storage) && storage.getItem(keys.legacyDecision) === null) return "needs-adoption";
  return "ready";
}

export function recordLocalOwnershipDecision(storage: StorageLike, userId: string, decision: LocalOwnershipDecision) {
  storage.setItem(getAccountStateKeys(userId).legacyDecision, decision);
}

export function createAccountStateStorage(storage: StorageLike, userId: string): StorageLike {
  const keys = getAccountStateKeys(userId);
  return {
    getItem(key) {
      if (key === APP_STATE_STORAGE_KEY) return storage.getItem(keys.primary);
      if (key === APP_STATE_BACKUP_KEY) return storage.getItem(keys.backup);
      return null;
    },
    setItem(key, value) {
      if (key === APP_STATE_STORAGE_KEY) storage.setItem(keys.primary, value);
      if (key === APP_STATE_BACKUP_KEY) storage.setItem(keys.backup, value);
    },
    removeItem(key) {
      if (key === APP_STATE_STORAGE_KEY) storage.removeItem(keys.primary);
      if (key === APP_STATE_BACKUP_KEY) storage.removeItem(keys.backup);
    },
  };
}

export function bindCanonicalStateToAccount(storage: StorageLike, userId: string) {
  const owner = readOwnerBinding(storage);
  if (owner && owner.userId !== userId) throw new Error("local_state_owned_by_another_account");
  storage.setItem(TALEVO_APP_STATE_OWNER_KEY, JSON.stringify({ version: 1, userId } satisfies LocalOwnerBinding));
  recordLocalOwnershipDecision(storage, userId, "adopted");
}

export function canonicalStateBelongsToAccount(storage: StorageLike, userId: string) {
  return readOwnerBinding(storage)?.userId === userId;
}

/**
 * Returns migration-specific ownership evidence without exposing or moving a
 * snapshot. Account-namespaced state is owned by construction; legacy
 * canonical state needs the explicit adoption marker created by the gate.
 */
export function inspectLocalMigrationOwnership(storage: StorageLike, userId: string): LocalMigrationOwnership {
  const keys = getAccountStateKeys(userId);
  const hasAccountSnapshot = storage.getItem(keys.primary) !== null || storage.getItem(keys.backup) !== null;
  if (hasAccountSnapshot) return { status: "confirmed", source: "account-namespace" };

  const owner = readOwnerBinding(storage);
  if (owner?.userId === userId) return { status: "confirmed", source: "explicit-adoption" };
  if (owner && owner.userId !== userId) {
    return { status: "owner-mismatch", source: "legacy-owner", ownerUserId: owner.userId };
  }
  if (hasCanonicalState(storage)) return { status: "needs-adoption", source: "legacy-unowned" };
  return { status: "no-local-state", source: "account-namespace" };
}

export function clearAccountStateStorage(storage: StorageLike, userId: string) {
  const keys = getAccountStateKeys(userId);
  storage.removeItem(keys.primary);
  storage.removeItem(keys.backup);
  storage.removeItem(keys.legacyDecision);
  if (canonicalStateBelongsToAccount(storage, userId)) {
    storage.removeItem(APP_STATE_STORAGE_KEY);
    storage.removeItem(APP_STATE_BACKUP_KEY);
    clearLegacyAppState(storage);
    storage.removeItem(TALEVO_APP_STATE_OWNER_KEY);
  }
}
