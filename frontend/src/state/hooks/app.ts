import { useEffect, useState } from "react";
import {
  ensureAppSessionFromCurrentDeployment,
  loadAppDeploymentState,
} from "state/actions/app";
import { useProjectLoading } from "state/stores/projectStatusStores";
import { resetProjectStores } from "state/utils";

export function useLoadAppDeployment() {
  const [doneLoading, setDoneLoading] = useState(false);
  const is404 = useProjectLoading((x) => x.projectIs404);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setDoneLoading(false);
      resetProjectStores();
      useProjectLoading.setState({
        projectIsLoading: true,
        projectIs404: false,
      });
      const session = await ensureAppSessionFromCurrentDeployment();
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
      const loaded = await loadAppDeploymentState();
      useProjectLoading.setState({
        projectIsLoading: false,
        projectIs404: !loaded,
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
  }, []);

  return [doneLoading, is404] as const;
}
