import { useStoreActions, useStoreState } from "easy-peasy";
import { useAuth } from "models/auth";
import { useEffect, useState } from "react";

// setDoneLoading sets the doneLoading state in MainContainer
export function useProjectToLoad() {
  const [doneLoading, setDoneLoading] = useState(false);

  const isAuthenticated = useAuth((x) => x.isAuthenticated);
  const idToLoad = useStoreState((x) => x.projectToLoad.id);
  const configIdToLoad = useStoreState((x) => x.projectToLoad.configId);
  const isLoading = useStoreState((x) => x.projectToLoad.isLoading);

  const setProject = useStoreActions((x) => x.projectToLoad.setProject);
  const setIsLoading = useStoreActions((x) => x.projectToLoad.setIsLoading);
  const loadProject = useStoreActions((x) => x.thunks.loadProject);

  useEffect(() => {
    async function fn() {
      setDoneLoading(false);
      const result = await loadProject({
        id: idToLoad,
        configId: configIdToLoad,
      });
      setProject({ id: null, configId: null });
      setDoneLoading(result);
    }

    if (isAuthenticated && idToLoad && configIdToLoad) {
      fn();
    }
  }, [idToLoad, configIdToLoad]);

  useEffect(() => {
    // If data is being loaded outside of here, and doneLoading = true
    // then set doneLoading to false.
    // Must compare to boolean values to prevent changes on initial render.
    if (isLoading === true) {
      setDoneLoading(false);
    } else if (isLoading === false) {
      setDoneLoading(true);
      setIsLoading(null);
    }
  }, [isLoading]);

  return doneLoading;
}

export function useCurrProjectId() {
  const id = useStoreState((x) => x.project.id);
  const configId = useStoreState((x) => x.projectConfig.id);
  return { id, configId };
}
