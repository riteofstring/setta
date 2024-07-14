import { createProjectState } from "./utils";

// map from key to true or false
// keys are of the form:
// {sectionId}-null for the main section combobox
// {sectionId}-{paramInfoId} for section parameter fields
export const useWaitingForLSPResult = createProjectState(() => ({}));

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
