import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { loadProjectConfig } from "state/actions/project/loadProject";
import { useProjectLoading, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { PAGE_LOAD_TYPES } from "utils/constants";
import { useHotReload } from "utils/hotReload";

export function resolveProjectLoadIntent({
  projectConfigName,
  doneLoading,
  pageLoadType,
}: {
  projectConfigName: string | undefined;
  doneLoading: boolean;
  pageLoadType: string | undefined;
}): "load" | "change" | null {
  if (!projectConfigName) {
    return null;
  }
  if (!doneLoading || pageLoadType === PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG) {
    return "load";
  }
  if (pageLoadType === PAGE_LOAD_TYPES.CHANGE_PROJECT_CONFIG_NAME) {
    return "change";
  }
  return null;
}

export function useLoadProjectConfig() {
  const { projectConfigName } = useParams();
  const { state } = useLocation();
  const pageLoadType = state?.pageLoadType;
  const [doneLoading, setDoneLoading] = useState(false);
  const is404 = useProjectLoading((x) => x.projectIs404);
  const isHotReload = useHotReload();

  async function loadFn() {
    resetProjectStores();
    setDoneLoading(false);
    const res = await loadProjectConfig({ projectConfigName });
    setDoneLoading(true);
    useProjectLoading.setState({ projectIsLoading: false, projectIs404: !res });
  }

  function changeFn() {
    if (!projectConfigName) {
      return;
    }
    useProjectState.setState((state) => {
      state.projectConfig.name = projectConfigName;
    });
    useProjectLoading.setState({
      projectIsLoading: false,
      projectIs404: false,
    });
  }

  useEffect(() => {
    // Avoid kicking off a load while Vite is hot reloading. When a reload lands
    // mid-navigation, we want to retry once the update settles instead of
    // leaving the project in a permanently "loading" state.
    if (isHotReload) {
      return;
    }

    if (useProjectLoading.getState().projectIsLoading) {
      return;
    }

    const intent = resolveProjectLoadIntent({
      projectConfigName,
      doneLoading,
      pageLoadType,
    });
    if (!intent) {
      return;
    }

    useProjectLoading.setState({ projectIsLoading: true });

    if (intent === "load") {
      void loadFn();
    } else if (intent === "change") {
      changeFn();
    }
  }, [isHotReload, pageLoadType, projectConfigName]);

  return [doneLoading, is404];
}
