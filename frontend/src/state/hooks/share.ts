import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { requestAIFollowSnapshot } from "state/actions/aiFollow";
import { fetchListenerCoverageSnapshot } from "state/actions/listenerCoverage";
import { loadProjectState } from "state/actions/project/loadProject";
import { ensureShareSessionFromCurrentDeployment } from "state/actions/share";
import { useShareSession } from "state/definitions";
import { useProjectLoading } from "state/stores/projectStatusStores";
import { resetProjectStores } from "state/utils";
import { res200 } from "utils/endpointUtils";
import { route_load_share_project_config } from "utils/generatedEndpoints";
import type { ProjectConfig } from "utils/generatedTypes";

function resolveProjectConfigId(
  projectMetadata: ProjectConfig[],
  requestedConfigName: string | undefined,
  defaultProjectConfigId: string | null,
): string | null {
  if (requestedConfigName) {
    for (const config of projectMetadata) {
      if (config.name === requestedConfigName) {
        return config.id;
      }
    }
    return null;
  }
  return defaultProjectConfigId;
}

export function useLoadShareDeployment(loadProject: boolean = true) {
  const { projectConfigName } = useParams();
  const [doneLoading, setDoneLoading] = useState(false);
  const is404 = useProjectLoading((x) => x.projectIs404);
  const loadKey = `${projectConfigName ?? ""}:${loadProject}`;
  const loadKeyRef = useRef(loadKey);
  const isStaleLoadKey = loadKeyRef.current !== loadKey;
  const resolvedDoneLoading = isStaleLoadKey ? false : doneLoading;
  const resolvedIs404 = isStaleLoadKey ? false : is404;

  useEffect(() => {
    let isMounted = true;
    loadKeyRef.current = loadKey;

    async function load() {
      setDoneLoading(false);
      resetProjectStores();
      useProjectLoading.setState({
        projectIsLoading: true,
        projectIs404: false,
      });
      const session = await ensureShareSessionFromCurrentDeployment();
      if (!session) {
        useProjectLoading.setState({
          projectIsLoading: false,
          projectIs404: true,
        });
        if (isMounted) {
          setDoneLoading(true);
        }
        return;
      }
      if (loadProject) {
        const resolvedConfigId = resolveProjectConfigId(
          session.projectMetadata,
          projectConfigName,
          session.defaultProjectConfigId,
        );
        if (!resolvedConfigId) {
          useProjectLoading.setState({
            projectIsLoading: false,
            projectIs404: true,
          });
          if (isMounted) {
            setDoneLoading(true);
          }
          return;
        }
        const stateRes = await route_load_share_project_config(
          session.deploymentName,
          session.deploymentVersion,
          { projectConfigId: resolvedConfigId },
        );
        if (!res200(stateRes)) {
          useProjectLoading.setState({
            projectIsLoading: false,
            projectIs404: true,
          });
          if (isMounted) {
            setDoneLoading(true);
          }
          return;
        }
        await loadProjectState(stateRes.data.projectState);
        await fetchListenerCoverageSnapshot(resolvedConfigId);
        if (session.sharePolicy.allowLLM) {
          await requestAIFollowSnapshot(resolvedConfigId);
        }
      }
      useProjectLoading.setState({
        projectIsLoading: false,
        projectIs404: false,
      });
      if (!isMounted) {
        return;
      }
      setDoneLoading(true);
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, [loadProject, projectConfigName]);

  return [resolvedDoneLoading, resolvedIs404] as const;
}

type ShareCapabilities = {
  canEditParams: boolean;
  canEditVariants: boolean;
  canEditLayout: boolean;
  canRun: boolean;
  canEditStructure: boolean;
};

export function useShareCapabilities(): ShareCapabilities {
  const isDeploymentMode = useShareSession((x) => x.isDeploymentMode);
  const sharePolicy = useShareSession((x) => x.sharePolicy);
  const allowParamChanges = sharePolicy?.allowParamChanges ?? true;
  const allowVariantChanges = sharePolicy?.allowVariantChanges ?? true;
  const allowLayoutChanges = sharePolicy?.allowLayoutChanges ?? true;
  const allowRun = sharePolicy?.allowRun ?? false;
  const canEditStructure = !isDeploymentMode;

  return {
    canEditParams: canEditStructure || allowParamChanges,
    canEditVariants: canEditStructure || allowVariantChanges,
    canEditLayout: canEditStructure || allowLayoutChanges,
    canRun: canEditStructure || allowRun,
    canEditStructure,
  };
}
