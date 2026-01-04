import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { initializeShareDeployment } from "state/actions/share";
import { useProjectLoading, useShareSession } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_get_latest_share_deployment } from "utils/generatedEndpoints";

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
