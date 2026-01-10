import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { requestAIFollowSnapshot } from "state/actions/aiFollow";
import { loadProjectState } from "state/actions/project/loadProject";
import { ensureShareSessionFromCurrentDeployment } from "state/actions/share";
import { useProjectLoading, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { buildShareHomePath, buildSharePath } from "utils/constants";
import { res200 } from "utils/endpointUtils";
import { route_load_share_project_config } from "utils/generatedEndpoints";
import type { ProjectConfig } from "utils/generatedTypes";

function resolveShareRedirectPath(
  resolvedVersion: string,
  targetProjectConfigName: string | undefined,
  loadProject: boolean,
): string {
  if (!loadProject) {
    return buildShareHomePath(resolvedVersion);
  }
  return buildSharePath(resolvedVersion, targetProjectConfigName);
}

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
  const { version, targetProjectConfigName } = useParams();
  const navigate = useNavigate();
  const [doneLoading, setDoneLoading] = useState(false);
  const is404 = useProjectLoading((x) => x.projectIs404);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!version) {
        if (isMounted) {
          setDoneLoading(true);
        }
        return;
      }
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
      const resolvedVersion = session.deploymentVersion;
      if (version === "latest") {
        const targetPath = resolveShareRedirectPath(
          resolvedVersion,
          targetProjectConfigName,
          loadProject,
        );
        navigate(targetPath, {
          replace: true,
        });
        return;
      }
      if (version !== resolvedVersion) {
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
          targetProjectConfigName,
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
  }, [loadProject, navigate, targetProjectConfigName, version]);

  return [doneLoading, is404] as const;
}

type ShareCapabilities = {
  canEditParams: boolean;
  canEditVariants: boolean;
  canEditLayout: boolean;
  canRun: boolean;
  canEditStructure: boolean;
};

export function useShareCapabilities(): ShareCapabilities {
  const isShareMode = useShareSession((x) => x.isShareMode);
  const sharePolicy = useShareSession((x) => x.sharePolicy);
  const allowParamChanges = sharePolicy?.allowParamChanges ?? true;
  const allowVariantChanges = sharePolicy?.allowVariantChanges ?? true;
  const allowLayoutChanges = sharePolicy?.allowLayoutChanges ?? true;
  const allowRun = sharePolicy?.allowRun ?? false;
  const canEditStructure = !isShareMode;

  return {
    canEditParams: canEditStructure || allowParamChanges,
    canEditVariants: canEditStructure || allowVariantChanges,
    canEditLayout: canEditStructure || allowLayoutChanges,
    canRun: canEditStructure || allowRun,
    canEditStructure,
  };
}
