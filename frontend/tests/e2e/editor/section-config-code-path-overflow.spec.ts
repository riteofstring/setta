import { expect, test, type Page } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  cleanupIsolatedProject,
  createTopLevelSectionFromFrontend,
  ensureAppReady,
  openIsolatedProject,
  seedLocalStorage,
  setCodeFileBindingFromFrontend,
} from "../helpers";

const MIN_UI_EDITOR_WIDTH = 425;
const OVERFLOW_TOLERANCE_PX = 2;
const LONG_CODE_FILE_NAME =
  "a_really_long_file_name_that_needs_to_truncate_cleanly.py";

test.use({ viewport: { width: 1600, height: 1000 } });

test("code section file path stays clipped at narrow and wide pane widths", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    uiEditorVis: true,
    uiEditorTab: { Code: "SectionConfig" },
    uiEditorWidth: MIN_UI_EDITOR_WIDTH,
    uiEditorTrueWidth: MIN_UI_EDITOR_WIDTH,
  });
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const workspaceRoot = process.env.SETTA_WORKSPACE_ROOT;
  if (!workspaceRoot) {
    throw new Error("Missing SETTA_WORKSPACE_ROOT for e2e test.");
  }

  try {
    const sectionId = await createCodeSection(
      page,
      projectContext.projectConfigId,
    );
    const codeFileBindingPath = await createLongCodeFilePath(workspaceRoot);
    await setCodeFileBinding(
      page,
      projectContext.projectConfigId,
      sectionId,
      codeFileBindingPath,
    );

    await focusSection(page, sectionId);

    const filePathInput = page.getByTestId(
      "code-area-settings-file-path-input",
    );
    await expect(filePathInput).toBeVisible();
    const filePathValue = await filePathInput.inputValue();
    expect(filePathValue).toContain(LONG_CODE_FILE_NAME);
    expect(filePathValue.length).toBeGreaterThan(120);

    const narrowPaneWidth = await getUiEditorPaneWidth(page);
    expect(narrowPaneWidth).toBeGreaterThanOrEqual(MIN_UI_EDITOR_WIDTH - 1);
    await assertCodePathInputDoesNotBleed(page, "narrow");

    // Request an intentionally oversized width so PaneContainer clamps to the
    // largest width supported by the current viewport.
    const targetWideWidth = await page.evaluate(() =>
      Math.ceil(window.innerWidth),
    );
    await setUiEditorWidth(page, targetWideWidth);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".canvas-flow__canvas");
    await focusSection(page, sectionId);

    const widePaneWidth = await getUiEditorPaneWidth(page);
    const maxSupportedWidth = await page.evaluate(
      () => window.innerWidth / 2.1,
    );
    expect(widePaneWidth).toBeLessThanOrEqual(maxSupportedWidth + 2);
    await assertCodePathInputDoesNotBleed(page, "wide");
  } finally {
    await cleanupLongCodeFilePath(workspaceRoot);
    await cleanupIsolatedProject(page, projectContext);
  }
});

async function createCodeSection(
  page: Page,
  projectConfigId: string,
): Promise<string> {
  const response = await createTopLevelSectionFromFrontend(page, {
    projectConfigId,
    implType: "Code",
  });
  if (!response?.sectionId) {
    throw new Error("Missing sectionId when creating code section.");
  }
  return response.sectionId;
}

async function setCodeFileBinding(
  page: Page,
  projectConfigId: string,
  sectionId: string,
  canonicalPath: string,
): Promise<void> {
  await setCodeFileBindingFromFrontend(page, {
    projectConfigId,
    sectionId,
    binding: {
      canonical_path: canonicalPath,
      access_mode: "read_write",
    },
  });
}

async function createLongCodeFilePath(workspaceRoot: string): Promise<string> {
  const absolutePath = path.join(
    workspaceRoot,
    "setta-code-path-overflow",
    "some",
    "very",
    "deeply",
    "nested",
    "path",
    "that",
    "should",
    "truncate",
    "inside",
    "the",
    "section",
    "config",
    "pane",
    "src",
    "components",
    LONG_CODE_FILE_NAME,
  );
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, "print('bound code path overflow test')\n");
  return path.relative(workspaceRoot, absolutePath).replaceAll(path.sep, "/");
}

async function cleanupLongCodeFilePath(workspaceRoot: string): Promise<void> {
  await fs.rm(path.join(workspaceRoot, "setta-code-path-overflow"), {
    recursive: true,
    force: true,
  });
}

async function focusSection(page: Page, sectionId: string): Promise<void> {
  await page.evaluate(async (targetSectionId: string) => {
    const { applyActiveSectionChange } = await import(
      "/src/state/actions/activeSectionController"
    );
    applyActiveSectionChange({
      interaction: "go-to",
      sectionId: targetSectionId,
    });
  }, sectionId);
}

async function setUiEditorWidth(page: Page, nextWidth: number): Promise<void> {
  await page.evaluate((width) => {
    const key = "setta_data";
    const raw = localStorage.getItem(key);
    let payload: { state: Record<string, unknown>; version: number } = {
      state: {},
      version: 0,
    };

    if (raw) {
      try {
        const parsed = JSON.parse(raw) as {
          state?: Record<string, unknown>;
          version?: number;
        };
        payload = {
          state:
            parsed && typeof parsed.state === "object" && parsed.state
              ? parsed.state
              : {},
          version: typeof parsed?.version === "number" ? parsed.version : 0,
        };
      } catch {
        payload = { state: {}, version: 0 };
      }
    }

    payload.state = {
      ...payload.state,
      uiEditorVis: true,
      uiEditorTab: {
        ...(typeof payload.state.uiEditorTab === "object" &&
        payload.state.uiEditorTab
          ? (payload.state.uiEditorTab as Record<string, unknown>)
          : {}),
        Code: "SectionConfig",
      },
      uiEditorWidth: width,
      uiEditorTrueWidth: width,
    };
    localStorage.setItem(key, JSON.stringify(payload));
  }, nextWidth);
}

async function getUiEditorPaneWidth(page: Page): Promise<number> {
  const pane = page.locator("#UiEditorPane aside").first();
  await expect(pane).toBeVisible();
  const paneBox = await pane.boundingBox();
  if (!paneBox) {
    throw new Error("Expected UI editor pane bounding box.");
  }
  return paneBox.width;
}

async function assertCodePathInputDoesNotBleed(
  page: Page,
  contextLabel: string,
): Promise<void> {
  const stats = await page.evaluate(() => {
    const pane = document.querySelector("#UiEditorPane aside");
    const filePathInput = document.querySelector(
      '[data-testid="code-area-settings-file-path-input"]',
    );
    if (
      !(pane instanceof HTMLElement) ||
      !(filePathInput instanceof HTMLElement)
    ) {
      return null;
    }

    const paneRect = pane.getBoundingClientRect();
    const inputRect = filePathInput.getBoundingClientRect();
    let paneMaxRightOverflow = 0;

    for (const child of pane.querySelectorAll<HTMLElement>("*")) {
      if (!child.offsetParent) {
        continue;
      }
      const childRect = child.getBoundingClientRect();
      if (childRect.width <= 0 || childRect.height <= 0) {
        continue;
      }
      paneMaxRightOverflow = Math.max(
        paneMaxRightOverflow,
        childRect.right - paneRect.right,
      );
    }

    const inputStyles = getComputedStyle(filePathInput);
    return {
      paneMaxRightOverflow,
      inputRightOverflow: inputRect.right - paneRect.right,
      inputOverflowX: inputStyles.overflowX,
      inputTextOverflow: inputStyles.textOverflow,
      inputWhiteSpace: inputStyles.whiteSpace,
      inputBoxSizing: inputStyles.boxSizing,
    };
  });
  if (!stats) {
    throw new Error(
      `Unable to evaluate code path overflow stats (${contextLabel}).`,
    );
  }

  expect(
    stats.paneMaxRightOverflow,
    `${contextLabel} pane content overflowed past the right edge`,
  ).toBeLessThanOrEqual(OVERFLOW_TOLERANCE_PX);
  expect(
    stats.inputRightOverflow,
    `${contextLabel} code path input overflowed past the right edge`,
  ).toBeLessThanOrEqual(OVERFLOW_TOLERANCE_PX);
  expect(["clip", "hidden"]).toContain(stats.inputOverflowX);
  expect(stats.inputTextOverflow).toBe("ellipsis");
  expect(stats.inputWhiteSpace).toBe("nowrap");
  expect(stats.inputBoxSizing).toBe("border-box");
}
