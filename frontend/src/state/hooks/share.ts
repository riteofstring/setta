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

export function useSharePolicyFlag(
  flag: SharePolicyFlag,
  defaultValue: boolean = true,
): boolean {
  const policyValue = useShareSession((x) => {
    const policy = x.sharePolicy;
    if (!policy) {
      return undefined;
    }
    return policy[flag];
  });
  if (policyValue === undefined || policyValue === null) {
    return defaultValue;
  }
  return policyValue;
}
