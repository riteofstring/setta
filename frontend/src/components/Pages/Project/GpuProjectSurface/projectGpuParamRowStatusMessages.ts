import {
  getParamDuplicateNameError,
  type ParamDuplicateIndex,
} from "state/actions/params/paramDuplicateIndex";
import type { ZustandProjectState } from "state/definitions";

export function getProjectGpuParamRowStatusMessages({
  paramDuplicateIndex,
  projectState,
  rowId,
  sectionParamTypeErrors,
}: {
  readonly paramDuplicateIndex: ParamDuplicateIndex;
  readonly projectState: ZustandProjectState;
  readonly rowId: string;
  readonly sectionParamTypeErrors: Readonly<
    Record<string, readonly string[] | undefined>
  >;
}): readonly string[] {
  const messages = [...(sectionParamTypeErrors[rowId] ?? [])];
  const duplicateNameError = getProjectGpuParamDuplicateNameStatusMessage({
    paramDuplicateIndex,
    projectState,
    rowId,
  });
  if (duplicateNameError) {
    messages.push(duplicateNameError);
  }
  return messages;
}

function getProjectGpuParamDuplicateNameStatusMessage({
  paramDuplicateIndex,
  projectState,
  rowId,
}: {
  readonly paramDuplicateIndex: ParamDuplicateIndex;
  readonly projectState: ZustandProjectState;
  readonly rowId: string;
}): string | null {
  const codeObj = projectState.codeObjs[rowId];
  if (!codeObj) {
    throw new Error(`Missing GPU retained param core ${rowId}.`);
  }
  return getParamDuplicateNameError(rowId, codeObj.name, paramDuplicateIndex);
}
