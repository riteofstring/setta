import type { Page } from "@playwright/test";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const BOOTSTRAP_TOKEN = process.env.SETTA_BOOTSTRAP_TOKEN ?? "";
const AUTH_COOKIE_NAME = process.env.SETTA_AUTH_COOKIE_NAME ?? "setta_auth";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const PROJECT_URL =
  process.env.SETTA_PROJECT_URL ??
  (process.env.SETTA_PROJECT_PATH
    ? new URL(process.env.SETTA_PROJECT_PATH, BASE_URL).toString()
    : BASE_URL);
const READY_SELECTOR = ".react-flow__pane";
const SHOULD_RESOLVE_DEFAULT_PROJECT = PROJECT_URL === BASE_URL;

type ProjectMetadataEntry = { id: string; name: string };
type ProjectMetadataResponse = {
  defaultProjectConfigId: string | null;
  projectMetadata: ProjectMetadataEntry[];
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
  await page.goto(PROJECT_URL, { waitUntil: "domcontentloaded" });
  if (await isAppReady(page)) {
    return;
  }

  const hasCookie = await hasAuthCookie(page);
  if (!hasCookie && BOOTSTRAP_TOKEN) {
    await page.goto(
      `${BACKEND_ORIGIN}/__setta__/bootstrap#token=${BOOTSTRAP_TOKEN}`,
    );
    try {
      await waitForProjectUrl(page);
    } catch {
      // Fall through to the final readiness check below.
    }
  }

  if (SHOULD_RESOLVE_DEFAULT_PROJECT) {
    await navigateToDefaultProject(page);
  } else {
    await page.goto(PROJECT_URL, { waitUntil: "domcontentloaded" });
  }
  if (await isAppReady(page)) {
    return;
  }

  if (!BOOTSTRAP_TOKEN && !hasCookie) {
    throw new Error(
      "Missing SETTA_BOOTSTRAP_TOKEN and no auth cookie present. Open /__setta__/bootstrap to mint one.",
    );
  }
  throw new Error("Setta UI did not become ready. Check bootstrap auth.");
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
              typeof parsedRecord.version === "number" ? parsedRecord.version : 0,
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

export async function getViewportBoundsForPlacement(
  page: Page,
): Promise<{
  x: number;
  y: number;
  w: number;
  h: number;
} | null> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const bounds = await page.evaluate(async () => {
      const pane = document.querySelector(".react-flow__pane");
      const viewport = document.querySelector(".react-flow__viewport");
      if (!(pane instanceof HTMLElement) || !(viewport instanceof HTMLElement)) {
        return null;
      }
      const paneRect = pane.getBoundingClientRect();
      if (paneRect.width <= 0 || paneRect.height <= 0) {
        return null;
      }
      const overviewPane = document.getElementById("OverviewPane");
      const overviewDomWidth = overviewPane
        ? overviewPane.getBoundingClientRect().width
        : 0;
      const { useLocalStorage } = await import("/src/state/definitions");
      const storedOverviewWidth =
        useLocalStorage.getState().overviewTrueWidth;
      const overviewWidth = Number.isFinite(storedOverviewWidth)
        ? storedOverviewWidth
        : overviewDomWidth;
      const transform = window.getComputedStyle(viewport).transform;
      if (!transform || transform === "none") {
        return null;
      }
      const matrix = new DOMMatrixReadOnly(transform);
      const scale = matrix.a || 1;
      if (!Number.isFinite(scale) || scale <= 0) {
        return null;
      }
      const x = (-matrix.e + overviewWidth) / scale;
      const y = -matrix.f / scale;
      return {
        x,
        y,
        w: paneRect.width / scale,
        h: paneRect.height / scale,
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

async function isAppReady(page: Page): Promise<boolean> {
  try {
    await page.waitForSelector(READY_SELECTOR, { timeout: 20000 });
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
    const defaultId = metadata.defaultProjectConfigId;
    const defaultEntry = metadata.projectMetadata.find(
      (entry) => entry.id === defaultId,
    );
    if (!defaultEntry?.name) {
      return;
    }
    const targetUrl = new URL(
      encodeURIComponent(defaultEntry.name),
      BASE_URL,
    ).toString();
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  } catch {
    // Ignore failures; callers will fall back to readiness checks.
  }
}

async function waitForProjectUrl(page: Page): Promise<void> {
  await page.waitForURL((url) => url.toString().startsWith(PROJECT_URL), {
    timeout: 20000,
    waitUntil: "domcontentloaded",
  });
}

async function hasAuthCookie(page: Page): Promise<boolean> {
  const cookies = await page.context().cookies([PROJECT_URL, BACKEND_ORIGIN]);
  return cookies.some((cookie) => cookie.name === AUTH_COOKIE_NAME);
}
