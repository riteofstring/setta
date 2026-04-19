import { createAppSubsystemFrontendHost } from "@setta/app-subsystem-frontend-sdk";
import type { Dispatch, SetStateAction } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as endpoints from "openapi/http";
import { useProjectState, type ZustandProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createProjectConfig,
  createSectionCapabilities,
  createSettingsState,
} from "utils/generatedTypes";
import { AppSubsystemFrontendHostProvider } from "../../../../plugins/setta-json-render-app-gen/frontend/src/appSubsystemFrontendHostContext";
import { useAppConfigs } from "../../../../plugins/setta-json-render-app-gen/frontend/src/appSubsystemProjectState";

import {
  useAppActionHandlers,
  type AppActionHandler,
} from "../../../../plugins/setta-json-render-app-gen/frontend/src/components/App/appActionHandlers";

const setIsRunning: Dispatch<SetStateAction<boolean>> = () => {};
const setLocalRunCount: Dispatch<SetStateAction<number>> = () => {};

let latestHandlers: Record<string, AppActionHandler> = {};

function buildAppConfigState(
  configId: string,
  sectionId: string,
): ZustandProjectState {
  const baseState = useProjectState.getState();
  return {
    ...baseState,
    projectConfig: createProjectConfig({ id: configId }),
    sectionCapabilities: {
      [sectionId]: createSectionCapabilities({
        canRun: true,
        runRequestSectionId: sectionId,
      }),
    },
  };
}

function renderActionHandlers(args: {
  actionDefinitions: Record<string, Record<string, unknown>>;
  fallbackConfigId: string | null;
  deploymentMode?: boolean;
  defaultRunSnapshotMode?: ReturnType<
    typeof createSettingsState
  >["backend"]["runSnapshotMode"];
  runSnapshotModeByProjectConfigId?: Record<
    string,
    ReturnType<typeof createSettingsState>["backend"]["runSnapshotMode"]
  >;
}) {
  const {
    actionDefinitions,
    fallbackConfigId,
    deploymentMode = false,
    defaultRunSnapshotMode = createSettingsState().backend.runSnapshotMode,
    runSnapshotModeByProjectConfigId = {},
  } = args;

  const frontendHost = createAppSubsystemFrontendHost({
    getRuntimeContext: () => ({
      isAppDeploymentMode: deploymentMode,
      shareSessionId: deploymentMode ? "share-session" : null,
      sessionRunCount: 0,
      sharePolicy: null,
      defaultRunSnapshotMode,
      runSnapshotModeByProjectConfigId,
    }),
    subscribeRuntimeContext: () => () => undefined,
  });

  function Harness() {
    latestHandlers = useAppActionHandlers({
      actionDefinitions,
      fallbackConfigId,
      allowFileDownloads: true,
      allowExternalLinks: true,
      allowRun: true,
      allowParamChanges: true,
      allowVariantChanges: true,
      allowMultipleRuns: true,
      effectiveRunCount: 0,
      deploymentMode,
      isRunning: false,
      setIsRunning,
      setLocalRunCount,
    });
    return null;
  }

  renderToStaticMarkup(
    <AppSubsystemFrontendHostProvider host={frontendHost}>
      <Harness />
    </AppSubsystemFrontendHostProvider>,
  );
}

describe("useAppActionHandlers", () => {
  beforeEach(() => {
    resetProjectStores();
    latestHandlers = {};
  });

  afterEach(() => {
    resetProjectStores();
    vi.restoreAllMocks();
  });

  it("uses the project snapshot override when building app run requests", async () => {
    const configId = "config-a";
    const sectionId = "section-1";
    useAppConfigs.setState({
      configs: {
        [configId]: buildAppConfigState(configId, sectionId),
      },
    });

    const runSpy = vi.spyOn(endpoints, "runCode").mockResolvedValue({
      data: null,
      request: new Request("http://localhost/runCode"),
      response: new Response(null, { status: 200 }),
    });

    renderActionHandlers({
      fallbackConfigId: configId,
      actionDefinitions: {
        runCustom: {
          type: "run",
          configId,
          sectionId,
          paramOverrides: {
            [`${sectionId}:param-1`]: "override",
          },
          sectionVariantOverrides: {
            [sectionId]: "variant-2",
          },
        },
      },
      defaultRunSnapshotMode: "ephemeral",
      runSnapshotModeByProjectConfigId: {
        [configId]: "always",
      },
    });

    await latestHandlers.runCustom?.();

    expect(runSpy).toHaveBeenCalledWith({
      body: {
        cliId: "",
        drawSnapshotsBySectionId: {},
        paramOverrides: { [`${sectionId}:param-1`]: "override" },
        projectConfigId: configId,
        runSnapshotMode: "always",
        sectionId,
        sectionVariantOverrides: { [sectionId]: "variant-2" },
        terminalSectionId: "",
      },
    });
  });

  it("falls back to the backend snapshot setting when no project override exists", async () => {
    const configId = "config-b";
    const sectionId = "section-2";
    useAppConfigs.setState({
      configs: {
        [configId]: buildAppConfigState(configId, sectionId),
      },
    });

    const runSpy = vi.spyOn(endpoints, "runCode").mockResolvedValue({
      data: null,
      request: new Request("http://localhost/runCode"),
      response: new Response(null, { status: 200 }),
    });

    renderActionHandlers({
      fallbackConfigId: configId,
      actionDefinitions: {
        runCustom: {
          type: "run",
          configId,
          sectionId,
        },
      },
      defaultRunSnapshotMode: "never",
    });

    await latestHandlers.runCustom?.();

    expect(runSpy).toHaveBeenCalledWith({
      body: {
        cliId: "",
        drawSnapshotsBySectionId: {},
        paramOverrides: {},
        projectConfigId: configId,
        runSnapshotMode: "never",
        sectionId,
        sectionVariantOverrides: {},
        terminalSectionId: "",
      },
    });
  });
});
