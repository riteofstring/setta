import { createProjectState } from "./utils";

// map from key to true or false
// keys are of the form:
// {sectionId}-null for the main section combobox
// {sectionId}-{paramInfoId} for section parameter fields
export const useWaitingForLSPResult = createProjectState(() => ({}));

export function setWaitingForLSP({ sectionId, paramInfoId, waiting }) {
  useWaitingForLSPResult.setState({
    [idForLSPWaiting({ sectionId, paramInfoId })]: waiting,
  });
}

export function idForLSPWaiting({ sectionId, paramInfoId }) {
  return `${sectionId}-${paramInfoId}`;
}
