import { expect, test, type Page } from "@playwright/test";
import {
  createTopLevelSectionFromFrontend,
  ensureAppReady,
  getCurrentProjectConfigId,
  setSectionSizesFromFrontend,
} from "../helpers";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const MOD_KEY = process.platform === "darwin" ? "Meta" : "Control";
const SELECT_ALL_SHORTCUT = MOD_KEY === "Meta" ? "Meta+A" : "Control+A";
const COMPLETION_INPUT = "str.";

const TARGET_SECTION_WIDTH = 320;
const TOOLTIP_SELECTOR = ".cm-tooltip-autocomplete";
const TOOLTIP_PARENT_ID = "setta-codemirror-tooltips";
const REQUEST_TIMEOUT_MS = 15000;
const COMPLETION_WAIT_TIMEOUT_MS = 10000;

type CodeMirrorCompletion = { label: string; type: string };

test("code autocomplete tooltip escapes section bounds", async ({ page }) => {
  test.setTimeout(60000);
  await ensureAppReady(page);

  const projectConfigId = await getCurrentProjectConfigId(page);
  const sectionId = await createCodeSection(page, projectConfigId);

  try {
    const resizable = page.locator(`[id="${sectionId}-CustomResizable"]`);
    await expect(resizable).toBeVisible();
    await setSectionSize(page, projectConfigId, sectionId, {
      width: TARGET_SECTION_WIDTH,
      height: 110,
    });

    const heightBefore = await getSectionHeight(resizable);
    if (heightBefore > 200) {
      throw new Error(
        `Section height too tall (${heightBefore}) to force autocomplete overflow.`,
      );
    }

    const codeMirror = page.locator(
      `.setta-gpu-flow__node[data-id="${sectionId}"] [data-section-main-editor] .cm-content`,
    );
    await expect(codeMirror).toBeVisible();
    await focusCodeMirrorContent(codeMirror);

    await page.keyboard.press(SELECT_ALL_SHORTCUT);
    await page.keyboard.insertText(COMPLETION_INPUT);
    await expect
      .poll(async () => codeMirror.textContent())
      .toContain(COMPLETION_INPUT);
    const completionResponsePromise = page.waitForResponse(
      (response) => response.url().includes("/api/codeAreaCompletion"),
      { timeout: COMPLETION_WAIT_TIMEOUT_MS },
    );
    await page.keyboard.press("Control+Space");
    const completionResponse = await completionResponsePromise;
    const completions =
      (await completionResponse.json()) as CodeMirrorCompletion[];
    expect(completions.length).toBeGreaterThan(0);

    const tooltip = page.locator(`#${TOOLTIP_PARENT_ID} ${TOOLTIP_SELECTOR}`);
    await expect(tooltip).toBeVisible({ timeout: 15000 });

    const overflowCheck = await page.evaluate(
      ({ containerId, tooltipSelector, tooltipParentId }) => {
        const container = document.getElementById(containerId);
        const tooltipParent =
          document.getElementById(tooltipParentId) ?? document;
        const tooltipEl = tooltipParent.querySelector(tooltipSelector) ?? null;
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
      el.closest(".setta-gpu-flow__canvas") ??
      document.querySelector(".setta-gpu-flow__canvas");
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

async function focusCodeMirrorContent(
  codeMirror: ReturnType<Page["locator"]>,
): Promise<void> {
  await codeMirror.evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      throw new Error("CodeMirror content is not an HTMLElement.");
    }
    element.focus({ preventScroll: true });
  });
  await expect
    .poll(async () =>
      codeMirror.evaluate((element) => element.contains(document.activeElement)),
    )
    .toBe(true);
}

async function createCodeSection(
  page: Page,
  projectConfigId: string,
): Promise<string> {
  const response = await createTopLevelSectionFromFrontend(page, {
    projectConfigId,
    implType: "Code",
  });
  if (!response?.sectionId) {
    throw new Error("Missing code section id.");
  }
  return response.sectionId;
}

async function setSectionSize(
  page: Page,
  projectConfigId: string,
  sectionId: string,
  size: { width: number; height: number | "auto" },
): Promise<void> {
  await setSectionSizesFromFrontend(page, {
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
