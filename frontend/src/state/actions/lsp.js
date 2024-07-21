import { useWaitingForLSPResult } from "state/definitions";

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

function idForLSPWaiting({ sectionId, paramInfoId }) {
  return `${sectionId}-${paramInfoId}`;
}

export function useIdWaitingForLSPResult({ sectionId, paramInfoId }) {
  return useWaitingForLSPResult(
    (x) => x[idForLSPWaiting({ sectionId, paramInfoId })],
  );
}
