import {
  useProjectState,
  useShareSession,
  useTypeErrors,
} from "state/definitions";
import { route_type_check } from "utils/generatedEndpoints";
import { SettaProjectConfigDiagnostics } from "utils/generatedTypes";
import { addTemporaryNotification } from "./notifications";
import { getCurrProjectConfigId } from "./sectionInfos";

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

  if (useTypeErrors.getState().userRequested) {
    const totalErrors = Object.values(errors).reduce((sum, section) => {
      const hasParamErrors = Object.keys(section.params).length > 0;
      const hasCallableErrors = section.callable.length > 0;
      return sum + (hasParamErrors ? 1 : 0) + (hasCallableErrors ? 1 : 0);
    }, 0);
    addTemporaryNotification(
      totalErrors === 0 ? "No type errors" : `Found ${totalErrors} type errors`,
    );
  }
  useTypeErrors.getState().reset();
  useTypeErrors.setState({ errors });
}
