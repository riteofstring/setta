import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { initializeShareDeployment } from "state/actions/share";
import { useProjectLoading, useShareSession } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_get_latest_share_deployment } from "utils/generatedEndpoints";
import type { SharePolicy } from "utils/generatedTypes";

export function useLoadShareDeployment() {
  const { projectConfigName, version } = useParams();
  const navigate = useNavigate();
  const [doneLoading, setDoneLoading] = useState(false);
  const is404 = useProjectLoading((x) => x.projectIs404);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!projectConfigName) {
        return;
      }
      setDoneLoading(false);
      useProjectLoading.setState({
        projectIsLoading: true,
        projectIs404: false,
      });
      if (!version) {
        const latestRes =
          await route_get_latest_share_deployment(projectConfigName);
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
        navigate(`/share/${projectConfigName}/${resolvedVersion}`, {
          replace: true,
        });
        return;
      }
      await initializeShareDeployment(projectConfigName, version);
      if (!isMounted) {
        return;
      }
      setDoneLoading(true);
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, [navigate, projectConfigName, version]);

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
