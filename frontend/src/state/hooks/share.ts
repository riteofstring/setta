import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { initializeShareDeployment } from "state/actions/share";
import { useProjectLoading, useShareSession } from "state/definitions";
import type { SharePolicy } from "utils/generatedTypes";

export function useLoadShareDeployment() {
  const { deploymentId } = useParams();
  const [doneLoading, setDoneLoading] = useState(false);
  const is404 = useProjectLoading((x) => x.projectIs404);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!deploymentId) {
        return;
      }
      setDoneLoading(false);
      await initializeShareDeployment(deploymentId);
      if (!isMounted) {
        return;
      }
      setDoneLoading(true);
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, [deploymentId]);

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
