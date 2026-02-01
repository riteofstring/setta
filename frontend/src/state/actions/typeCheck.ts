import {
  useProjectState,
  useShareSession,
  useTypeErrors,
} from "state/definitions";
import { route_type_check } from "utils/generatedEndpoints";
import { SettaProjectConfigDiagnostics } from "utils/generatedTypes";
import { addTemporaryNotification } from "./notifications";
import { getCurrProjectConfigId } from "./sectionInfos";

type TypeErrors = SettaProjectConfigDiagnostics["errors"];

type TypeErrorsSummary = {
  sections: number;
  callableErrors: number;
  paramErrors: number;
  paramSections: number;
};

const SHOULD_LOG_TYPE_ERRORS =
  import.meta.env?.DEV && import.meta.env?.VITE_LOG_TYPE_ERRORS === "1";

function summarizeTypeErrors(errors: TypeErrors): TypeErrorsSummary {
  let callableErrors = 0;
  let paramErrors = 0;
  let paramSections = 0;
  for (const section of Object.values(errors)) {
    callableErrors += section.callable.length;
    const paramIds = Object.keys(section.params);
    if (paramIds.length > 0) {
      paramSections += 1;
    }
    for (const paramId of paramIds) {
      paramErrors += section.params[paramId].length;
    }
  }
  return {
    sections: Object.keys(errors).length,
    callableErrors,
    paramErrors,
    paramSections,
  };
}

function logTypeErrors(event: string, payload: Record<string, unknown>) {
  if (!SHOULD_LOG_TYPE_ERRORS) {
    return;
  }
  console.info(`[type-check:${event}]`, payload);
}

function areStringArraysEqual(left: Array<string>, right: Array<string>) {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let idx = 0; idx < left.length; idx += 1) {
    if (left[idx] !== right[idx]) {
      return false;
    }
  }
  return true;
}

function areParamErrorsEqual(
  left: Record<string, Array<string>>,
  right: Record<string, Array<string>>,
) {
  if (left === right) {
    return true;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (!(key in right)) {
      return false;
    }
    if (!areStringArraysEqual(left[key], right[key])) {
      return false;
    }
  }
  return true;
}

function isSectionTypeErrorsEmpty(sectionErrors: {
  callable: Array<string>;
  params: Record<string, Array<string>>;
}) {
  return (
    sectionErrors.callable.length === 0 &&
    Object.keys(sectionErrors.params).length === 0
  );
}

function areSectionErrorsEqual(
  left: { callable: Array<string>; params: Record<string, Array<string>> },
  right: { callable: Array<string>; params: Record<string, Array<string>> },
) {
  if (left === right) {
    return true;
  }
  if (!areStringArraysEqual(left.callable, right.callable)) {
    return false;
  }
  return areParamErrorsEqual(left.params, right.params);
}

function areTypeErrorsEqual(left: TypeErrors, right: TypeErrors) {
  if (left === right) {
    return true;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const sectionId of leftKeys) {
    if (!(sectionId in right)) {
      return false;
    }
    if (!areSectionErrorsEqual(left[sectionId], right[sectionId])) {
      return false;
    }
  }
  return true;
}

function mergeTypeErrorsBySection(
  previous: TypeErrors,
  incoming: TypeErrors,
  projectConfigId: string,
) {
  const merged: TypeErrors = {};
  const seen = new Set<string>();

  logTypeErrors("merge-start", {
    projectConfigId,
    prevSummary: summarizeTypeErrors(previous),
    incomingSummary: summarizeTypeErrors(incoming),
  });

  for (const [sectionId, nextErrors] of Object.entries(incoming)) {
    seen.add(sectionId);
    const prevErrors = previous[sectionId];
    if (isSectionTypeErrorsEmpty(nextErrors)) {
      if (prevErrors && !isSectionTypeErrorsEmpty(prevErrors)) {
        logTypeErrors("empty-incoming-cleared", {
          projectConfigId,
          sectionId,
        });
      }
      continue;
    }

    if (prevErrors && areSectionErrorsEqual(prevErrors, nextErrors)) {
      merged[sectionId] = prevErrors;
      logTypeErrors("section-unchanged", {
        projectConfigId,
        sectionId,
      });
      continue;
    }
    merged[sectionId] = nextErrors;
    logTypeErrors("section-updated", {
      projectConfigId,
      sectionId,
    });
  }

  for (const sectionId of Object.keys(previous)) {
    if (seen.has(sectionId)) {
      continue;
    }
    const prevErrors = previous[sectionId];
    if (prevErrors && !isSectionTypeErrorsEmpty(prevErrors)) {
      logTypeErrors("section-missing-cleared", {
        projectConfigId,
        sectionId,
      });
    }
  }

  logTypeErrors("merge-end", {
    projectConfigId,
    mergedSummary: summarizeTypeErrors(merged),
  });

  return merged;
}

export async function requestTypeCheck(userRequested: boolean = false) {
  if (useShareSession.getState().isShareMode) {
    return;
  }
  if (userRequested) {
    addTemporaryNotification("Checking types...");
    useTypeErrors.setState({ userRequested });
  }
  const projectConfigId = getCurrProjectConfigId();
  route_type_check({ projectConfigId });
}

export function processTypeErrors(content: SettaProjectConfigDiagnostics) {
  const p = useProjectState.getState();
  const { projectConfigId, errors } = content;
  if (projectConfigId !== p.projectConfig.id) {
    return;
  }

  const prevState = useTypeErrors.getState();
  if (prevState.userRequested) {
    const totalErrors = Object.values(errors).reduce((sum, section) => {
      const hasParamErrors = Object.keys(section.params).length > 0;
      const hasCallableErrors = section.callable.length > 0;
      return sum + (hasParamErrors ? 1 : 0) + (hasCallableErrors ? 1 : 0);
    }, 0);
    addTemporaryNotification(
      totalErrors === 0 ? "No type errors" : `Found ${totalErrors} type errors`,
    );
    useTypeErrors.setState({
      userRequested: false,
      errors,
    });
    return;
  }
  const merged = mergeTypeErrorsBySection(
    prevState.errors,
    errors,
    projectConfigId,
  );
  const errorsChanged = !areTypeErrorsEqual(prevState.errors, merged);
  if (!errorsChanged) {
    return;
  }
  useTypeErrors.setState({ userRequested: false, errors: merged });
}
