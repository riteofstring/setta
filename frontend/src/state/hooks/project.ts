import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { loadProjectConfig } from "state/actions/project/loadProject";
import { useProjectLoading, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { PAGE_LOAD_TYPES } from "utils/constants";
import { useHotReload } from "utils/hotReload";

export function useLoadProjectConfig() {
  const { projectConfigName } = useParams();
  const { state } = useLocation();
  const pageLoadType = state?.pageLoadType;
  const [doneLoading, setDoneLoading] = useState(false);
  const is404 = useProjectLoading((x) => x.projectIs404);
  const isProjectLoading = useProjectLoading((x) => x.projectIsLoading);
  const isHotReload = useHotReload();
  const loadKey = `${projectConfigName ?? ""}:${pageLoadType ?? ""}`;
  const loadKeyRef = useRef(loadKey);
  const isStaleLoadKey = loadKeyRef.current !== loadKey;
  const resolvedDoneLoading = isStaleLoadKey ? false : doneLoading;
  const resolvedIs404 = isStaleLoadKey ? false : is404;

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
    loadKeyRef.current = loadKey;
    if (isHotReload || isProjectLoading) {
      return;
    }

    const currentProjectConfigName =
      useProjectState.getState().projectConfig.name;
    const projectConfigMatchesRoute =
      Boolean(projectConfigName) &&
      currentProjectConfigName === projectConfigName;

    if (pageLoadType === PAGE_LOAD_TYPES.CHANGE_PROJECT_CONFIG_NAME) {
      changeFn();
      if (!doneLoading) {
        setDoneLoading(true);
      }
      return;
    }

    if (
      projectConfigMatchesRoute &&
      pageLoadType !== PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG
    ) {
      if (!doneLoading) {
        setDoneLoading(true);
      }
      return;
    }

    useProjectLoading.setState({ projectIsLoading: true });

    const shouldReloadProjectConfig =
      pageLoadType === PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG ||
      !doneLoading ||
      currentProjectConfigName !== projectConfigName;

    if (shouldReloadProjectConfig) {
      loadFn();
    }
  }, [
    doneLoading,
    isHotReload,
    isProjectLoading,
    loadKey,
    pageLoadType,
    projectConfigName,
  ]);

  return [resolvedDoneLoading, resolvedIs404] as const;
}
