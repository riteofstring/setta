import { expect, type Locator, type Page } from "@playwright/test";
import * as http from "node:http";

import {
  applyProjectMutationsFromFrontend,
  createTopLevelSectionFromFrontend,
  ensureManagedChatEngine,
  postBackend,
} from "../helpers";
import {
  BACKEND_HELPER_REQUEST_HEADERS,
  BACKEND_ORIGIN,
  MANAGED_CHAT_PROVIDER_RESPONSE_DELAY_MS,
  type DeterministicManagedChatEngine,
  type EngineConfigSummary,
  type LatestProjectStateResponse,
  type LLMConfigPayload,
  type ManagedAPIKeysSnapshot,
  type ManagedChatProviderRequest,
  type ManagedChatProviderServer,
  type WorkflowRunRecord,
} from "./state-machine-section-test-types";

export async function ensureDeterministicManagedChatEngine(
  page: Page,
): Promise<DeterministicManagedChatEngine> {
  const restoreManagedEngine = await ensureManagedChatEngine(page);
  const initialLLMConfig = await getBackend<LLMConfigPayload>(
    page,
    "/llm/config",
  );
  if (!initialLLMConfig) {
    await restoreManagedEngine();
    throw new Error("Missing LLM config payload.");
  }
  const initialAPIKeysSnapshot = await getBackend<ManagedAPIKeysSnapshot>(
    page,
    "/llm/apiKeys",
  );
  if (!initialAPIKeysSnapshot) {
    await restoreManagedEngine();
    throw new Error("Missing managed API keys snapshot.");
  }
  const engineConfigs = await getBackend<EngineConfigSummary[]>(
    page,
    "/getEngineConfigs",
  );
  const managedEngine =
    engineConfigs?.find((config) => config.engineType === "setta_llm") ?? null;
  if (!managedEngine?.id || !managedEngine.settaLlmConfigId) {
    await restoreManagedEngine();
    throw new Error("Missing managed engine config.");
  }

  const providerServer = await startManagedChatProviderServer();
  let latestAPIKeysSnapshot = initialAPIKeysSnapshot;
  try {
    await postBackend(page, "/llm/config", {
      ...initialLLMConfig,
      configs: {
        ...initialLLMConfig.configs,
        [managedEngine.settaLlmConfigId]: {
          ...(initialLLMConfig.configs[managedEngine.settaLlmConfigId] ?? {
            model: "gpt-4o-mini",
            provider: "openai",
          }),
          model: "gpt-4o-mini",
          provider: "openai",
          api_key_env: "OPENAI_API_KEY",
          base_url: `${providerServer.origin}/v1`,
          other_params: null,
        },
      },
    } as Record<string, unknown>);
    latestAPIKeysSnapshot = await postManagedAPIKeys(page, {
      apiKeys: {
        ...initialAPIKeysSnapshot.apiKeys,
        OPENAI_API_KEY: "e2e-workflow-secret",
      },
      expectedRevision: initialAPIKeysSnapshot.revision,
    });
  } catch (error) {
    await providerServer.close();
    await restoreManagedEngine();
    throw error;
  }

  return {
    engineConfigId: managedEngine.id,
    providerServer,
    cleanup: async () => {
      try {
        await postManagedAPIKeys(page, {
          apiKeys: initialAPIKeysSnapshot.apiKeys,
          expectedRevision: latestAPIKeysSnapshot.revision,
        });
      } catch {
        // Ignore teardown failures; the seeded workspace is disposable.
      }
      try {
        await postBackend(page, "/llm/config", {
          ...initialLLMConfig,
        } as Record<string, unknown>);
      } catch {
        // Ignore teardown failures; the seeded workspace is disposable.
      }
      await providerServer.close().catch(() => {
        // Ignore teardown failures; the seeded workspace is disposable.
      });
      await restoreManagedEngine();
    },
  };
}

export async function postManagedAPIKeys(
  page: Page,
  payload: {
    apiKeys: Record<string, string>;
    expectedRevision: number;
  },
): Promise<ManagedAPIKeysSnapshot> {
  const response = await page.request.post(
    `${BACKEND_ORIGIN}/api/llm/apiKeys`,
    {
      data: payload,
      headers: BACKEND_HELPER_REQUEST_HEADERS,
    },
  );
  const text = await response.text();
  if (!response.ok()) {
    const detail = text ? ` ${text}` : "";
    throw new Error(
      `Backend request failed (${response.status()}): /llm/apiKeys${detail}`,
    );
  }
  return JSON.parse(text) as ManagedAPIKeysSnapshot;
}

export async function startManagedChatProviderServer(): Promise<ManagedChatProviderServer> {
  const requests: ManagedChatProviderRequest[] = [];
  return await new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const chunks: string[] = [];
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        chunks.push(chunk);
      });
      request.on("end", () => {
        try {
          const rawBody = chunks.join("");
          const body = rawBody
            ? (JSON.parse(rawBody) as Record<string, unknown>)
            : {};
          requests.push({
            path: new URL(request.url ?? "/", "http://127.0.0.1").pathname,
            authorization: Array.isArray(request.headers.authorization)
              ? request.headers.authorization.join(", ")
              : request.headers.authorization ?? "",
            body,
          });
        } catch (error) {
          response.statusCode = 400;
          response.end(String(error));
          return;
        }
        const responseTimer = setTimeout(() => {
          if (response.destroyed || response.writableEnded) {
            return;
          }
          response.statusCode = 200;
          response.setHeader("content-type", "text/event-stream");
          response.write(
            'data: {"choices":[{"index":0,"delta":{"content":"Workflow child"}}]}\n\n',
          );
          response.write(
            'data: {"choices":[{"index":0,"delta":{"content":" reply"},"finish_reason":"stop"}]}\n\n',
          );
          response.write(
            'data: {"choices":[],"usage":{"prompt_tokens":13,"completion_tokens":2,"total_tokens":15}}\n\n',
          );
          response.end("data: [DONE]\n\n");
        }, MANAGED_CHAT_PROVIDER_RESPONSE_DELAY_MS);
        request.once("close", () => {
          clearTimeout(responseTimer);
        });
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Unable to allocate managed provider test port.")),
        );
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        requests,
        close: async () =>
          await new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          }),
      });
    });
  });
}

export function asStaleRunningWorkflowRun(
  run: WorkflowRunRecord,
): WorkflowRunRecord {
  return {
    ...run,
    status: "running",
    finishedAt: null,
    events: (run.events ?? []).filter(
      (event) => event.type !== "run_completed",
    ),
  };
}

export async function installWebSocketMessageHarness(
  page: Page,
): Promise<void> {
  await page.addInitScript(() => {
    const windowWithSockets = window as typeof window & {
      __settaTrackedSockets?: WebSocket[];
      __settaTrackedSocketsInstalled?: boolean;
    };
    if (!windowWithSockets.__settaTrackedSockets) {
      windowWithSockets.__settaTrackedSockets = [];
    }
    if (windowWithSockets.__settaTrackedSocketsInstalled) {
      return;
    }
    const OriginalWebSocket = WebSocket;
    const WrappedWebSocket = function (
      this: WebSocket,
      url: string | URL,
      protocols?: string | string[],
    ) {
      const socket =
        protocols === undefined
          ? new OriginalWebSocket(url)
          : new OriginalWebSocket(url, protocols);
      windowWithSockets.__settaTrackedSockets!.push(socket);
      socket.addEventListener(
        "close",
        () => {
          windowWithSockets.__settaTrackedSockets =
            windowWithSockets.__settaTrackedSockets!.filter(
              (candidate) => candidate !== socket,
            );
        },
        { once: true },
      );
      return socket;
    } as typeof WebSocket;
    WrappedWebSocket.prototype = OriginalWebSocket.prototype;
    Object.assign(WrappedWebSocket, OriginalWebSocket);
    window.WebSocket = WrappedWebSocket;
    windowWithSockets.__settaTrackedSocketsInstalled = true;
  });
}

export async function waitForHarnessedWebSocket(page: Page): Promise<void> {
  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          return (
            (
              window as typeof window & {
                __settaTrackedSockets?: WebSocket[];
              }
            ).__settaTrackedSockets?.length ?? 0
          );
        }),
      { timeout: 15000 },
    )
    .toBeGreaterThan(0);
}

export async function emitSyntheticWebSocketMessage(
  page: Page,
  message: Record<string, unknown>,
): Promise<void> {
  await page.evaluate((payload) => {
    const sockets =
      (
        window as typeof window & {
          __settaTrackedSockets?: WebSocket[];
        }
      ).__settaTrackedSockets ?? [];
    const data = JSON.stringify(payload);
    for (const socket of sockets) {
      socket.dispatchEvent(
        new MessageEvent("message", {
          data,
        }),
      );
    }
  }, message);
}

export async function createSectionViaCommandPalette(
  page: Page,
  projectConfigId: string,
  optionName: string,
): Promise<string> {
  const existingSectionIds = await getSectionIds(page, projectConfigId);
  const shortcut =
    process.platform === "darwin" ? "Meta+Shift+P" : "Control+Shift+P";
  const searchInput = page.locator("#ProjectPageSearchBar");

  await page.keyboard.press(shortcut);
  await expect(searchInput).toBeVisible({ timeout: 3000 });
  await searchInput.fill(optionName);

  const option = page
    .getByRole("option", { name: optionName, exact: true })
    .first();
  if (await option.isVisible({ timeout: 2500 })) {
    await option.click();
  } else {
    await page.keyboard.press("Enter");
  }

  return await waitForNewSectionId(page, projectConfigId, existingSectionIds);
}

export async function createTopLevelSection(
  page: Page,
  projectConfigId: string,
  implType:
    | "Chat"
    | "StateMachineGate"
    | "StateMachineStart"
    | "StateMachineEnd",
  position: { x: number; y: number },
): Promise<string> {
  const response = await createTopLevelSectionFromFrontend(page, {
    projectConfigId,
    implType,
    position,
  });
  if (!response?.sectionId) {
    throw new Error(`Missing sectionId when creating ${implType}.`);
  }
  return response.sectionId;
}

export async function setStateMachineSectionSettings(
  page: Page,
  projectConfigId: string,
  sectionId: string,
  payload: {
    machineGroupId: string;
    label: string;
    gateType: string | null;
    maxIterations?: number | null;
  },
): Promise<void> {
  await applyProjectMutationsFromFrontend(page, {
    projectConfigId,
    operations: [
      {
        operationName: "setStateMachineSectionSettings",
        body: {
          sectionId,
          machineGroupId: payload.machineGroupId,
          label: payload.label,
          gateType: payload.gateType,
          frontendOpId: null,
        },
      },
    ],
  });
}

export async function createStateMachineEdge(
  page: Page,
  projectConfigId: string,
  payload: {
    machineGroupId: string;
    sourceSectionId: string;
    sourcePortId: string;
    targetSectionId: string;
    targetPortId: string;
    sourceFilter: {
      type: string;
      signalName: string | null;
      payloadField: string | null;
      equals: string | null;
    } | null;
    sourceActivationCountCondition?: {
      operator: string;
      value: number;
    } | null;
    targetAction: {
      type: string;
      promptTemplateId: string | null;
      promptSectionId?: string | null;
      inlinePrompt: string | null;
      promptInputs?: Record<string, string>;
      threadStrategy: string;
      stopIfRunning: boolean;
      engineConfigId: string | null;
      agentProfileId: string | null;
      permissionMode: string | null;
      searchEnabled: boolean | null;
    } | null;
  },
): Promise<void> {
  await applyProjectMutationsFromFrontend(page, {
    projectConfigId,
    operations: [
      {
        operationName: "createStateMachineEdge",
        body: {
          ...payload,
          frontendOpId: null,
        },
      },
    ],
  });
}

export async function createStateMachineEdgeFromFrontendConnection(
  page: Page,
  connection: {
    source: string;
    sourceHandle: string;
    target: string;
    targetHandle: string;
  },
): Promise<void> {
  await page.evaluate(async (input) => {
    const { createStateMachineEdgeFromConnection } = await import(
      "/src/state/actions/stateMachineEdges.ts"
    );
    createStateMachineEdgeFromConnection(input);
  }, connection);
}

export async function deleteStateMachineEdgesFromFrontend(
  page: Page,
  projectConfigId: string,
  edgeIds: string[],
): Promise<void> {
  if (edgeIds.length === 0) {
    return;
  }
  await applyProjectMutationsFromFrontend(page, {
    projectConfigId,
    operations: [
      {
        operationName: "deleteStateMachineEdges",
        body: {
          edgeIds,
          frontendOpId: null,
        },
      },
    ],
  });
}

export async function setPromptTemplateFromFrontend(
  page: Page,
  payload: {
    projectConfigId: string;
    sectionId: string;
    template: string;
  },
): Promise<void> {
  await applyProjectMutationsFromFrontend(page, {
    projectConfigId: payload.projectConfigId,
    operations: [
      {
        operationName: "setPromptTemplate",
        body: {
          sectionId: payload.sectionId,
          template: payload.template,
          frontendOpId: null,
        },
      },
    ],
  });
}

export async function getSectionIds(
  page: Page,
  projectConfigId: string,
): Promise<string[]> {
  const response = await postBackend<LatestProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  return Object.keys(
    response?.projectState?.projectConfig?.sectionVariantMap ?? {},
  );
}

export async function waitForNewSectionId(
  page: Page,
  projectConfigId: string,
  existingSectionIds: string[],
): Promise<string> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 8000) {
    const currentSectionIds = await getSectionIds(page, projectConfigId);
    const newSectionIds = currentSectionIds.filter(
      (sectionId) => !existingSectionIds.includes(sectionId),
    );
    if (newSectionIds.length === 1) {
      return newSectionIds[0];
    }
    await page.waitForTimeout(100);
  }
  throw new Error("Timed out waiting for workflow section creation.");
}

export async function readStateMachineImpl(
  page: Page,
  projectConfigId: string,
  sectionId: string,
): Promise<{
  type: string | null;
  machineGroupId: string | null;
  label: string | null;
  gateType: string | null;
  maxIterations: number | null;
}> {
  const response = await postBackend<LatestProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  const projectState = response?.projectState;
  const sectionVariantId =
    projectState?.projectConfig?.sectionVariantMap?.[sectionId];
  if (!sectionVariantId) {
    return {
      type: null,
      machineGroupId: null,
      label: null,
      gateType: null,
      maxIterations: null,
    };
  }
  const sectionImplId = projectState.sectionVariants?.[sectionVariantId]?.impl;
  if (!sectionImplId) {
    return {
      type: null,
      machineGroupId: null,
      label: null,
      gateType: null,
      maxIterations: null,
    };
  }
  const sectionVariant = projectState.sectionVariants?.[sectionVariantId];
  const sectionCore = projectState.sections?.[sectionId];
  const sectionImpl = projectState.sectionImpls?.[sectionImplId];
  return {
    type: sectionImpl?.type ?? null,
    machineGroupId:
      sectionVariant?.modifier?.machineGroupId ??
      sectionCore?.sharedModifier?.machineGroupId ??
      sectionImpl?.machineGroupId ??
      null,
    label:
      sectionVariant?.modifier?.label ??
      sectionCore?.sharedModifier?.label ??
      sectionImpl?.label ??
      null,
    gateType:
      sectionVariant?.modifier?.gateType ??
      sectionCore?.sharedModifier?.gateType ??
      sectionImpl?.gateType ??
      null,
    maxIterations:
      sectionVariant?.modifier?.maxIterations ??
      sectionCore?.sharedModifier?.maxIterations ??
      sectionImpl?.maxIterations ??
      null,
  };
}

export async function readSectionEngineConfigId(
  page: Page,
  projectConfigId: string,
  sectionId: string,
): Promise<string | null> {
  const response = await postBackend<LatestProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  const projectState = response?.projectState;
  const sectionVariantId =
    projectState?.projectConfig?.sectionVariantMap?.[sectionId];
  if (!sectionVariantId) {
    return null;
  }
  const sectionImplId = projectState.sectionVariants?.[sectionVariantId]?.impl;
  if (!sectionImplId) {
    return null;
  }
  const sectionVariant = projectState.sectionVariants?.[sectionVariantId];
  const sectionCore = projectState.sections?.[sectionId];
  return (
    sectionVariant?.modifier?.engineConfigId ??
    sectionCore?.sharedModifier?.engineConfigId ??
    projectState.sectionImpls?.[sectionImplId]?.engineConfigId ??
    null
  );
}

export async function readStateMachineEdges(
  page: Page,
  projectConfigId: string,
): Promise<
  Array<{
    id: string | null;
    machineGroupId: string | null;
    sourceSectionId: string | null;
    targetSectionId: string | null;
    sourceFilter: {
      type: string | null;
      signalName: string | null;
      payloadField: string | null;
      equals: string | null;
    } | null;
    sourceActivationCountCondition: {
      operator: string | null;
      value: number | null;
    } | null;
    targetAction: {
      type: string | null;
      promptTemplateId: string | null;
      promptSectionId: string | null;
      inlinePrompt: string | null;
      promptInputs: Record<string, string>;
      threadStrategy: string | null;
    } | null;
  }>
> {
  const response = await postBackend<LatestProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  return (response?.projectState?.projectConfig?.stateMachineEdges ?? []).map(
    (edge) => ({
      id: edge.id ?? null,
      machineGroupId: edge.machineGroupId ?? null,
      sourceSectionId: edge.sourceSectionId ?? null,
      targetSectionId: edge.targetSectionId ?? null,
      sourceFilter: edge.sourceFilter
        ? {
            type: edge.sourceFilter.type ?? null,
            signalName: edge.sourceFilter.signalName ?? null,
            payloadField: edge.sourceFilter.payloadField ?? null,
            equals: edge.sourceFilter.equals ?? null,
          }
        : null,
      sourceActivationCountCondition: edge.sourceActivationCountCondition
        ? {
            operator: edge.sourceActivationCountCondition.operator ?? null,
            value: edge.sourceActivationCountCondition.value ?? null,
          }
        : null,
      targetAction: edge.targetAction
        ? {
            type: edge.targetAction.type ?? null,
            promptTemplateId: edge.targetAction.promptTemplateId ?? null,
            promptSectionId: edge.targetAction.promptSectionId ?? null,
            inlinePrompt: edge.targetAction.inlinePrompt ?? null,
            promptInputs: edge.targetAction.promptInputs ?? {},
            threadStrategy: edge.targetAction.threadStrategy ?? null,
          }
        : null,
    }),
  );
}

export async function readStateMachineEdge(
  page: Page,
  projectConfigId: string,
  edgeId: string,
): Promise<{
  id: string | null;
  machineGroupId: string | null;
  sourceSectionId: string | null;
  targetSectionId: string | null;
  sourceFilter: {
    type: string | null;
    signalName: string | null;
    payloadField: string | null;
    equals: string | null;
  } | null;
  sourceActivationCountCondition: {
    operator: string | null;
    value: number | null;
  } | null;
  targetAction: {
    type: string | null;
    promptTemplateId: string | null;
    promptSectionId: string | null;
    inlinePrompt: string | null;
    promptInputs: Record<string, string>;
    threadStrategy: string | null;
  } | null;
} | null> {
  const edges = await readStateMachineEdges(page, projectConfigId);
  return edges.find((edge) => edge.id === edgeId) ?? null;
}

export async function selectStateMachineEdge(
  page: Page,
  edgeId: string,
): Promise<void> {
  await expect
    .poll(
      async () =>
        await page.evaluate(
          async ({ workflowEdgeId }) => {
            const { useProjectState } = await import(
              "/src/state/definitions.ts"
            );
            return useProjectState
              .getState()
              .projectConfig.stateMachineEdges.some(
                (edge) => edge.id === workflowEdgeId,
              );
          },
          { workflowEdgeId: edgeId },
        ),
      { timeout: 8000 },
    )
    .toBe(true);
  await page.evaluate(
    async ({ workflowEdgeId }) => {
      const { setActiveSectionIds } = await import(
        "/src/state/actions/activeSections.ts"
      );
      const { useProjectState } = await import("/src/state/definitions.ts");
      setActiveSectionIds([], { syncMode: "ui-only" });
      useProjectState.setState((state) => {
        for (const edge of state.projectConfig.stateMachineEdges) {
          edge.selected = edge.id === workflowEdgeId;
        }
      });
    },
    { workflowEdgeId: edgeId },
  );
  await expect
    .poll(
      async () =>
        await page.evaluate(
          async ({ workflowEdgeId }) => {
            const definitions = await import("/src/state/definitions.ts");
            const selectedEdgeIds = definitions.useProjectState
              .getState()
              .projectConfig.stateMachineEdges.filter((edge) => edge.selected)
              .map((edge) => edge.id);
            const activeSectionIds =
              definitions.useActiveSectionUI.getState().activeIds;
            return {
              selected:
                selectedEdgeIds.length === 1 &&
                selectedEdgeIds[0] === workflowEdgeId &&
                activeSectionIds.length === 0,
              selectedEdgeIds,
              activeSectionIds,
            };
          },
          { workflowEdgeId: edgeId },
        ),
      { timeout: 8000 },
    )
    .toMatchObject({
      selected: true,
      activeSectionIds: [],
      selectedEdgeIds: [edgeId],
    });
}

export async function selectComboboxOption(
  page: Page,
  inputSelector: string,
  optionName: string,
): Promise<void> {
  const input = page.locator(inputSelector);
  const option = page.getByRole("option", { name: optionName, exact: true });
  await expect(input).toBeVisible();
  await input.focus();
  await page.keyboard.press("ArrowDown");
  await expect(option).toBeVisible();
  await option.click();
  await expect(input).toHaveValue(optionName);
}

async function readGpuFlowNodeScreenRect(
  page: Page,
  nodeId: string,
): Promise<{ height: number; width: number; x: number; y: number } | null> {
  return await page.evaluate(async (nodeId) => {
    const measured =
      (
        window as typeof window & {
          __settaGpuFlowNodeScreenRect?: (
            nodeId: string,
          ) => { height: number; width: number; x: number; y: number } | null;
        }
      ).__settaGpuFlowNodeScreenRect?.(nodeId) ?? null;
    if (measured) {
      return measured;
    }

    const { getActiveViewModeTopLevelSections } = await import(
      "/src/state/actions/sectionInfos/codeObjectsAndLayout.ts"
    );
    const { useProjectState } = await import("/src/state/definitions.ts");
    const state = useProjectState.getState();
    const layout = getActiveViewModeTopLevelSections(state)[nodeId];
    const variantId = state.projectConfig.sectionVariantMap[nodeId];
    const variant = variantId ? state.sectionVariants[variantId] : null;
    const impl = variant ? state.sectionImpls[variant.impl] : null;
    const core = state.sections[nodeId];
    const size =
      core?.sharedModifier?.size ?? variant?.modifier?.size ?? impl?.size;
    const width = typeof size?.width === "number" ? size.width : 220;
    const height = typeof size?.height === "number" ? size.height : 160;
    const container =
      document.querySelector<HTMLElement>(".setta-gpu-flow__pane") ??
      document.querySelector<HTMLElement>(".setta-gpu-flow");
    if (!layout || !container) {
      return null;
    }
    const viewport = state.projectConfig.viewport ?? { x: 0, y: 0, zoom: 1 };
    const containerRect = container.getBoundingClientRect();
    return {
      height: height * viewport.zoom,
      width: width * viewport.zoom,
      x: containerRect.left + viewport.x + layout.x * viewport.zoom,
      y: containerRect.top + viewport.y + layout.y * viewport.zoom,
    };
  }, nodeId);
}

export async function expectGpuFlowSectionVisible(
  page: Page,
  sectionId: string,
): Promise<void> {
  await expect
    .poll(async () => await readGpuFlowNodeScreenRect(page, sectionId), {
      timeout: 8000,
    })
    .not.toBeNull();
}

export async function hoverGpuFlowSection(
  page: Page,
  sectionId: string,
): Promise<void> {
  const rect = await readGpuFlowNodeScreenRect(page, sectionId);
  if (!rect) {
    throw new Error(`Missing GPU flow section rect for ${sectionId}.`);
  }
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  const sidePanePointerStyle = await page.addStyleTag({
    content: `
      #OverviewPane aside.single-cell-container,
      #OverviewPane [data-testid="overview-icon-rail"],
      #UiEditorPane aside.single-cell-container,
      #UiEditorPane [data-testid="ui-editor-icon-rail"] {
        pointer-events: none !important;
      }
    `,
  });
  try {
    await page.mouse.move(x, y);
    await page.mouse.move(x + 1, y + 1);
  } finally {
    await sidePanePointerStyle.evaluate((element) => element.remove());
  }
}

export async function setActiveSections(
  page: Page,
  sectionIds: readonly string[],
): Promise<void> {
  await page.evaluate(async (ids) => {
    const { setActiveSectionIds } = await import(
      "/src/state/actions/activeSections.ts"
    );
    setActiveSectionIds([...ids], { syncMode: "ui-only" });
  }, sectionIds);
}

export async function expectNodeTextWithinBounds(
  node: Locator,
  expectedText: string,
): Promise<void> {
  const bounds = await node.evaluate((element, text) => {
    const nodeRect = element.getBoundingClientRect();
    const target = Array.from(element.querySelectorAll("*")).find(
      (candidate) => candidate.textContent?.trim() === text,
    );
    if (!target) {
      return null;
    }
    const targetRect = target.getBoundingClientRect();
    return {
      nodeTop: nodeRect.top,
      nodeBottom: nodeRect.bottom,
      nodeLeft: nodeRect.left,
      nodeRight: nodeRect.right,
      targetTop: targetRect.top,
      targetBottom: targetRect.bottom,
      targetLeft: targetRect.left,
      targetRight: targetRect.right,
    };
  }, expectedText);
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    return;
  }
  expect(bounds.targetTop).toBeGreaterThanOrEqual(bounds.nodeTop);
  expect(bounds.targetBottom).toBeLessThanOrEqual(bounds.nodeBottom);
  expect(bounds.targetLeft).toBeGreaterThanOrEqual(bounds.nodeLeft);
  expect(bounds.targetRight).toBeLessThanOrEqual(bounds.nodeRight);
}

export async function getBackend<T>(
  page: Page,
  path: string,
): Promise<T | null> {
  const response = await page.request.get(`${BACKEND_ORIGIN}/api${path}`, {
    headers: BACKEND_HELPER_REQUEST_HEADERS,
  });
  const text = await response.text();
  if (!response.ok()) {
    const detail = text ? ` ${text}` : "";
    throw new Error(
      `Backend request failed (${response.status()}): ${path}${detail}`,
    );
  }
  if (!text) {
    return null;
  }
  return JSON.parse(text) as T;
}
