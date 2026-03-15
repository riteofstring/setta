import { areStringArraysEqual } from "./uiSettingRevealActivationShared";
import { isRevealMutationOwnerMatch } from "./uiSettingRevealMutationOwnership";

export function revertStringArrayRecordEntryIfOwned({
  currentRecord,
  postMutationRecord,
  snapshotRecord,
  recordKey,
  ownerLeaseId,
  leaseId,
  ensureMutableRecord,
}: {
  currentRecord: Record<string, Array<string>>;
  postMutationRecord: Record<string, Array<string>>;
  snapshotRecord: Record<string, Array<string>>;
  recordKey: string;
  ownerLeaseId: number | undefined;
  leaseId: number | undefined;
  ensureMutableRecord: () => Record<string, Array<string>>;
}): boolean {
  if (!isRevealMutationOwnerMatch(ownerLeaseId, leaseId)) {
    return false;
  }
  const currentEntry = currentRecord[recordKey];
  const postMutationEntry = postMutationRecord[recordKey];
  if (!areOptionalStringArraysEqual(currentEntry, postMutationEntry)) {
    return false;
  }
  const mutableRecord = ensureMutableRecord();
  const snapshotEntry = snapshotRecord[recordKey];
  if (snapshotEntry === undefined) {
    delete mutableRecord[recordKey];
    return true;
  }
  mutableRecord[recordKey] = [...snapshotEntry];
  return true;
}

export function revertStringRecordEntryIfOwned({
  currentRecord,
  postMutationRecord,
  snapshotRecord,
  recordKey,
  ownerLeaseId,
  leaseId,
  ensureMutableRecord,
}: {
  currentRecord: Record<string, string>;
  postMutationRecord: Record<string, string>;
  snapshotRecord: Record<string, string>;
  recordKey: string;
  ownerLeaseId: number | undefined;
  leaseId: number | undefined;
  ensureMutableRecord: () => Record<string, string>;
}): boolean {
  if (!isRevealMutationOwnerMatch(ownerLeaseId, leaseId)) {
    return false;
  }
  const currentEntry = currentRecord[recordKey];
  const postMutationEntry = postMutationRecord[recordKey];
  if (currentEntry !== postMutationEntry) {
    return false;
  }
  const mutableRecord = ensureMutableRecord();
  const snapshotEntry = snapshotRecord[recordKey];
  if (snapshotEntry === undefined) {
    delete mutableRecord[recordKey];
    return true;
  }
  mutableRecord[recordKey] = snapshotEntry;
  return true;
}

export function cloneStringArrayRecord(
  value: Record<string, Array<string>>,
): Record<string, Array<string>> {
  const cloned: Record<string, Array<string>> = {};
  for (const [recordKey, recordValue] of Object.entries(value)) {
    cloned[recordKey] = [...recordValue];
  }
  return cloned;
}

function areOptionalStringArraysEqual(
  left: Array<string> | undefined,
  right: Array<string> | undefined,
): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return areStringArraysEqual(left, right);
}
