import { useNameValidationErrors, useProjectState } from "state/definitions";
import { SettaProjectNameValidationErrors } from "utils/generatedTypes";

export function processNameValidationErrors(
  content: SettaProjectNameValidationErrors,
) {
  const currentProjectId = useProjectState.getState().projectConfig.id;
  if (content.projectConfigId !== currentProjectId) {
    return;
  }
  useNameValidationErrors.getState().reset();
  useNameValidationErrors.setState({
    sectionErrors: content.sectionErrors,
    paramErrors: content.paramErrors,
  });
}
