import type { CloudRuntimeProvisionExistingRecordResult } from "@shared/types";

export function cloudRuntimeExistingRecordMessage(
  result: CloudRuntimeProvisionExistingRecordResult,
): string {
  const record = result.creationRecord;
  const actionLabels = result.nextActions.map((action) => action.label).filter(Boolean);
  const actions =
    actionLabels.length > 0
      ? ` Available choices: ${actionLabels.join(", ")}.`
      : " Inspect the existing record before retrying.";
  return `A cloud provisioning record for ${record.recordId} already exists with status ${record.status}. No provider create command was run.${actions}`;
}
