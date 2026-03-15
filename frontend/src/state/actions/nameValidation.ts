import { useNameValidationErrors, useProjectState } from "state/definitions";
import type { SettaProjectNameValidationErrors } from "state/types/nameValidation";

function applyNameValidationErrors(content: SettaProjectNameValidationErrors) {
  useNameValidationErrors.setState((state) => {
    state.projectErrors = content.projectErrors;
    state.sectionErrors = content.sectionErrors;
    state.paramErrors = content.paramErrors;
    if (content.projectConfigId in state.pendingByProjectId) {
      delete state.pendingByProjectId[content.projectConfigId];
    }
  });
}

export function processNameValidationErrors(
  content: SettaProjectNameValidationErrors,
) {
  const currentProjectId = useProjectState.getState().projectConfig.id;
  if (content.projectConfigId !== currentProjectId) {
    useNameValidationErrors.setState((state) => {
      state.pendingByProjectId[content.projectConfigId] = content;
    });
    return;
  }
  applyNameValidationErrors(content);
}

export function applyPendingNameValidationErrors(projectConfigId: string) {
  const pending =
    useNameValidationErrors.getState().pendingByProjectId[projectConfigId];
  if (!pending) {
    useNameValidationErrors.setState((state) => {
      state.projectErrors = [];
      state.sectionErrors = {};
      state.paramErrors = {};
    });
    return;
  }
  applyNameValidationErrors(pending);
}
