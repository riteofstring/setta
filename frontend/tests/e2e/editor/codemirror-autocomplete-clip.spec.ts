import { expect, test, type Page } from "@playwright/test";

import { ensureAppReady } from "../helpers";

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
const TARGET_CALLABLE = "str";
const MOD_KEY = process.platform === "darwin" ? "Meta" : "Control";
const SELECT_ALL_SHORTCUT =
  MOD_KEY === "Meta" ? "Meta+A" : "Control+A";
const COMPLETION_INPUT = `${TARGET_CALLABLE}.`;

const TARGET_SECTION_WIDTH = 320;
const TOOLTIP_SELECTOR = ".cm-tooltip-autocomplete";
const TOOLTIP_PARENT_ID = "setta-codemirror-tooltips";
const REQUEST_TIMEOUT_MS = 5000;
const COMPLETION_WAIT_TIMEOUT_MS = 10000;

type ProjectMetadataEntry = { id: string; name: string };
type ProjectMetadataResponse = {
  defaultProjectConfigId: string | null;
  projectMetadata: ProjectMetadataEntry[];
};

test("callable autocomplete tooltip escapes section bounds", async ({ page }) => {
  test.setTimeout(60000);
  await ensureAppReady(page);

  const projectConfigId = await getCurrentProjectConfigId(page);
  const sectionId = await createCallableSection(page, projectConfigId);

  try {
    const resizable = page.locator(
      `[id="${sectionId}-CustomResizable"]`,
    );
    await expect(resizable).toBeVisible();
    await setCallable(page, projectConfigId, sectionId, TARGET_CALLABLE);
    await setSectionSize(page, projectConfigId, sectionId, {
      width: TARGET_SECTION_WIDTH,
      height: "auto",
    });

    const heightBefore = await getSectionHeight(resizable);
    if (heightBefore > 200) {
      throw new Error(
        `Section height too tall (${heightBefore}) to force autocomplete overflow.`,
      );
    }

    const searchInput = page.locator(`[id="${sectionId}-search"]`);
    await expect(searchInput).toBeVisible();
    await searchInput.click();

    const codeMirror = page.locator(
      `[id="CodeMirror-${sectionId}-null"]`,
    );
    await expect(codeMirror).toBeVisible();
    await codeMirror.click();

    await page.keyboard.press(SELECT_ALL_SHORTCUT);
    const completionResponsePromise = page.waitForResponse(
      (response) => response.url().includes("/api/textFieldCompletion"),
      { timeout: COMPLETION_WAIT_TIMEOUT_MS },
    );
    await page.keyboard.type(COMPLETION_INPUT);
    await completionResponsePromise;

    const tooltip = page.locator(
      `#${TOOLTIP_PARENT_ID} ${TOOLTIP_SELECTOR}`,
    );
    await expect(tooltip).toBeVisible({ timeout: 15000 });

    const overflowCheck = await page.evaluate(
      ({ containerId, tooltipSelector, tooltipParentId }) => {
        const container = document.getElementById(containerId);
        const tooltipParent =
          document.getElementById(tooltipParentId) ?? document;
        const tooltipEl =
          tooltipParent.querySelector(tooltipSelector) ?? null;
        if (!tooltipEl || !container) {
          return { ok: false, reason: "missing-elements" } as const;
        }

        const tooltipRect = tooltipEl.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const overflowBottom = tooltipRect.bottom - containerRect.bottom;
        const overflowTop = containerRect.top - tooltipRect.top;
        const hasOverflow = overflowBottom > 1 || overflowTop > 1;

        if (!hasOverflow) {
          return { ok: false, reason: "no-overflow" } as const;
        }

        const isOutsideSection = !container.contains(tooltipEl);

        return {
          ok: true,
          overflowBottom,
          overflowTop,
          isOutsideSection,
        } as const;
      },
      {
        containerId: `${sectionId}-CustomResizable`,
        tooltipSelector: TOOLTIP_SELECTOR,
        tooltipParentId: TOOLTIP_PARENT_ID,
      },
    );

    if (!overflowCheck.ok) {
      throw new Error(
        `Autocomplete tooltip did not overflow section bounds (${overflowCheck.reason}).`,
      );
    }

    expect(overflowCheck.isOutsideSection).toBe(true);
  } finally {
    await postBackend(page, "/deleteSections", {
      projectConfigId,
      sectionIds: [sectionId],
    });
  }
});

async function getSectionHeight(
  resizable: ReturnType<Page["locator"]>,
): Promise<number> {
  return resizable.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const viewport =
      el.closest(".react-flow__viewport") ??
      document.querySelector(".react-flow__viewport");
    let scale = 1;
    if (viewport) {
      const transform = window.getComputedStyle(viewport).transform;
      if (transform && transform !== "none") {
        const matrix = new DOMMatrixReadOnly(transform);
        if (Number.isFinite(matrix.a) && matrix.a > 0) {
          scale = matrix.a;
        }
      }
    }
    return scale > 0 ? rect.height / scale : rect.height;
  });
}


async function createCallableSection(
  page: Page,
  projectConfigId: string,
): Promise<string> {
  const response = await postBackend<{ sectionId?: string }>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType: "Callable",
    },
  );
  if (!response?.sectionId) {
    throw new Error("Missing sectionId when creating callable section.");
  }
  return response.sectionId;
}

async function setCallable(
  page: Page,
  projectConfigId: string,
  sectionId: string,
  callableName: string,
): Promise<void> {
  await postBackendWithRetries(page, "/setCallable", {
    projectConfigId,
    sectionId,
    callableName,
    refetchParams: false,
  });
}

async function setSectionSize(
  page: Page,
  projectConfigId: string,
  sectionId: string,
  size: { width: number; height: number | "auto" },
): Promise<void> {
  await postBackend(page, "/setSectionSizes", {
    projectConfigId,
    sectionSizes: {
      [sectionId]: size,
    },
  });
}

async function postBackend<T>(
  page: Page,
  path: string,
  payload: Record<string, unknown> | null,
): Promise<T | null> {
  const response = await page.request.post(`${BACKEND_ORIGIN}/api${path}`, {
    data: payload,
    timeout: REQUEST_TIMEOUT_MS,
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

async function postBackendWithRetries<T>(
  page: Page,
  path: string,
  payload: Record<string, unknown> | null,
  attempts = 8,
  delayMs = 500,
): Promise<T | null> {
  let lastStatus = 0;
  let lastText = "";
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await page.request.post(`${BACKEND_ORIGIN}/api${path}`, {
      data: payload,
      timeout: REQUEST_TIMEOUT_MS,
    });
    lastStatus = response.status();
    lastText = await response.text();
    if (response.ok()) {
      if (!lastText) {
        return null;
      }
      return JSON.parse(lastText) as T;
    }
    if (attempt < attempts - 1) {
      await page.waitForTimeout(delayMs);
    }
  }
  const detail = lastText ? ` ${lastText}` : "";
  throw new Error(`Backend request failed (${lastStatus}): ${path}${detail}`);
}

async function getCurrentProjectConfigId(page: Page): Promise<string> {
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
