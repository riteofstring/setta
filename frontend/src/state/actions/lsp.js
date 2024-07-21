import { useWaitingForLSPResult } from "state/definitions/lsp";

export function setWaitingForLSP({ sectionId, paramInfoId }) {
  const id = idForLSPWaiting({ sectionId, paramInfoId });
  const timeoutId = setTimeout(() => {
    useWaitingForLSPResult.setState({ [id]: true });
  }, 200); // Delay of 200 ms

  // returns function to set waiting to false
  return () => {
    clearTimeout(timeoutId);
    useWaitingForLSPResult.setState({ [id]: false });
  };
}

export function idForLSPWaiting({ sectionId, paramInfoId }) {
  return `${sectionId}-${paramInfoId}`;
}


