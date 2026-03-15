import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { loadProjectConfig } from "state/actions/project/loadProject";
import { useProjectState } from "state/definitions";
import { useProjectLoading } from "state/stores/projectStatusStores";
import { resetProjectStores } from "state/utils";
import { PAGE_LOAD_TYPES } from "utils/constants";
import { useHotReload } from "utils/hotReload";

export function useLoadProjectConfig() {
  const { projectConfigName } = useParams();
  const location = useLocation();
  const pageLoadType = location.state?.pageLoadType;
  const [doneLoading, setDoneLoading] = useState(false);
  const is404 = useProjectLoading((x) => x.projectIs404);
  const isProjectLoading = useProjectLoading((x) => x.projectIsLoading);
  const isHotReload = useHotReload();
  const loadKey = `${projectConfigName ?? ""}:${pageLoadType ?? ""}`;
  const loadKeyRef = useRef(loadKey);
  const handledPageLoadActionKeyRef = useRef<string | null>(null);
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
    const pageLoadActionKey =
      pageLoadType === undefined ? null : `${location.key}:${pageLoadType}`;
    const hasUnhandledPageLoadAction =
      pageLoadActionKey !== null &&
      handledPageLoadActionKeyRef.current !== pageLoadActionKey;

    if (
      pageLoadType === PAGE_LOAD_TYPES.CHANGE_PROJECT_CONFIG_NAME &&
      hasUnhandledPageLoadAction
    ) {
      handledPageLoadActionKeyRef.current = pageLoadActionKey;
      changeFn();
      if (!doneLoading) {
        setDoneLoading(true);
      }
      return;
    }

    if (
      pageLoadType === PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG &&
      hasUnhandledPageLoadAction
    ) {
      handledPageLoadActionKeyRef.current = pageLoadActionKey;
      useProjectLoading.setState({
        projectIsLoading: true,
        projectIs404: false,
      });
      void loadFn();
      return;
    }

    if (projectConfigMatchesRoute || resolvedIs404) {
      if (!doneLoading) {
        setDoneLoading(true);
      }
      return;
    }

    useProjectLoading.setState({ projectIsLoading: true, projectIs404: false });
    void loadFn();
  }, [
    doneLoading,
    isHotReload,
    isProjectLoading,
    loadKey,
    location.key,
    pageLoadType,
    projectConfigName,
    resolvedIs404,
  ]);

  return [resolvedDoneLoading, resolvedIs404] as const;
}
