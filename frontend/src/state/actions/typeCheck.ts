import _ from "lodash";
import { useProjectState, useTypeErrors } from "state/definitions";
import { route_type_check } from "utils/generatedEndpoints";
import {
  isBaseSectionWithParamsImpl,
  SettaProjectConfigDiagnostics,
} from "utils/generatedTypes";
import { addTemporaryNotification } from "./notifications";
import { getCurrEffectiveSectionImplWithTypeGuard } from "./sectionInfos";

export async function requestTypeCheck(userRequested = false) {
  if (userRequested) {
    addTemporaryNotification("Checking types...");
    useTypeErrors.setState({ userRequested });
  }
  const projectConfigId = useProjectState.getState().projectConfig.id;
  route_type_check({ projectConfigId });
}

export function processTypeErrors(content: SettaProjectConfigDiagnostics) {
  const p = useProjectState.getState();
  const { projectConfigId, diagnostics } = content;
  if (projectConfigId !== p.projectConfig.id) {
    return;
  }

  const typeErrors = {};

  for (const d of diagnostics) {
    const { sectionId, paramInfoId, message } = d;
    if (!paramInfoId) {
      continue;
    }
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      p,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    if (impl.ignoreTypeErrors[paramInfoId]) {
      continue;
    }
    if (!(sectionId in typeErrors)) {
      typeErrors[sectionId] = {};
    }
    if (!(paramInfoId in typeErrors[sectionId])) {
      typeErrors[sectionId][paramInfoId] = [];
    }
    typeErrors[sectionId][paramInfoId].push(message);
  }

  if (useTypeErrors.getState().userRequested) {
    addTemporaryNotification(
      _.size(typeErrors) === 0
        ? "No type errors"
        : `Found ${_.size(typeErrors)} type errors`,
    );
  }
  useTypeErrors.getState().reset();
  useTypeErrors.setState({ errors: typeErrors });
}

export function removeTypeErrorsForParam(paramInfoId, state) {
  for (const section of Object.values(state.errors)) {
    if (paramInfoId in section) {
      delete section[paramInfoId];
    }
  }
}
