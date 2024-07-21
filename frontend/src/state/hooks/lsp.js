import { idForLSPWaiting } from "state/actions/lsp";
import { useWaitingForLSPResult } from "state/definitions/lsp";

export function useIdWaitingForLSPResult({ sectionId, paramInfoId }) {
  return useWaitingForLSPResult(
    (x) => x[idForLSPWaiting({ sectionId, paramInfoId })],
  );
}
