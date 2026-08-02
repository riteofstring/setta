import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { loadProjectConfig } from "state/actions/project/loadProject";
import { useProjectLoading, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { PAGE_LOAD_TYPES } from "utils/constants";
import { useHotReload } from "utils/hotReload";

type PendingPageLoadAction = {
  actionKey: string;
  pageLoadType: string;
} | null;

function setDoneLoadingIfNeeded(
  doneLoading: boolean,
  setDoneLoading: (value: boolean) => void,
) {
  if (!doneLoading) {
    setDoneLoading(true);
  }
}

function resolvePendingPageLoadAction({
  handledPageLoadActionKey,
  locationKey,
  pageLoadType,
}: {
  handledPageLoadActionKey: string | null;
  locationKey: string;
  pageLoadType: string | undefined;
}): PendingPageLoadAction {
  if (
    pageLoadType !== PAGE_LOAD_TYPES.CHANGE_PROJECT_CONFIG_NAME &&
    pageLoadType !== PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG
  ) {
    return null;
  }
  const actionKey = `${locationKey}:${pageLoadType}`;
  if (handledPageLoadActionKey === actionKey) {
    return null;
  }
  return { actionKey, pageLoadType };
}

function projectConfigMatchesRoute({
  currentProjectConfigName,
  projectConfigName,
}: {
  currentProjectConfigName: string;
  projectConfigName: string | undefined;
}) {
  return (
    Boolean(projectConfigName) && currentProjectConfigName === projectConfigName
  );
}

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

  function startProjectLoad() {
    useProjectLoading.setState({
      projectIsLoading: true,
      projectIs404: false,
    });
    void loadFn();
  }

  useEffect(() => {
    loadKeyRef.current = loadKey;
    if (isHotReload || isProjectLoading) {
      return;
    }

    const currentProjectConfigName =
      useProjectState.getState().projectConfig.name;
    const pendingPageLoadAction = resolvePendingPageLoadAction({
      handledPageLoadActionKey: handledPageLoadActionKeyRef.current,
      locationKey: location.key,
      pageLoadType,
    });

    if (pendingPageLoadAction !== null) {
      handledPageLoadActionKeyRef.current = pendingPageLoadAction.actionKey;
      if (
        pendingPageLoadAction.pageLoadType ===
        PAGE_LOAD_TYPES.CHANGE_PROJECT_CONFIG_NAME
      ) {
        changeFn();
        setDoneLoadingIfNeeded(doneLoading, setDoneLoading);
        return;
      }
      startProjectLoad();
      return;
    }

    if (
      projectConfigMatchesRoute({
        currentProjectConfigName,
        projectConfigName,
      }) ||
      resolvedIs404
    ) {
      setDoneLoadingIfNeeded(doneLoading, setDoneLoading);
      return;
    }

    startProjectLoad();
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
