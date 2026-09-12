import type { ApplicationSnapshotV1, ProjectV1 } from "./generatedContract";
import {
  validateApplicationSnapshotDocument,
  validateProjectDocument,
} from "./generatedValidators.js";

export function validateApplicationSnapshot(
  value: unknown,
): value is ApplicationSnapshotV1 {
  return validateApplicationSnapshotDocument(value);
}

export function validateProject(value: unknown): value is ProjectV1 {
  return validateProjectDocument(value);
}
