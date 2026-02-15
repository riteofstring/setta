import type { ConsoleMessage, Page } from "@playwright/test";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const BOOTSTRAP_TOKEN = process.env.SETTA_BOOTSTRAP_TOKEN ?? "";
const AUTH_COOKIE_PREFIX = process.env.SETTA_AUTH_COOKIE_NAME ?? "setta_auth";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const PROJECT_URL =
  process.env.SETTA_PROJECT_URL ??
  (process.env.SETTA_PROJECT_PATH
    ? new URL(process.env.SETTA_PROJECT_PATH, BASE_URL).toString()
    : BASE_URL);
const BACKEND_ORIGIN_OVERRIDE_QUERY_PARAM = "__setta_backend_origin";
const READY_SELECTOR = ".react-flow__pane";
const READY_TIMEOUT_MS = 30000;
const SHOULD_RESOLVE_DEFAULT_PROJECT = PROJECT_URL === BASE_URL;

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
type AllLLMConfigs = {
  configs?: Record<
    string,
    { model: string; provider?: string; api_key_env?: string }
  >;
  mcpServers?: Record<string, unknown>;
  default_config_id?: string | null;
};
type CreateSectionResponse = { sectionId?: string };
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
};

export async function ensureAppReady(page: Page): Promise<void> {
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
      const defaultConfig = await getDefaultConfigNameResult(page);
      if (defaultConfig.name) {
        const defaultUrl = new URL(defaultConfig.name, BASE_URL).toString();
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

export async function setOverviewTab(
  page: Page,
  tabName: string,
): Promise<void> {
  await seedLocalStorage(page, { overviewTab: tabName, overviewVis: true });
}

export async function openIsolatedProject(
  page: Page,
): Promise<IsolatedProjectContext> {
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
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);
  const projectConfigId = await getCurrentProjectConfigId(page);
  return {
    projectConfigId,
    defaultProjectConfigId: metadata.defaultProjectConfigId ?? null,
  };
}

export async function cleanupIsolatedProject(
  page: Page,
  context: IsolatedProjectContext | null,
): Promise<void> {
  if (!context) {
    return;
  }
  if (
    context.defaultProjectConfigId &&
    context.defaultProjectConfigId !== context.projectConfigId
  ) {
    await postBackend(page, "/setAsDefaultProject", {
      projectConfigId: context.defaultProjectConfigId,
    });
  }
  await postBackend(page, "/deleteProjectConfigs", {
    ids: [context.projectConfigId],
  });
}

export async function ensureManagedChatEngine(
  page: Page,
): Promise<() => Promise<void>> {
  const initialConfig = await getBackend<AllLLMConfigs>(page, "/llm/config");
  if (!initialConfig) {
    throw new Error("Missing LLM config payload.");
  }
  let createdLlmConfigId: string | null = null;
  let didUpdateLlmConfig = false;
  const existingConfigs = initialConfig.configs ?? {};

  const engineConfigs = await getBackend<EngineConfig[]>(
    page,
    "/getEngineConfigs",
  );
  const existingEngine =
    engineConfigs?.find((config) => config.engineType === "setta_llm") ?? null;

  let llmConfigId = existingEngine?.settaLlmConfigId ?? null;
  if (llmConfigId && !existingConfigs[llmConfigId]) {
    const updated: AllLLMConfigs = {
      ...initialConfig,
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
      ...initialConfig,
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
    if (createdEngineConfigId) {
      await postBackend(page, "/deleteEngineConfig", {
        configId: createdEngineConfigId,
      });
    }
    if (createdLlmConfigId || didUpdateLlmConfig) {
      await postBackend(
        page,
        "/llm/config",
        initialConfig as Record<string, unknown>,
      );
    }
  };
}

export async function createChatSection(
  page: Page,
  projectConfigId: string,
  baseName: string,
): Promise<{ sectionId: string; sectionName: string }> {
  const sectionName = `${baseName}-${Date.now()}`;
  const created = await postBackend<CreateSectionResponse>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType: "Chat",
    },
  );
  if (!created?.sectionId) {
    throw new Error("Missing sectionId when creating chat section.");
  }
  await postBackend(page, "/setSectionName", {
    projectConfigId,
    sectionId: created.sectionId,
    name: sectionName,
  });
  return { sectionId: created.sectionId, sectionName };
}

export async function createTextBlockSection(
  page: Page,
  projectConfigId: string,
  baseName: string,
): Promise<{ sectionId: string; sectionName: string }> {
  const sectionName = `${baseName}-${Date.now()}`;
  const created = await postBackend<CreateSectionResponse>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType: "TextBlock",
    },
  );
  if (!created?.sectionId) {
    throw new Error("Missing sectionId when creating text block section.");
  }
  await postBackend(page, "/setSectionName", {
    projectConfigId,
    sectionId: created.sectionId,
    name: sectionName,
  });
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
  await postBackend(page, "/setChatSectionState", payload);
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
  const viewportBounds = await getViewportBoundsForPlacement(page);
  if (!viewportBounds) {
    throw new Error("Unable to resolve viewport bounds for section placement.");
  }
  const response = await postBackend<{ sectionId?: string }>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType: "Callable",
      viewportBounds,
    },
  );
  if (!response?.sectionId) {
    throw new Error("Missing sectionId when creating callable section.");
  }
  return response.sectionId;
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
  const response = await page.request.post(`${BACKEND_ORIGIN}/api${path}`, {
    data: payload,
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

async function getBackend<T>(page: Page, path: string): Promise<T | null> {
  const response = await page.request.get(`${BACKEND_ORIGIN}/api${path}`);
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

async function navigateToDefaultProject(page: Page): Promise<void> {
  try {
    const metadata = await postBackend<ProjectMetadataResponse>(
      page,
      "/loadAllProjectMetadata",
      {},
    );
    if (!metadata) {
      return;
    }

    // Prefer the configured default; otherwise fall back to the first project.
    let targetName =
      metadata.projectMetadata.find(
        (entry) => entry.id === metadata.defaultProjectConfigId,
      )?.name ?? metadata.projectMetadata[0]?.name;

    // If the workspace has no projects (possible if a prior test deleted them),
    // create one so IDE-mode tests can proceed.
    if (!targetName) {
      targetName = await postBackend<string>(page, "/createProjectConfig", {
        previewImgColor: "bg-blue-500/60",
      });
    }

    if (!targetName) {
      return;
    }

    const targetUrl = new URL(encodeURIComponent(targetName), BASE_URL).toString();
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

async function getDefaultConfigNameResult(page: Page): Promise<{
  name: string | null;
  status: number;
}> {
  const response = await page.request.post(
    `${BACKEND_ORIGIN}/api/getDefaultConfigName`,
    {
      data: {},
    },
  );
  const status = response.status();
  if (!response.ok()) {
    return { name: null, status };
  }
  const text = await response.text();
  if (!text) {
    return { name: null, status };
  }
  const payload = JSON.parse(text) as unknown;
  if (typeof payload !== "string" || !payload.trim()) {
    return { name: null, status };
  }
  return { name: payload, status };
}
