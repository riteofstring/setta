import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { initializeShareDeployment } from "state/actions/share";
import { useProjectLoading } from "state/definitions";

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
