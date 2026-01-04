import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { initializeShareDeployment } from "state/actions/share";
import { useProjectLoading, useShareSession } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_get_latest_share_deployment } from "utils/generatedEndpoints";
import type { SharePolicy } from "utils/generatedTypes";

type ShareRouteInfo = {
  deploymentName: string | null;
  deploymentVersion: string | null;
  requestedConfigName: string | null;
};

function isShareVersionSegment(value: string): boolean {
  return /^v\d+$/.test(value);
}

function resolveShareRouteInfo(
  deploymentName: string | undefined,
  version: string | undefined,
  targetProjectConfigName: string | undefined,
): ShareRouteInfo {
  const resolvedDeploymentName = deploymentName ?? null;
  const resolvedVersion = version ?? null;
  const resolvedTargetConfig = targetProjectConfigName ?? null;
  if (!resolvedDeploymentName) {
    return {
      deploymentName: null,
      deploymentVersion: null,
      requestedConfigName: null,
    };
  }
  if (resolvedTargetConfig) {
    return {
      deploymentName: resolvedDeploymentName,
      deploymentVersion: resolvedVersion,
      requestedConfigName: resolvedTargetConfig,
    };
  }
  if (resolvedVersion && !isShareVersionSegment(resolvedVersion)) {
    return {
      deploymentName: resolvedDeploymentName,
      deploymentVersion: null,
      requestedConfigName: resolvedVersion,
    };
  }
  return {
    deploymentName: resolvedDeploymentName,
    deploymentVersion: resolvedVersion,
    requestedConfigName: null,
  };
}

export function useLoadShareDeployment() {
  const { projectConfigName, version, targetProjectConfigName } = useParams();
  const navigate = useNavigate();
  const [doneLoading, setDoneLoading] = useState(false);
  const is404 = useProjectLoading((x) => x.projectIs404);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const routeInfo = resolveShareRouteInfo(
        projectConfigName,
        version,
        targetProjectConfigName,
      );
      if (!routeInfo.deploymentName) {
        return;
      }
      setDoneLoading(false);
      useProjectLoading.setState({
        projectIsLoading: true,
        projectIs404: false,
      });
      if (!routeInfo.deploymentVersion) {
        const latestRes = await route_get_latest_share_deployment(
          routeInfo.deploymentName,
        );
        if (!res200(latestRes)) {
          useProjectLoading.setState({
            projectIsLoading: false,
            projectIs404: true,
          });
          if (isMounted) {
            setDoneLoading(true);
          }
          return;
        }
        const resolvedVersion = latestRes.data.deploymentVersion;
        let targetPath = `/share/${routeInfo.deploymentName}/${resolvedVersion}`;
        if (routeInfo.requestedConfigName) {
          targetPath = `${targetPath}/${routeInfo.requestedConfigName}`;
        }
        navigate(targetPath, {
          replace: true,
        });
        return;
      }
      await initializeShareDeployment(
        routeInfo.deploymentName,
        routeInfo.deploymentVersion,
        routeInfo.requestedConfigName,
      );
      if (!isMounted) {
        return;
      }
      setDoneLoading(true);
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, [navigate, projectConfigName, targetProjectConfigName, version]);

  return [doneLoading, is404] as const;
}

type SharePolicyFlag = {
  [K in keyof SharePolicy]-?: SharePolicy[K] extends boolean ? K : never;
}[keyof SharePolicy];

type ShareCapabilities = {
  canEditParams: boolean;
  canEditVariants: boolean;
  canEditLayout: boolean;
  canEditStructure: boolean;
  canRun: boolean;
  canUseLsp: boolean;
  canUseLlm: boolean;
  canUseMcp: boolean;
};

function resolveSharePolicyFlag(
  sharePolicy: SharePolicy | null,
  flag: SharePolicyFlag,
  defaultValue: boolean,
): boolean {
  if (!sharePolicy) {
    return defaultValue;
  }
  const policyValue = sharePolicy[flag];
  if (policyValue === undefined || policyValue === null) {
    return defaultValue;
  }
  return policyValue;
}

function useSharePolicyFlag(
  flag: SharePolicyFlag,
  defaultValue: boolean = true,
): boolean {
  const sharePolicy = useShareSession((x) => x.sharePolicy);
  return resolveSharePolicyFlag(sharePolicy, flag, defaultValue);
}

export function useShareCapabilities(): ShareCapabilities {
  const isShareMode = useShareSession((x) => x.isShareMode);
  const sharePolicy = useShareSession((x) => x.sharePolicy);
  const allowParamChanges = resolveSharePolicyFlag(
    sharePolicy,
    "allowParamChanges",
    true,
  );
  const allowVariantChanges = resolveSharePolicyFlag(
    sharePolicy,
    "allowVariantChanges",
    true,
  );
  const allowLayoutChanges = resolveSharePolicyFlag(
    sharePolicy,
    "allowLayoutChanges",
    true,
  );
  const allowStructuralChanges = resolveSharePolicyFlag(
    sharePolicy,
    "allowStructuralChanges",
    true,
  );
  const allowRun = resolveSharePolicyFlag(sharePolicy, "allowRun", true);
  const allowLsp = resolveSharePolicyFlag(sharePolicy, "allowLSP", true);
  const allowLlm = resolveSharePolicyFlag(sharePolicy, "allowLLM", true);
  const allowMcp = resolveSharePolicyFlag(sharePolicy, "allowMCP", true);

  return {
    canEditParams: !isShareMode || allowParamChanges,
    canEditVariants: !isShareMode || allowVariantChanges,
    canEditLayout: !isShareMode || allowLayoutChanges,
    canEditStructure: !isShareMode || allowStructuralChanges,
    canRun: !isShareMode || allowRun,
    canUseLsp: !isShareMode || allowLsp,
    canUseLlm: !isShareMode || allowLlm,
    canUseMcp: !isShareMode || allowMcp,
  };
}
