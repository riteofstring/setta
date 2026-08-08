import { callOpenAPI, res200 } from "@setta/app-subsystem-frontend-sdk";
import { getShareDeploymentProjectConfig } from "openapi/http";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { requestAIFollowSnapshot } from "state/actions/aiFollow";
import { fetchListenerCoverageSnapshot } from "state/actions/listenerCoverage";
import { loadProjectState } from "state/actions/project/loadProject";
import { ensureShareSessionFromCurrentDeployment } from "state/actions/share";
import { useProjectLoading, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import type {
  Policy,
  ProjectConfigMetadata,
  SingleConfig,
} from "utils/generatedTypes";
function resolveProjectConfigId(
  projectMetadata: ProjectConfigMetadata[],
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

type ShareDeploymentSession = NonNullable<
  Awaited<ReturnType<typeof ensureShareSessionFromCurrentDeployment>>
>;

function completeShareDeploymentLoad(
  projectIs404: boolean,
  isMounted: boolean,
  setDoneLoading: (value: boolean) => void,
): void {
  useProjectLoading.setState({
    projectIsLoading: false,
    projectIs404,
  });
  if (isMounted) {
    setDoneLoading(true);
  }
}

async function loadShareDeploymentProject({
  session,
  projectConfigName,
}: {
  session: ShareDeploymentSession;
  projectConfigName: string | undefined;
}): Promise<boolean> {
  const resolvedConfigId = resolveProjectConfigId(
    session.projectMetadata ?? [],
    projectConfigName,
    session.defaultProjectConfigId,
  );
  if (!resolvedConfigId) {
    return false;
  }
  const stateRes = await callOpenAPI(
    getShareDeploymentProjectConfig({
      path: {
        deploymentName: session.deploymentName,
        version: session.deploymentVersion,
      },
      body: {
        projectConfigId: resolvedConfigId,
      },
    } as Parameters<typeof getShareDeploymentProjectConfig>[0]),
  );
  if (!res200(stateRes)) {
    return false;
  }
  await loadProjectState(
    (
      stateRes.data as {
        projectState: SingleConfig;
      }
    ).projectState,
  );
  await fetchListenerCoverageSnapshot(resolvedConfigId);
  if (session.sharePolicy.allowLLM) {
    await requestAIFollowSnapshot(resolvedConfigId);
  }
  return true;
}

async function loadShareDeploymentState({
  loadProject,
  projectConfigName,
}: {
  loadProject: boolean;
  projectConfigName: string | undefined;
}): Promise<boolean> {
  const session = await ensureShareSessionFromCurrentDeployment();
  if (!session) {
    return false;
  }
  if (!loadProject) {
    return true;
  }
  return await loadShareDeploymentProject({
    session,
    projectConfigName,
  });
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
      const didLoad = await loadShareDeploymentState({
        loadProject,
        projectConfigName,
      });
      completeShareDeploymentLoad(!didLoad, isMounted, setDoneLoading);
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

const EDIT_SHARE_CAPABILITIES: ShareCapabilities = {
  canEditParams: true,
  canEditVariants: true,
  canEditLayout: true,
  canRun: true,
  canEditStructure: true,
};

const DEFAULT_DEPLOYMENT_POLICY_CAPABILITIES = {
  allowParamChanges: true,
  allowVariantChanges: true,
  allowLayoutChanges: true,
  allowRun: false,
} satisfies Pick<
  Policy,
  | "allowParamChanges"
  | "allowVariantChanges"
  | "allowLayoutChanges"
  | "allowRun"
>;

function resolveDeploymentShareCapabilities(
  sharePolicy: Policy | null,
): ShareCapabilities {
  const resolvedPolicy = {
    ...DEFAULT_DEPLOYMENT_POLICY_CAPABILITIES,
    ...sharePolicy,
  };
  return {
    canEditParams: resolvedPolicy.allowParamChanges,
    canEditVariants: resolvedPolicy.allowVariantChanges,
    canEditLayout: resolvedPolicy.allowLayoutChanges,
    canRun: resolvedPolicy.allowRun,
    canEditStructure: false,
  };
}

export function useShareCapabilities(): ShareCapabilities {
  const isDeploymentMode = useShareSession((x) => x.isDeploymentMode);
  const sharePolicy = useShareSession((x) => x.sharePolicy);
  if (!isDeploymentMode) {
    return EDIT_SHARE_CAPABILITIES;
  }
  return resolveDeploymentShareCapabilities(sharePolicy);
}
