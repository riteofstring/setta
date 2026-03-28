import {
  expect,
  type ConsoleMessage,
  type Locator,
  type Page,
  type Response,
} from "@playwright/test";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const BOOTSTRAP_TOKEN = process.env.SETTA_BOOTSTRAP_TOKEN ?? "";
const AUTH_COOKIE_PREFIX = process.env.SETTA_AUTH_COOKIE_NAME ?? "setta_auth";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const FRONTEND_ORIGIN = new URL(BASE_URL).origin;
const FRONTEND_REFERER = `${FRONTEND_ORIGIN}/`;
const BACKEND_HELPER_REQUEST_HEADERS = {
  Origin: FRONTEND_ORIGIN,
  Referer: FRONTEND_REFERER,
};
const PROJECT_URL =
  process.env.SETTA_PROJECT_URL ??
  (process.env.SETTA_PROJECT_PATH
    ? new URL(process.env.SETTA_PROJECT_PATH, BASE_URL).toString()
    : BASE_URL);
const BACKEND_ORIGIN_OVERRIDE_QUERY_PARAM = "__setta_backend_origin";
const READY_SELECTOR = ".react-flow__pane";
const READY_TIMEOUT_MS = 30000;
const SHOULD_RESOLVE_DEFAULT_PROJECT = PROJECT_URL === BASE_URL;
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";
type AllowedApiError = {
  path: string;
  statuses: readonly number[];
  method?: HttpMethod;
};
type ExpectedApiErrorOverride = {
  path: string;
  statuses: number[];
  method?: HttpMethod;
  expiresAtMs: number;
  remainingCount: number;
};
type UnexpectedApiErrorGuard = {
  firstError: string | null;
  hasForcedClose: boolean;
  seenMessages: Set<string>;
  expectedApiErrorOverrides: ExpectedApiErrorOverride[];
};
const DEFAULT_ALLOWED_API_ERRORS: readonly AllowedApiError[] = [
  { path: "/api/formatCode", statuses: [422], method: "POST" },
  { path: "/api/getLLMChat", statuses: [404], method: "POST" },
  { path: "/api/getExternalAgentChat", statuses: [404], method: "POST" },
];
const unexpectedApiErrorGuards = new WeakMap<Page, UnexpectedApiErrorGuard>();

function withBackendOriginOverride(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  if (!url.searchParams.has(BACKEND_ORIGIN_OVERRIDE_QUERY_PARAM)) {
    url.searchParams.set(BACKEND_ORIGIN_OVERRIDE_QUERY_PARAM, BACKEND_ORIGIN);
  }
  return url.toString();
}

type ProjectMetadataEntry = { id: string; name: string };
type ProjectMetadataResponse = {
  defaultProjectConfigId: string | null;
  projectMetadata: ProjectMetadataEntry[];
};
type EngineConfig = {
  id: string;
  name: string;
  engineType: string;
  settaLlmConfigId?: string | null;
};
type LLMConfigEntry = {
  id?: string;
  model: string;
  provider?: string;
  api_key_env?: string | null;
  base_url?: string | null;
  other_params?: Record<string, unknown> | null;
  mcpServerIds?: string[] | null;
  temporary?: boolean;
};
type AllLLMConfigs = {
  configs?: Record<string, LLMConfigEntry>;
  mcpServers?: Record<string, unknown>;
  default_config_id?: string | null;
};
type CreateSectionResponse = { sectionId?: string };
type FrontendHydratableRouteName =
  | "route_add_kwarg"
  | "route_change_param_impl"
  | "route_create_agentic_edge"
  | "route_create_child_sections"
  | "route_create_edge"
  | "route_create_state_machine_edge"
  | "route_create_top_level_section"
  | "route_delete_state_machine_edges"
  | "route_move_sections"
  | "route_set_callable"
  | "route_set_code_file_binding"
  | "route_set_code_obj_name"
  | "route_set_image_area_image_path"
  | "route_set_param_entered_value"
  | "route_set_prompt_template"
  | "route_set_section_name"
  | "route_set_section_edge_inputs"
  | "route_set_section_edge_outputs"
  | "route_set_section_pinned_params"
  | "route_set_section_sizes"
  | "route_set_spreadsheet_file_path"
  | "route_set_state_machine_section_settings"
  | "route_set_text_block_display_mode"
  | "route_set_text_block_format"
  | "route_set_text_block_text"
  | "route_toggle_minimized"
  | "route_update_param_impl_config";
type FrontendHydratableRouteOperation = {
  routeName: FrontendHydratableRouteName;
  payload: Record<string, unknown>;
};
type IsolatedProjectContext = {
  projectConfigId: string;
  defaultProjectConfigId: string | null;
};
type AgentRun = {
  inputs?: Record<string, unknown> | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  events?: Array<{ timestamp?: string | null }>;
};
type ProjectStateSectionSize = {
  width: number | "auto";
  height: number | "auto";
};
type ProjectStateVariant = {
  impl: string;
  modifier?: { size?: ProjectStateSectionSize };
};
type ProjectStateSectionImpl = { size: ProjectStateSectionSize; type: string };
type ProjectStateSectionCore = {
  sharedModifier?: { size?: ProjectStateSectionSize };
};
type ProjectStateViewport = { x: number; y: number; zoom: number };
export type ProjectStateSingleConfigResponse = {
  projectConfig: {
    sectionVariantMap: Record<string, string>;
    viewport?: ProjectStateViewport | null;
  };
  sectionVariants: Record<string, ProjectStateVariant>;
  sectionImpls: Record<string, ProjectStateSectionImpl>;
  sections: Record<string, ProjectStateSectionCore>;
  singletonSections: {
    GenPythonCode?: string | null;
  };
};

export async function ensureAppReady(page: Page): Promise<void> {
  installUnexpectedApiErrorGuard(page);
  throwIfUnexpectedApiError(page);

  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const onPageError = (err: Error) => {
    const message = err?.stack || err?.message || String(err);
    if (message && !pageErrors.includes(message)) {
      pageErrors.push(message);
    }
  };
  const onConsole = (msg: ConsoleMessage) => {
    if (msg.type() !== "error") {
      return;
    }
    const message = msg.text();
    if (message && !consoleErrors.includes(message)) {
      consoleErrors.push(message);
    }
  };
  page.on("pageerror", onPageError);
  page.on("console", onConsole);
  try {
    await page.goto(withBackendOriginOverride(PROJECT_URL), {
      waitUntil: "domcontentloaded",
    });
    if (await isAppReady(page)) {
      return;
    }

    const hasCookie = await hasAuthCookie(page);
    if (!hasCookie) {
      // In Playwright E2E, auth should already be established via global-setup storageState.
      // Avoid consuming the bootstrap token here; it is one-time and reserved for global-setup.
      throw new Error(
        `Missing auth cookie (${AUTH_COOKIE_PREFIX}). Ensure global-setup seeded storageState correctly.`,
      );
    }

    if (SHOULD_RESOLVE_DEFAULT_PROJECT) {
      await navigateToDefaultProject(page);
    } else {
      await page.goto(withBackendOriginOverride(PROJECT_URL), {
        waitUntil: "domcontentloaded",
      });
    }
    if (await isAppReady(page)) {
      return;
    }

    if (SHOULD_RESOLVE_DEFAULT_PROJECT) {
      const defaultProjectName = await resolveDefaultProjectName(page, false);
      if (defaultProjectName) {
        const defaultUrl = new URL(defaultProjectName, BASE_URL).toString();
        await page.goto(withBackendOriginOverride(defaultUrl), {
          waitUntil: "domcontentloaded",
        });
        if (await isAppReady(page)) {
          return;
        }
      }
    }

    const debugLines: string[] = [];
    debugLines.push(`Current URL: ${page.url()}`);
    if (pageErrors.length) {
      debugLines.push("");
      debugLines.push("Page errors:");
      debugLines.push(...pageErrors.slice(0, 5));
    }
    if (consoleErrors.length) {
      debugLines.push("");
      debugLines.push("Console errors:");
      debugLines.push(...consoleErrors.slice(0, 10));
    }
    const unexpectedApiError = unexpectedApiErrorGuards.get(page)?.firstError;
    if (unexpectedApiError) {
      debugLines.push("");
      debugLines.push("Unexpected API error:");
      debugLines.push(unexpectedApiError);
    }

    throw new Error(
      `Setta UI did not become ready. Check bootstrap auth.\n${debugLines.join(
        "\n",
      )}`,
    );
  } finally {
    page.off("pageerror", onPageError);
    page.off("console", onConsole);
  }
}

export function allowExpectedApiError(
  page: Page,
  rule: {
    path: string;
    statuses: readonly number[];
    method?: HttpMethod;
    count?: number;
    ttlMs?: number;
  },
): void {
  if (!rule.path.startsWith("/api/")) {
    throw new Error(
      `Expected API error path must start with /api/: ${rule.path}`,
    );
  }
  if (!rule.statuses.length) {
    throw new Error("Expected API error statuses cannot be empty.");
  }
  const count = rule.count ?? 1;
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(
      `Expected API error count must be a positive integer: ${String(count)}`,
    );
  }
  const ttlMs = rule.ttlMs ?? 15000;
  if (!Number.isInteger(ttlMs) || ttlMs <= 0) {
    throw new Error(
      `Expected API error ttlMs must be a positive integer: ${String(ttlMs)}`,
    );
  }

  installUnexpectedApiErrorGuard(page);
  const guard = unexpectedApiErrorGuards.get(page);
  if (!guard) {
    throw new Error("Unexpected API error guard not initialized.");
  }

  guard.expectedApiErrorOverrides.push({
    path: rule.path,
    statuses: [...rule.statuses],
    method: rule.method,
    expiresAtMs: Date.now() + ttlMs,
    remainingCount: count,
  });
}

export async function seedLocalStorage(
  page: Page,
  patch: Record<string, unknown>,
): Promise<void> {
  await page.addInitScript((nextState) => {
    const key = "setta_data";
    let payload: { state: Record<string, unknown>; version: number } = {
      state: {},
      version: 0,
    };
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          const parsedRecord = parsed as {
            state?: unknown;
            version?: unknown;
          };
          payload = {
            state:
              typeof parsedRecord.state === "object" && parsedRecord.state
                ? (parsedRecord.state as Record<string, unknown>)
                : {},
            version:
              typeof parsedRecord.version === "number"
                ? parsedRecord.version
                : 0,
          };
        }
      } catch {
        payload = { state: {}, version: 0 };
      }
    }
    payload.state = { ...payload.state, ...nextState };
    localStorage.setItem(key, JSON.stringify(payload));
  }, patch);
}

export async function clearProjectChatWindows(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { replaceProjectChatWindowingState } = await import(
      "/src/state/actions/projectChatWindowing.ts"
    );
    const { createProjectChatWindowingState } = await import(
      "/src/utils/generatedTypes.ts"
    );
    replaceProjectChatWindowingState(createProjectChatWindowingState());
  });
  await page.waitForFunction(() => {
    return [
      '[data-testid="project-chat-floating-window"]',
      '[data-testid="project-chat-bottom-dock-window-panel"]',
      '[data-testid="project-chat-maximized-window"]',
      '[data-testid="project-chat-window-title"]',
    ].every((selector) => document.querySelector(selector) === null);
  });
}

export async function openProjectAiSettingsPopover(page: Page): Promise<void> {
  const accordionTrigger = page.getByTestId(
    "project-ai-settings-accordion-llm-api-keys",
  );
  if (
    await accordionTrigger
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    await page.keyboard.press("Escape");
    await expect(accordionTrigger.first()).not.toBeVisible();
  }
  const projectChatSurface = await getVisibleProjectChatSurface(page);
  await clickDom(
    projectChatSurface.getByRole("button", { name: "Project AI Settings" }),
  );
  await clickDom(
    page
      .locator(
        '[data-testid="project-chat-settings-open-project-settings"]:visible',
      )
      .first(),
  );
}

export async function setOverviewTab(
  page: Page,
  tabName: string,
): Promise<void> {
  if (tabName === "ProjectAISettings") {
    throw new Error(
      "ProjectAISettings was removed. Seed ProjectAIChat and open Project AI Settings through the live UI.",
    );
  }
  if (tabName === "BackendLogs") {
    throw new Error(
      "BackendLogs was removed. Seed Notifications and open the Logs subtab through the live UI.",
    );
  }
  await seedLocalStorage(page, { overviewTab: tabName, overviewVis: true });
}

export async function openOverviewMoreDestination(
  page: Page,
  destination: "Plugins" | "Custom Runs" | "App Gen",
): Promise<void> {
  await page.getByTestId("overview-tab-more").click();
  await clickDom(
    page.getByRole("menuitem", { name: destination, exact: true }),
  );
}

export async function getVisibleProjectChatSurface(
  page: Page,
): Promise<Locator> {
  const surfaceCandidates = [
    page.getByTestId("project-chat-maximized-window").first(),
    page.getByTestId("project-chat-floating-window").first(),
    page.getByTestId("project-chat-bottom-dock-window-panel").first(),
    page
      .locator('#OverviewPane [data-chat-surface-mode="project_ai_mode"]')
      .first(),
  ];
  await expect
    .poll(async () => {
      for (const candidate of surfaceCandidates) {
        if ((await candidate.count()) > 0 && (await candidate.isVisible())) {
          return true;
        }
      }
      return false;
    })
    .toBe(true);
  for (const candidate of surfaceCandidates) {
    if ((await candidate.count()) > 0 && (await candidate.isVisible())) {
      return candidate;
    }
  }
  throw new Error("No visible project chat surface found.");
}

export async function ensureProjectChatThreadsPanelVisible(
  page: Page,
): Promise<Locator> {
  const projectChatSurface = await getVisibleProjectChatSurface(page);
  const threadsPanel = projectChatSurface.getByTestId(
    "project-chat-threads-panel",
  );
  const viewThreadsButton = projectChatSurface.getByRole("button", {
    name: /^View Threads$/i,
  });
  let visibleTarget: "panel" | "button" | null = null;
  await expect
    .poll(async () => {
      if (await threadsPanel.isVisible().catch(() => false)) {
        visibleTarget = "panel";
        return true;
      }
      if (await viewThreadsButton.isVisible().catch(() => false)) {
        visibleTarget = "button";
        return true;
      }
      visibleTarget = null;
      return false;
    })
    .toBe(true);
  if (visibleTarget === "panel") {
    return threadsPanel;
  }
  if (visibleTarget === "button") {
    await clickDom(viewThreadsButton);
    await expect(threadsPanel).toBeVisible();
    return threadsPanel;
  }
  throw new Error("Expected project chat threads panel to be available.");
}

async function clickDom(target: Locator): Promise<void> {
  await expect(target).toBeVisible();
  await target.evaluate((element: HTMLElement) => {
    element.click();
  });
}

export async function openIsolatedProject(
  page: Page,
): Promise<IsolatedProjectContext> {
  installUnexpectedApiErrorGuard(page);
  throwIfUnexpectedApiError(page);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const onPageError = (err: Error) => {
    const message = err?.stack || err?.message || String(err);
    if (message && !pageErrors.includes(message)) {
      pageErrors.push(message);
    }
  };
  const onConsole = (msg: ConsoleMessage) => {
    if (msg.type() !== "error") {
      return;
    }
    const message = msg.text();
    if (message && !consoleErrors.includes(message)) {
      consoleErrors.push(message);
    }
  };
  page.on("pageerror", onPageError);
  page.on("console", onConsole);

  try {
    const metadata = await postBackend<ProjectMetadataResponse>(
      page,
      "/loadAllProjectMetadata",
      {},
    );
    if (!metadata) {
      throw new Error("Missing project metadata response.");
    }
    const name = await postBackend<string>(page, "/createProjectConfig", {
      previewImgColor: "bg-blue-500/60",
    });
    if (!name) {
      throw new Error("Missing project config name.");
    }
    const url = new URL(name, BASE_URL).toString();
    await page.goto(withBackendOriginOverride(url), {
      waitUntil: "domcontentloaded",
    });
    await waitForReadySurface(page, {
      context: "Isolated project did not become ready.",
      pageErrors,
      consoleErrors,
    });
    const projectConfigId = await getCurrentProjectConfigId(page);
    return {
      projectConfigId,
      defaultProjectConfigId: metadata.defaultProjectConfigId ?? null,
    };
  } finally {
    page.off("pageerror", onPageError);
    page.off("console", onConsole);
  }
}

export async function cleanupIsolatedProject(
  page: Page,
  context: IsolatedProjectContext | null,
): Promise<void> {
  if (!context) {
    return;
  }
  // Isolated configs are created for tests only; deleting the config is enough
  // and avoids an extra metadata write call that has proven flaky under CI load.
  try {
    if (!page.isClosed()) {
      // Leave the app surface before deleting the backing project so debounced
      // frontend writes do not race cleanup with stale project IDs.
      await page
        .goto("about:blank", {
          waitUntil: "domcontentloaded",
          timeout: 2000,
        })
        .catch(() => null);
    }
    await page.request.post(`${BACKEND_ORIGIN}/api/deleteProjectConfigs`, {
      data: { ids: [context.projectConfigId] },
      headers: BACKEND_HELPER_REQUEST_HEADERS,
      timeout: 5000,
    });
  } catch {
    // Cleanup is best-effort: each run uses an isolated workspace.
  }
}

function sanitizeLlmConfigsForWrite(
  configs: Record<string, LLMConfigEntry> | undefined,
): Record<string, LLMConfigEntry> {
  if (!configs) {
    return {};
  }
  const sanitized: Record<string, LLMConfigEntry> = {};
  for (const [configId, config] of Object.entries(configs)) {
    const nextConfig: LLMConfigEntry = { ...config };
    if ("id" in nextConfig) {
      delete nextConfig.id;
    }
    sanitized[configId] = nextConfig;
  }
  return sanitized;
}

function sanitizeAllLlmConfigsForWrite(config: AllLLMConfigs): AllLLMConfigs {
  return {
    ...config,
    configs: sanitizeLlmConfigsForWrite(config.configs),
  };
}

export async function ensureManagedChatEngine(
  page: Page,
): Promise<() => Promise<void>> {
  // Managed-engine tests can trigger optional external-chat probes that
  // legitimately return 404 when the external route is unavailable.
  allowExpectedApiError(page, {
    path: "/api/getExternalAgentChat",
    statuses: [404],
    method: "POST",
    count: 200,
    ttlMs: 15 * 60 * 1000,
  });
  const initialConfig = await getBackend<AllLLMConfigs>(page, "/llm/config");
  if (!initialConfig) {
    throw new Error("Missing LLM config payload.");
  }
  const initialConfigForWrite = sanitizeAllLlmConfigsForWrite(initialConfig);
  let createdLlmConfigId: string | null = null;
  let didUpdateLlmConfig = false;
  const existingConfigs = sanitizeLlmConfigsForWrite(initialConfig.configs);

  const engineConfigs = await getBackend<EngineConfig[]>(
    page,
    "/getEngineConfigs",
  );
  const existingEngine =
    engineConfigs?.find((config) => config.engineType === "setta_llm") ?? null;

  let llmConfigId = existingEngine?.settaLlmConfigId ?? null;
  if (llmConfigId && !existingConfigs[llmConfigId]) {
    const updated: AllLLMConfigs = {
      ...initialConfigForWrite,
      configs: {
        ...existingConfigs,
        [llmConfigId]: { model: "gpt-4o-mini", provider: "openai" },
      },
      default_config_id: initialConfig.default_config_id ?? llmConfigId,
    };
    await postBackend(page, "/llm/config", updated as Record<string, unknown>);
    createdLlmConfigId = llmConfigId;
    didUpdateLlmConfig = true;
  }

  if (!llmConfigId) {
    llmConfigId =
      Object.entries(existingConfigs).find(
        ([, config]) => !config.api_key_env,
      )?.[0] ?? null;
  }

  if (!llmConfigId) {
    llmConfigId = "e2e-llm";
    const updated: AllLLMConfigs = {
      ...initialConfigForWrite,
      configs: {
        ...existingConfigs,
        [llmConfigId]: { model: "gpt-4o-mini", provider: "openai" },
      },
      default_config_id: llmConfigId,
    };
    await postBackend(page, "/llm/config", updated as Record<string, unknown>);
    createdLlmConfigId = llmConfigId;
    didUpdateLlmConfig = true;
  }

  let createdEngineConfigId: string | null = null;
  if (!existingEngine) {
    const created = await postBackend<EngineConfig>(
      page,
      "/createEngineConfig",
      {
        name: "E2E Engine",
        engineType: "setta_llm",
        settaLlmConfigId: llmConfigId,
        defaults: {},
      },
    );
    if (!created?.id) {
      throw new Error("Missing engine config id.");
    }
    createdEngineConfigId = created.id;
  }

  return async () => {
    // Managed-engine teardown should not mask assertion outcomes in a
    // disposable Playwright workspace if the backend stalls during cleanup.
    if (createdEngineConfigId) {
      try {
        await page.request.post(`${BACKEND_ORIGIN}/api/deleteEngineConfig`, {
          data: { configId: createdEngineConfigId },
          headers: BACKEND_HELPER_REQUEST_HEADERS,
          timeout: 5000,
        });
      } catch {
        // Ignore teardown failures; the seeded workspace is disposable.
      }
    }
    if (createdLlmConfigId || didUpdateLlmConfig) {
      try {
        await page.request.post(`${BACKEND_ORIGIN}/api/llm/config`, {
          data: initialConfigForWrite as Record<string, unknown>,
          headers: BACKEND_HELPER_REQUEST_HEADERS,
          timeout: 5000,
        });
      } catch {
        // Ignore teardown failures; the seeded workspace is disposable.
      }
    }
  };
}

export async function createChatSection(
  page: Page,
  projectConfigId: string,
  baseName: string,
): Promise<{ sectionId: string; sectionName: string }> {
  const sectionName = `${baseName}-${Date.now()}`;
  const created = await createTopLevelSectionFromFrontend(page, {
    projectConfigId,
    implType: "Chat",
    name: sectionName,
  });
  if (!created?.sectionId) {
    throw new Error("Missing sectionId when creating chat section.");
  }
  return { sectionId: created.sectionId, sectionName };
}

export async function createTextBlockSection(
  page: Page,
  projectConfigId: string,
  baseName: string,
): Promise<{ sectionId: string; sectionName: string }> {
  const sectionName = `${baseName}-${Date.now()}`;
  const created = await createTopLevelSectionFromFrontend(page, {
    projectConfigId,
    implType: "TextBlock",
    name: sectionName,
  });
  if (!created?.sectionId) {
    throw new Error("Missing sectionId when creating text block section.");
  }
  return { sectionId: created.sectionId, sectionName };
}

export async function setChatSectionState(
  page: Page,
  payload: {
    projectConfigId: string;
    sectionId: string;
    state: Record<string, unknown>;
  },
): Promise<void> {
  await page.evaluate(async (input) => {
    const {
      getCurrProjectConfigId,
      processProjectStateUpdateFromBackend,
      setCurrEffectiveSectionImplValue,
    } = await import("/src/state/actions/sectionInfos");
    const { useProjectState } = await import("/src/state/definitions");
    const { route_get_latest_project_state, route_set_chat_section_state } =
      await import("/src/utils/generatedEndpoints");
    if (getCurrProjectConfigId() !== input.projectConfigId) {
      throw new Error(
        `Active project mismatch while setting chat section state: expected ${input.projectConfigId}.`,
      );
    }
    const hasSection =
      useProjectState.getState().projectConfig.sectionVariantMap[
        input.sectionId
      ] !== undefined;
    if (hasSection) {
      useProjectState.setState((state) => {
        const nextStatePatch: Record<string, unknown> = {};
        for (const key of [
          "messages",
          "inputText",
          "waitingForResponse",
          "toolCallArguments",
          "activeBranchId",
          "branches",
        ]) {
          if (key in input.state) {
            nextStatePatch[key] = input.state[key];
          }
        }
        setCurrEffectiveSectionImplValue<"ChatSection">(
          state,
          input.sectionId,
          nextStatePatch as never,
        );
      });
    }
    const response = await route_set_chat_section_state({
      projectConfigId: input.projectConfigId,
      sectionId: input.sectionId,
      state: input.state,
      frontendOpId: null,
    });
    if (response.status !== 200) {
      throw new Error(
        `Failed to persist chat section state for ${input.sectionId}: ${response.status}`,
      );
    }
    if (!hasSection) {
      const latestProjectStateResponse = await route_get_latest_project_state({
        projectConfigId: input.projectConfigId,
      });
      if (
        latestProjectStateResponse.status !== 200 ||
        !latestProjectStateResponse.data
      ) {
        throw new Error(
          `Failed to hydrate latest project state for ${input.projectConfigId}: ${latestProjectStateResponse.status}`,
        );
      }
      processProjectStateUpdateFromBackend(latestProjectStateResponse.data);
    }
  }, payload);
}

export async function stopLatestProjectChat(
  page: Page,
  projectConfigId: string,
): Promise<void> {
  const chatId = await waitForLatestChatId(page, projectConfigId);
  await postBackend(page, "/stopLLMChat", { chatId });
}

export async function getCurrentProjectConfigId(page: Page): Promise<string> {
  const metadata = await postBackend<ProjectMetadataResponse>(
    page,
    "/loadAllProjectMetadata",
    {},
  );
  if (!metadata) {
    throw new Error("Missing project metadata response.");
  }

  const currentPath = new URL(page.url()).pathname;
  const projectName = currentPath.split("/").filter(Boolean)[0];
  if (projectName) {
    const match = metadata.projectMetadata.find((p) => p.name === projectName);
    if (match?.id) {
      return match.id;
    }
  }

  if (metadata.defaultProjectConfigId) {
    return metadata.defaultProjectConfigId;
  }

  throw new Error("Unable to resolve projectConfigId for test.");
}

async function getCurrentProjectConfigName(page: Page): Promise<string> {
  const metadata = await postBackend<ProjectMetadataResponse>(
    page,
    "/loadAllProjectMetadata",
    {},
  );
  if (!metadata) {
    throw new Error("Missing project metadata response.");
  }

  const currentPath = new URL(page.url()).pathname;
  const projectName = currentPath.split("/").filter(Boolean)[0];
  if (projectName) {
    return projectName;
  }

  if (metadata.defaultProjectConfigId) {
    const match = metadata.projectMetadata.find(
      (entry) => entry.id === metadata.defaultProjectConfigId,
    );
    if (match?.name) {
      return match.name;
    }
  }

  throw new Error("Unable to resolve projectConfigName for test.");
}

export async function loadProjectConfig(
  page: Page,
): Promise<ProjectStateSingleConfigResponse> {
  const projectConfigName = await getCurrentProjectConfigName(page);
  const response = await postBackend<ProjectStateSingleConfigResponse>(
    page,
    "/loadProjectConfig",
    { projectConfigName },
  );
  if (!response) {
    throw new Error("Missing project config response.");
  }
  return response;
}

export async function createCallableSection(
  page: Page,
  projectConfigId: string,
): Promise<string> {
  const response = await createTopLevelSectionFromFrontend(page, {
    projectConfigId,
    implType: "Callable",
  });
  if (!response?.sectionId) {
    throw new Error("Missing sectionId when creating callable section.");
  }
  return response.sectionId;
}

export async function applyProjectMutationsFromFrontend(
  page: Page,
  payload: {
    projectConfigId: string;
    operations: FrontendHydratableRouteOperation[];
  },
): Promise<Array<unknown | null>> {
  return await page.evaluate(async (input) => {
    const { res200 } = await import("/src/utils/endpointUtils");
    const { processProjectStateUpdateFromBackend, getCurrProjectConfigId } =
      await import("/src/state/actions/sectionInfos");
    const endpointModule = await import("/src/utils/generatedEndpoints");
    const { route_get_latest_project_state } = endpointModule;

    if (getCurrProjectConfigId() !== input.projectConfigId) {
      throw new Error(
        `Active project mismatch while applying test mutations: expected ${input.projectConfigId}.`,
      );
    }

    type RouteResponse = {
      status: number;
      data?: unknown | null;
    };

    const results: Array<unknown | null> = [];
    for (const operation of input.operations) {
      const route = endpointModule[operation.routeName] as (
        payload: Record<string, unknown>,
      ) => Promise<RouteResponse>;
      const response = await route({
        projectConfigId: input.projectConfigId,
        ...operation.payload,
      });
      if (!res200(response)) {
        throw new Error(
          `Failed frontend test mutation ${operation.routeName} for ${input.projectConfigId}: ${response.status}`,
        );
      }
      results.push((response.data as unknown | null) ?? null);
    }

    const latestProjectStateResponse = await route_get_latest_project_state({
      projectConfigId: input.projectConfigId,
    });
    if (!res200(latestProjectStateResponse)) {
      throw new Error(
        `Failed to hydrate latest project state for ${input.projectConfigId}: ${latestProjectStateResponse.status}`,
      );
    }
    processProjectStateUpdateFromBackend(latestProjectStateResponse.data);
    return results;
  }, payload);
}

export async function createTopLevelSectionFromFrontend(
  page: Page,
  payload: {
    projectConfigId: string;
    implType: string;
    controlCodeObjType?: string | null;
    implOverrides?: Record<string, unknown> | null;
    position?: { x: number; y: number } | null;
    name?: string | null;
    topLevelSections?: Record<string, unknown> | null;
    viewportBounds?: { x: number; y: number; w: number; h: number } | null;
  },
): Promise<CreateSectionResponse | null> {
  const [created] = await applyProjectMutationsFromFrontend(page, {
    projectConfigId: payload.projectConfigId,
    operations: [
      {
        routeName: "route_create_top_level_section",
        payload: {
          implType: payload.implType,
          controlCodeObjType: payload.controlCodeObjType ?? null,
          implOverrides: payload.implOverrides ?? null,
          position: payload.position ?? null,
          name: payload.name ?? null,
          topLevelSections: payload.topLevelSections ?? null,
          viewportBounds: payload.viewportBounds ?? null,
        },
      },
    ],
  });
  return (created as CreateSectionResponse | null) ?? null;
}

export async function setCallableFromFrontend(
  page: Page,
  payload: {
    projectConfigId: string;
    sectionId: string;
    callableName: string;
    refetchParams: boolean;
  },
): Promise<Record<string, unknown> | null> {
  const [response] = await applyProjectMutationsFromFrontend(page, {
    projectConfigId: payload.projectConfigId,
    operations: [
      {
        routeName: "route_set_callable",
        payload: {
          sectionId: payload.sectionId,
          callableName: payload.callableName,
          refetchParams: payload.refetchParams,
          frontendOpId: null,
        },
      },
    ],
  });
  return (response as Record<string, unknown> | null) ?? null;
}

export async function moveSectionsFromFrontend(
  page: Page,
  payload: {
    projectConfigId: string;
    sectionIds: string[];
    newParentId: string | null;
    newIndex: number | null;
    positionsById: Record<string, { x: number; y: number }> | null;
  },
): Promise<void> {
  await applyProjectMutationsFromFrontend(page, {
    projectConfigId: payload.projectConfigId,
    operations: [
      {
        routeName: "route_move_sections",
        payload: {
          sectionIds: payload.sectionIds,
          newParentId: payload.newParentId,
          newIndex: payload.newIndex,
          positionsById: payload.positionsById,
          frontendOpId: null,
        },
      },
    ],
  });
}

export async function createChildSectionsFromFrontend(
  page: Page,
  payload: {
    projectConfigId: string;
    parentId: string;
    implType: string;
    numChildren: number;
    startIdx?: number | null;
  },
): Promise<void> {
  await applyProjectMutationsFromFrontend(page, {
    projectConfigId: payload.projectConfigId,
    operations: [
      {
        routeName: "route_create_child_sections",
        payload: {
          parentId: payload.parentId,
          implType: payload.implType,
          numChildren: payload.numChildren,
          startIdx: payload.startIdx ?? null,
        },
      },
    ],
  });
}

export async function addKwargFromFrontend(
  page: Page,
  payload: {
    projectConfigId: string;
    sectionId: string;
  },
): Promise<void> {
  await applyProjectMutationsFromFrontend(page, {
    projectConfigId: payload.projectConfigId,
    operations: [
      {
        routeName: "route_add_kwarg",
        payload: {
          sectionId: payload.sectionId,
        },
      },
    ],
  });
}

export async function setSectionPinnedParamsFromFrontend(
  page: Page,
  payload: {
    projectConfigId: string;
    sectionId: string;
    pinnedParams: string[];
  },
): Promise<void> {
  await applyProjectMutationsFromFrontend(page, {
    projectConfigId: payload.projectConfigId,
    operations: [
      {
        routeName: "route_set_section_pinned_params",
        payload: {
          sectionId: payload.sectionId,
          pinnedParams: payload.pinnedParams,
          frontendOpId: null,
        },
      },
    ],
  });
}

export async function setSectionEdgeInputsFromFrontend(
  page: Page,
  payload: {
    projectConfigId: string;
    sectionId: string;
    edgeInputParams: string[];
  },
): Promise<void> {
  await applyProjectMutationsFromFrontend(page, {
    projectConfigId: payload.projectConfigId,
    operations: [
      {
        routeName: "route_set_section_edge_inputs",
        payload: {
          sectionId: payload.sectionId,
          edgeInputParams: payload.edgeInputParams,
          frontendOpId: null,
        },
      },
    ],
  });
}

async function setSectionEdgeOutputsFromFrontend(
  page: Page,
  payload: {
    projectConfigId: string;
    sectionId: string;
    edgeOutputPorts: Array<Record<string, unknown>>;
  },
): Promise<void> {
  await applyProjectMutationsFromFrontend(page, {
    projectConfigId: payload.projectConfigId,
    operations: [
      {
        routeName: "route_set_section_edge_outputs",
        payload: {
          sectionId: payload.sectionId,
          edgeOutputPorts: payload.edgeOutputPorts,
          frontendOpId: null,
        },
      },
    ],
  });
}

export async function setSectionSizesFromFrontend(
  page: Page,
  payload: {
    projectConfigId: string;
    sectionSizes: Record<
      string,
      { height?: number | "auto"; width?: number | "auto" }
    >;
  },
): Promise<void> {
  await applyProjectMutationsFromFrontend(page, {
    projectConfigId: payload.projectConfigId,
    operations: [
      {
        routeName: "route_set_section_sizes",
        payload: {
          sectionSizes: payload.sectionSizes,
          frontendOpId: null,
        },
      },
    ],
  });
}

export async function toggleMinimizedFromFrontend(
  page: Page,
  payload: {
    projectConfigId: string;
    sectionId: string;
  },
): Promise<void> {
  await applyProjectMutationsFromFrontend(page, {
    projectConfigId: payload.projectConfigId,
    operations: [
      {
        routeName: "route_toggle_minimized",
        payload: {
          sectionId: payload.sectionId,
          frontendOpId: null,
        },
      },
    ],
  });
}

export async function setCodeObjNameFromFrontend(
  page: Page,
  payload: {
    projectConfigId: string;
    codeObjId: string;
    name: string;
  },
): Promise<void> {
  await applyProjectMutationsFromFrontend(page, {
    projectConfigId: payload.projectConfigId,
    operations: [
      {
        routeName: "route_set_code_obj_name",
        payload: {
          codeObjId: payload.codeObjId,
          name: payload.name,
          frontendOpId: null,
        },
      },
    ],
  });
}

export async function setSectionNameFromFrontend(
  page: Page,
  payload: {
    projectConfigId: string;
    sectionId: string;
    name: string;
  },
): Promise<void> {
  await applyProjectMutationsFromFrontend(page, {
    projectConfigId: payload.projectConfigId,
    operations: [
      {
        routeName: "route_set_section_name",
        payload: {
          sectionId: payload.sectionId,
          name: payload.name,
          frontendOpId: null,
        },
      },
    ],
  });
}

export async function setImageAreaImagePathFromFrontend(
  page: Page,
  payload: {
    projectConfigId: string;
    sectionId: string;
    imagePath: string;
  },
): Promise<void> {
  await applyProjectMutationsFromFrontend(page, {
    projectConfigId: payload.projectConfigId,
    operations: [
      {
        routeName: "route_set_image_area_image_path",
        payload: {
          sectionId: payload.sectionId,
          imagePath: payload.imagePath,
          frontendOpId: null,
        },
      },
    ],
  });
}

export async function changeParamImplFromFrontend(
  page: Page,
  payload: {
    projectConfigId: string;
    sectionId: string;
    paramInfoId: string;
    selectedId: string;
  },
): Promise<void> {
  await applyProjectMutationsFromFrontend(page, {
    projectConfigId: payload.projectConfigId,
    operations: [
      {
        routeName: "route_change_param_impl",
        payload: {
          sectionId: payload.sectionId,
          paramInfoId: payload.paramInfoId,
          selectedId: payload.selectedId,
        },
      },
    ],
  });
}

export async function setParamEnteredValueFromFrontend(
  page: Page,
  payload: {
    projectConfigId: string;
    sectionId: string;
    paramInfoId: string;
    value: string;
  },
): Promise<void> {
  await applyProjectMutationsFromFrontend(page, {
    projectConfigId: payload.projectConfigId,
    operations: [
      {
        routeName: "route_set_param_entered_value",
        payload: {
          sectionId: payload.sectionId,
          paramInfoId: payload.paramInfoId,
          value: payload.value,
          frontendOpId: null,
        },
      },
    ],
  });
}

export async function updateParamImplConfigFromFrontend(
  page: Page,
  payload: {
    projectConfigId: string;
    sectionId: string;
    paramInfoId: string;
    newConfig: Record<string, unknown>;
  },
): Promise<void> {
  await applyProjectMutationsFromFrontend(page, {
    projectConfigId: payload.projectConfigId,
    operations: [
      {
        routeName: "route_update_param_impl_config",
        payload: {
          sectionId: payload.sectionId,
          paramInfoId: payload.paramInfoId,
          newConfig: payload.newConfig,
        },
      },
    ],
  });
}

export async function setCodeFileBindingFromFrontend(
  page: Page,
  payload: {
    projectConfigId: string;
    sectionId: string;
    binding: Record<string, unknown>;
  },
): Promise<void> {
  await applyProjectMutationsFromFrontend(page, {
    projectConfigId: payload.projectConfigId,
    operations: [
      {
        routeName: "route_set_code_file_binding",
        payload: {
          sectionId: payload.sectionId,
          binding: payload.binding,
          frontendOpId: null,
        },
      },
    ],
  });
}

export async function setChatSectionChatId(
  page: Page,
  payload: {
    projectConfigId: string;
    sectionId: string;
    chatId: string | null;
  },
): Promise<void> {
  await page.evaluate(async (input) => {
    const {
      getCurrProjectConfigId,
      processProjectStateUpdateFromBackend,
      setCurrEffectiveSectionImplValue,
    } = await import("/src/state/actions/sectionInfos");
    const { useProjectState } = await import("/src/state/definitions");
    const { route_get_latest_project_state, route_set_chat_section_chat_id } =
      await import("/src/utils/generatedEndpoints");
    if (getCurrProjectConfigId() !== input.projectConfigId) {
      throw new Error(
        `Active project mismatch while setting chat id: expected ${input.projectConfigId}.`,
      );
    }
    const hasSection =
      useProjectState.getState().projectConfig.sectionVariantMap[
        input.sectionId
      ] !== undefined;
    if (hasSection) {
      useProjectState.setState((state) => {
        setCurrEffectiveSectionImplValue<"ChatSection">(
          state,
          input.sectionId,
          {
            chatId: input.chatId,
          },
        );
      });
    }
    const response = await route_set_chat_section_chat_id({
      projectConfigId: input.projectConfigId,
      sectionId: input.sectionId,
      chatId: input.chatId,
    });
    if (response.status !== 200) {
      throw new Error(
        `Failed to persist chat id for ${input.sectionId}: ${response.status}`,
      );
    }
    if (!hasSection) {
      const latestProjectStateResponse = await route_get_latest_project_state({
        projectConfigId: input.projectConfigId,
      });
      if (
        latestProjectStateResponse.status !== 200 ||
        !latestProjectStateResponse.data
      ) {
        throw new Error(
          `Failed to hydrate latest project state for ${input.projectConfigId}: ${latestProjectStateResponse.status}`,
        );
      }
      processProjectStateUpdateFromBackend(latestProjectStateResponse.data);
    }
  }, payload);
}

export async function getViewportBoundsForPlacement(page: Page): Promise<{
  x: number;
  y: number;
  w: number;
  h: number;
} | null> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const bounds = await page.evaluate(async () => {
      const pane = document.querySelector(".react-flow__pane");
      const viewport = document.querySelector(".react-flow__viewport");
      if (
        !(pane instanceof HTMLElement) ||
        !(viewport instanceof HTMLElement)
      ) {
        return null;
      }
      const paneRect = pane.getBoundingClientRect();
      if (paneRect.width <= 0 || paneRect.height <= 0) {
        return null;
      }
      const gutter = 16;
      const transform = window.getComputedStyle(viewport).transform;
      if (!transform || transform === "none") {
        return null;
      }
      const matrix = new DOMMatrixReadOnly(transform);
      const scale = matrix.a || 1;
      if (!Number.isFinite(scale) || scale <= 0) {
        return null;
      }
      const overviewPane = document.getElementById("OverviewPane");
      const uiEditorPane = document.getElementById("UiEditorPane");

      // These panes use `display: contents`, so the actual hit-testing overlays are the
      // sidebars (`aside.single-cell-container`) and the fixed icon rails.
      const leftOverlays: HTMLElement[] = [];
      const rightOverlays: HTMLElement[] = [];

      const overviewAside = overviewPane?.querySelector(
        "aside.single-cell-container",
      );
      if (overviewAside instanceof HTMLElement) {
        leftOverlays.push(overviewAside);
      }
      const overviewRail = overviewPane?.querySelector(
        '[data-testid="overview-icon-rail"]',
      );
      if (overviewRail instanceof HTMLElement) {
        leftOverlays.push(overviewRail);
      }

      const uiEditorAside = uiEditorPane?.querySelector(
        "aside.single-cell-container",
      );
      if (uiEditorAside instanceof HTMLElement) {
        rightOverlays.push(uiEditorAside);
      }
      const uiEditorRail = uiEditorPane?.querySelector(
        '[data-testid="ui-editor-icon-rail"]',
      );
      if (uiEditorRail instanceof HTMLElement) {
        rightOverlays.push(uiEditorRail);
      }

      let leftPx = gutter;
      for (const overlay of leftOverlays) {
        const rect = overlay.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          continue;
        }
        leftPx = Math.max(leftPx, rect.right - paneRect.left + gutter);
      }

      let rightPx = paneRect.width - gutter;
      for (const overlay of rightOverlays) {
        const rect = overlay.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          continue;
        }
        rightPx = Math.min(rightPx, rect.left - paneRect.left - gutter);
      }

      const topPx = gutter;
      const bottomPx = paneRect.height - gutter;

      const x = (-matrix.e + leftPx) / scale;
      const y = (-matrix.f + topPx) / scale;
      return {
        x,
        y,
        w: Math.max(1, (rightPx - leftPx) / scale),
        h: Math.max(1, (bottomPx - topPx) / scale),
      };
    });
    if (bounds) {
      return bounds;
    }
    await page.waitForTimeout(100);
  }
  return null;
}

export async function postBackend<T>(
  page: Page,
  path: string,
  payload: Record<string, unknown> | null,
): Promise<T | null> {
  installUnexpectedApiErrorGuard(page);
  throwIfUnexpectedApiError(page);

  const response = await page.request.post(`${BACKEND_ORIGIN}/api${path}`, {
    data: payload,
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

export async function emitChatStreamDelta(
  page: Page,
  payload: {
    projectConfigId: string;
    sectionId?: string;
    chatId: string;
    chunk: unknown;
  },
): Promise<void> {
  await page.evaluate(async (message) => {
    const { receiveLLMResponseChunk } = await import(
      "/src/state/actions/ai.ts"
    );
    receiveLLMResponseChunk(message);
  }, payload);
}

async function refreshProjectStateFromBackend(
  page: Page,
  projectConfigId: string,
): Promise<void> {
  // Test-only escape hatch for deliberate out-of-band backend mutations.
  // Prefer browser-side frontend actions or pre-navigation seeding instead.
  await page.evaluate(async (targetProjectConfigId) => {
    const { processProjectStateUpdateFromBackend } = await import(
      "/src/state/actions/sectionInfos.ts"
    );
    const { route_get_latest_project_state } = await import(
      "/src/utils/generatedEndpoints.ts"
    );
    const response = await route_get_latest_project_state({
      projectConfigId: targetProjectConfigId,
    });
    if (response.status !== 200 || !response.data) {
      throw new Error(
        `Failed to refresh project state for ${targetProjectConfigId}: ${response.status}`,
      );
    }
    processProjectStateUpdateFromBackend(response.data);
  }, projectConfigId);
}

async function getBackend<T>(page: Page, path: string): Promise<T | null> {
  installUnexpectedApiErrorGuard(page);
  throwIfUnexpectedApiError(page);

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

function installUnexpectedApiErrorGuard(page: Page): void {
  if (unexpectedApiErrorGuards.has(page)) {
    return;
  }
  const guard: UnexpectedApiErrorGuard = {
    firstError: null,
    hasForcedClose: false,
    seenMessages: new Set<string>(),
    expectedApiErrorOverrides: [],
  };
  const onResponse = (response: Response) => {
    const status = response.status();
    if (status < 400 || status >= 600) {
      return;
    }
    const request = response.request();
    const method = request.method().toUpperCase() as HttpMethod;
    const apiPath = extractApiPath(response.url());
    if (!apiPath || isAllowedApiError(apiPath, status, method)) {
      return;
    }
    if (consumeExpectedApiErrorOverride(guard, apiPath, status, method)) {
      return;
    }
    const message = `[E2E unexpected API error] ${request.method()} ${apiPath} -> ${status}`;
    if (guard.seenMessages.has(message)) {
      return;
    }
    guard.seenMessages.add(message);
    if (!guard.firstError) {
      guard.firstError = message;
      console.error(message);
    }
    if (!guard.hasForcedClose) {
      guard.hasForcedClose = true;
      // End the current test quickly so one poisoned state does not cascade.
      void page.close();
    }
  };

  page.on("response", onResponse);
  page.once("close", () => {
    page.off("response", onResponse);
  });
  unexpectedApiErrorGuards.set(page, guard);
}

function consumeExpectedApiErrorOverride(
  guard: UnexpectedApiErrorGuard,
  path: string,
  status: number,
  method: HttpMethod,
): boolean {
  const now = Date.now();
  for (
    let index = 0;
    index < guard.expectedApiErrorOverrides.length;
    index += 1
  ) {
    const override = guard.expectedApiErrorOverrides[index];
    if (override.expiresAtMs < now) {
      guard.expectedApiErrorOverrides.splice(index, 1);
      index -= 1;
      continue;
    }
    if (override.path !== path || !override.statuses.includes(status)) {
      continue;
    }
    if (override.method && override.method !== method) {
      continue;
    }
    override.remainingCount -= 1;
    if (override.remainingCount <= 0) {
      guard.expectedApiErrorOverrides.splice(index, 1);
    }
    return true;
  }
  return false;
}

function throwIfUnexpectedApiError(page: Page): void {
  const firstError = unexpectedApiErrorGuards.get(page)?.firstError;
  if (firstError) {
    throw new Error(firstError);
  }
}

function extractApiPath(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.pathname.startsWith("/api/")) {
      return parsed.pathname;
    }
  } catch {
    return null;
  }
  return null;
}

function isAllowedApiError(
  path: string,
  status: number,
  method: HttpMethod,
): boolean {
  return DEFAULT_ALLOWED_API_ERRORS.some(
    (entry) =>
      entry.path === path &&
      entry.statuses.includes(status) &&
      (!entry.method || entry.method === method),
  );
}

async function waitForLatestChatId(
  page: Page,
  projectConfigId: string,
): Promise<string> {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const runs = (await getBackend<AgentRun[]>(page, "/getAgentRuns")) ?? [];
    const latest = findLatestChatRun(runs, projectConfigId);
    if (latest) {
      const chatId = getRunInputString(latest, "chatId");
      if (chatId) {
        return chatId;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Timed out waiting for project chat run.");
}

function findLatestChatRun(
  runs: AgentRun[],
  projectConfigId: string,
): AgentRun | null {
  const filtered = runs.filter((run) => {
    const runType = getRunInputString(run, "runType");
    if (runType !== "llm_chat") {
      return false;
    }
    const runProjectId = getRunInputString(run, "projectConfigId");
    return runProjectId === projectConfigId;
  });
  if (filtered.length === 0) {
    return null;
  }
  return filtered.reduce((latest, run) => {
    if (!latest) {
      return run;
    }
    return getRunTimestamp(run) > getRunTimestamp(latest) ? run : latest;
  }, filtered[0] ?? null);
}

function getRunInputString(run: AgentRun, key: string): string | null {
  const inputs = run.inputs;
  if (!inputs || typeof inputs !== "object") {
    return null;
  }
  if (Array.isArray(inputs)) {
    return null;
  }
  const raw = inputs[key];
  if (typeof raw === "string" && raw.trim()) {
    return raw;
  }
  return null;
}

function getRunTimestamp(run: AgentRun): number {
  const eventTimestamps = (run.events ?? [])
    .map((event) => Date.parse(event.timestamp ?? ""))
    .filter((value) => !Number.isNaN(value));
  if (eventTimestamps.length > 0) {
    return Math.max(...eventTimestamps);
  }
  const finishedAt = Date.parse(run.finishedAt ?? "");
  if (!Number.isNaN(finishedAt)) {
    return finishedAt;
  }
  const startedAt = Date.parse(run.startedAt ?? "");
  if (!Number.isNaN(startedAt)) {
    return startedAt;
  }
  return 0;
}

async function isAppReady(page: Page): Promise<boolean> {
  try {
    await page.waitForSelector(READY_SELECTOR, { timeout: READY_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

async function waitForReadySurface(
  page: Page,
  options: {
    context: string;
    pageErrors?: string[];
    consoleErrors?: string[];
  },
): Promise<void> {
  try {
    await page.waitForSelector(READY_SELECTOR, { timeout: READY_TIMEOUT_MS });
  } catch (error) {
    const debugLines = await buildReadinessDebugLines(
      page,
      options.pageErrors ?? [],
      options.consoleErrors ?? [],
    );
    throw new Error(
      `${options.context}\n${debugLines.join("\n")}\nOriginal error: ${String(
        error,
      )}`,
    );
  }
}

async function buildReadinessDebugLines(
  page: Page,
  pageErrors: string[],
  consoleErrors: string[],
): Promise<string[]> {
  const debugLines: string[] = [];
  debugLines.push(`Current URL: ${page.url()}`);

  if (pageErrors.length) {
    debugLines.push("");
    debugLines.push("Page errors:");
    debugLines.push(...pageErrors.slice(0, 5));
  }
  if (consoleErrors.length) {
    debugLines.push("");
    debugLines.push("Console errors:");
    debugLines.push(...consoleErrors.slice(0, 10));
  }

  const unexpectedApiError = unexpectedApiErrorGuards.get(page)?.firstError;
  if (unexpectedApiError) {
    debugLines.push("");
    debugLines.push("Unexpected API error:");
    debugLines.push(unexpectedApiError);
  }

  try {
    const runtimeSnapshot = await page.evaluate(async () => {
      const collectText = (selector: string) => {
        const node = document.querySelector(selector);
        return node instanceof HTMLElement ? node.innerText : null;
      };
      const bodyText = document.body.innerText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 40);

      let storeSnapshot: Record<string, unknown> | null = null;
      try {
        const definitions = await import("/src/state/definitions.ts");
        storeSnapshot = {
          serverMode: definitions.useServerMode.getState(),
          projectLoading: definitions.useProjectLoading.getState(),
          projectConfig: definitions.useProjectState.getState().projectConfig,
        };
      } catch (error) {
        storeSnapshot = { error: String(error) };
      }

      return {
        title: document.title,
        hasReadySelector: Boolean(document.querySelector(".react-flow__pane")),
        hasViewport: Boolean(document.querySelector(".react-flow__viewport")),
        hasSpinner: Boolean(document.querySelector(".animate-spin")),
        appShellText: collectText(".app-shell"),
        bodyText,
        storeSnapshot,
      };
    });
    debugLines.push("");
    debugLines.push("Runtime snapshot:");
    debugLines.push(JSON.stringify(runtimeSnapshot, null, 2));
  } catch (error) {
    debugLines.push("");
    debugLines.push(`Runtime snapshot failed: ${String(error)}`);
  }

  return debugLines;
}

async function navigateToDefaultProject(page: Page): Promise<void> {
  try {
    const targetName = await resolveDefaultProjectName(page, true);

    if (!targetName) {
      return;
    }

    const targetUrl = new URL(
      encodeURIComponent(targetName),
      BASE_URL,
    ).toString();
    await page.goto(withBackendOriginOverride(targetUrl), {
      waitUntil: "domcontentloaded",
    });
  } catch {
    // Ignore failures; callers will fall back to readiness checks.
  }
}

async function waitForProjectUrl(page: Page): Promise<void> {
  await page.waitForURL((url) => url.toString().startsWith(PROJECT_URL), {
    timeout: READY_TIMEOUT_MS,
    waitUntil: "domcontentloaded",
  });
}

async function hasAuthCookie(page: Page): Promise<boolean> {
  const cookies = await page.context().cookies([PROJECT_URL, BACKEND_ORIGIN]);
  return cookies.some(
    (cookie) =>
      cookie.name === AUTH_COOKIE_PREFIX ||
      cookie.name.startsWith(`${AUTH_COOKIE_PREFIX}_`),
  );
}

async function resolveDefaultProjectName(
  page: Page,
  allowCreate: boolean,
): Promise<string | null> {
  const metadata = await postBackend<ProjectMetadataResponse>(
    page,
    "/loadAllProjectMetadata",
    {},
  );
  if (!metadata) {
    return null;
  }

  const configuredDefaultProjectName =
    metadata.projectMetadata.find(
      (entry) => entry.id === metadata.defaultProjectConfigId,
    )?.name ?? null;
  if (configuredDefaultProjectName) {
    return configuredDefaultProjectName;
  }

  const firstProjectName = metadata.projectMetadata[0]?.name ?? null;
  if (firstProjectName || !allowCreate) {
    return firstProjectName;
  }

  // If the workspace has no projects (possible if a prior test deleted them),
  // create one so IDE-mode tests can proceed.
  return await postBackend<string>(page, "/createProjectConfig", {
    previewImgColor: "bg-blue-500/60",
  });
}
