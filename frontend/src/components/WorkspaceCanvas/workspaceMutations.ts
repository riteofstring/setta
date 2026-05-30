import { callOpenAPI } from "@setta/app-subsystem-frontend-sdk";
import _ from "lodash";
import { setTopLevelSectionLayout, setViewport } from "openapi/http";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import {
  NULL_PROJECT_CONFIG_ID,
  useProjectState,
  useShareSession,
} from "state/definitions";
import type { SingleConfig } from "utils/generatedTypes";
import type { WorkspaceViewport } from "./workspaceSceneTypes";

type WorkspaceTopLevelSectionLayoutMap =
  SingleConfig["projectConfig"]["topLevelSections"];

const sendWorkspaceViewportToBackend = _.debounce(
  (viewport: WorkspaceViewport) => {
    const projectConfigId = getCurrProjectConfigId();
    if (projectConfigId === NULL_PROJECT_CONFIG_ID) {
      return;
    }
    void callOpenAPI(
      setViewport<true>({
        body: {
          projectConfigId,
          viewport,
        },
      } as Parameters<typeof setViewport<true>>[0]),
    );
  },
  150,
);

const sendWorkspaceTopLevelSectionLayoutToBackend = _.debounce(
  (topLevelSections: WorkspaceTopLevelSectionLayoutMap) => {
    const projectConfigId = getCurrProjectConfigId();
    if (projectConfigId === NULL_PROJECT_CONFIG_ID) {
      return;
    }
    void callOpenAPI(
      setTopLevelSectionLayout<true>({
        body: {
          projectConfigId,
          topLevelSections,
        },
      } as Parameters<typeof setTopLevelSectionLayout<true>>[0]),
    );
  },
  150,
);

export function dispatchWorkspaceViewportUpdate(
  viewport: WorkspaceViewport,
  immediate = false,
) {
  const projectConfigId = getCurrProjectConfigId();
  if (projectConfigId === NULL_PROJECT_CONFIG_ID) {
    return;
  }
  useProjectState.setState((state) => {
    state.projectConfig.viewport = viewport;
    state.projectConfig.viewportInitialized = true;
    const { activeViewModeId, viewModes } = state.projectConfig;
    if (activeViewModeId && viewModes[activeViewModeId]) {
      viewModes[activeViewModeId].viewport = viewport;
      viewModes[activeViewModeId].viewportInitialized = true;
    }
  });
  sendWorkspaceViewportToBackend(viewport);
  if (immediate) {
    sendWorkspaceViewportToBackend.flush();
  }
}

export function dispatchWorkspaceTopLevelSectionLayoutUpdate(
  topLevelSections: WorkspaceTopLevelSectionLayoutMap,
  immediate = false,
) {
  const shareSession = useShareSession.getState();
  if (
    shareSession.isDeploymentMode &&
    shareSession.sharePolicy?.allowLayoutChanges === false
  ) {
    return;
  }
  const projectConfigId = getCurrProjectConfigId();
  if (projectConfigId === NULL_PROJECT_CONFIG_ID) {
    return;
  }
  useProjectState.setState((state) => {
    state.projectConfig.topLevelSections = topLevelSections;
    const { activeViewModeId, viewModes } = state.projectConfig;
    if (activeViewModeId && viewModes[activeViewModeId]) {
      viewModes[activeViewModeId].topLevelSections = topLevelSections;
    }
  });
  sendWorkspaceTopLevelSectionLayoutToBackend(topLevelSections);
  if (immediate) {
    sendWorkspaceTopLevelSectionLayoutToBackend.flush();
  }
}
