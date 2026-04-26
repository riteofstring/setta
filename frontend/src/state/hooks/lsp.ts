import { textFieldIdForLSPWaiting } from "state/actions/lsp";
import { useWaitingForLSPResult } from "state/definitions";

export function useTextFieldWaitingForLSPResult({ sectionId, paramInfoId }) {
  return useWaitingForLSPResult(
    (x) => x.textFields[textFieldIdForLSPWaiting({ sectionId, paramInfoId })],
  );
}

export function useParametersRequestWaitingForLSPResult(sectionId: string) {
  return useWaitingForLSPResult((x) => x.parametersRequest[sectionId] ?? false);
}
