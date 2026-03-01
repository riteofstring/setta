import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createCallableSection,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
  syncProjectStateFromBackend,
} from "../helpers";

const UNDO_REDO_KEY_REPEAT_COUNT = 40;
const MODIFIER_KEY = process.platform === "darwin" ? "Meta" : "Control";

function isUndoRedoRegressionError(message: string): boolean {
  return (
    message.includes("getCurrSectionVariantId") ||
    message.includes("getCurrShownParamIds") ||
    message.includes("UiEditor") ||
    message.includes("sectionInfos.ts:") ||
    message.includes("tabbingLogic") ||
    message.includes("Cannot read properties of null (reading 'focus')")
  );
}

function isUndoRedoApiPath(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.pathname === "/api/undo" || url.pathname === "/api/redo";
  } catch {
    return false;
  }
}

async function repeatUndoShortcut(page: Page, repeatCount: number): Promise<void> {
  await page.keyboard.down(MODIFIER_KEY);
  try {
    for (let idx = 0; idx < repeatCount; idx += 1) {
      await page.keyboard.press("KeyZ");
    }
  } finally {
    await page.keyboard.up(MODIFIER_KEY);
  }
}

async function repeatRedoShortcut(page: Page, repeatCount: number): Promise<void> {
  await page.keyboard.down(MODIFIER_KEY);
  await page.keyboard.down("Shift");
  try {
    for (let idx = 0; idx < repeatCount; idx += 1) {
      await page.keyboard.press("KeyZ");
    }
  } finally {
    await page.keyboard.up("Shift");
    await page.keyboard.up(MODIFIER_KEY);
  }
}

async function readCallableNameFromBackend(
  page: Page,
  projectConfigId: string,
  sectionId: string,
): Promise<string | null> {
  const stateEnvelope = await postBackend<{
    projectState?: {
      projectConfig: { sectionVariantMap: Record<string, string> };
      sectionVariants: Record<string, { impl: string }>;
      sectionImpls: Record<string, { type: string; callable?: string | null }>;
      codeObjs: Record<string, { name?: string | null }>;
    };
  }>(page, "/getLatestProjectState", { projectConfigId });
  if (!stateEnvelope?.projectState) {
    return null;
  }
  const snapshot = stateEnvelope.projectState;
  const sectionVariantId = snapshot.projectConfig.sectionVariantMap[sectionId];
  if (!sectionVariantId) {
    return null;
  }
  const sectionVariant = snapshot.sectionVariants[sectionVariantId];
  if (!sectionVariant) {
    return null;
  }
  const sectionImpl = snapshot.sectionImpls[sectionVariant.impl];
  if (!sectionImpl || sectionImpl.type !== "Callable") {
    return null;
  }
  const callableId =
    "callable" in sectionImpl && typeof sectionImpl.callable === "string"
      ? sectionImpl.callable
      : null;
  if (!callableId) {
    return null;
  }
  const callableCore = snapshot.codeObjs[callableId];
  if (!callableCore) {
    return null;
  }
  return callableCore.name ?? null;
}

test.describe.serial("section undo/redo", () => {
  test("create callable section undo/redo does not trigger runtime errors", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => {
      pageErrors.push(error?.message ?? String(error));
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const sectionId = await createCallableSection(
        page,
        projectContext.projectConfigId,
      );
      const sectionNode = page.locator(`[data-testid="rf__node-${sectionId}"]`);
      await expect(sectionNode).toBeVisible();
      await page.evaluate(async (activeSectionId) => {
        const mod = await import("/src/state/definitions");
        mod.useProjectState.setState((state) => {
          state.projectConfig.activeIds = [activeSectionId];
        });
      }, sectionId);

      await postBackend(page, "/undo", {
        projectConfigId: projectContext.projectConfigId,
        steps: 1,
      });
      await expect(sectionNode).toHaveCount(0);

      await postBackend(page, "/redo", {
        projectConfigId: projectContext.projectConfigId,
        steps: 1,
      });
      await expect(sectionNode).toBeVisible();

      const undoRedoPageErrors = pageErrors.filter(isUndoRedoRegressionError);
      const undoRedoConsoleErrors = consoleErrors.filter(
        isUndoRedoRegressionError,
      );
      expect(undoRedoPageErrors).toEqual([]);
      expect(undoRedoConsoleErrors).toEqual([]);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("rapid keyboard undo/redo after set callable does not produce runtime or API errors", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const undoRedoErrorStatuses: number[] = [];
    page.on("pageerror", (error) => {
      pageErrors.push(error?.message ?? String(error));
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("response", (response) => {
      if (!isUndoRedoApiPath(response.url())) {
        return;
      }
      if (response.status() >= 400) {
        undoRedoErrorStatuses.push(response.status());
      }
    });

    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const sectionId = await createCallableSection(
        page,
        projectContext.projectConfigId,
      );
      const sectionNode = page.locator(`[data-testid="rf__node-${sectionId}"]`);
      await expect(sectionNode).toBeVisible();

      await postBackend(page, "/setCallable", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        callableName: "sorted",
        refetchParams: true,
      });
      await postBackend(page, "/setSectionName", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        name: "undo-redo-stress",
      });
      await page.evaluate(async (activeSectionId) => {
        const mod = await import("/src/state/definitions");
        mod.useProjectState.setState((state) => {
          state.projectConfig.activeIds = [activeSectionId];
        });
      }, sectionId);

      // Ensure keyboard shortcuts target the global document handlers.
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      });
      await repeatUndoShortcut(page, UNDO_REDO_KEY_REPEAT_COUNT);
      await repeatRedoShortcut(page, UNDO_REDO_KEY_REPEAT_COUNT);

      // Let pending transport/state updates settle before asserting errors.
      await page.waitForTimeout(1200);
      const undoRedoPageErrors = pageErrors.filter(isUndoRedoRegressionError);
      const undoRedoConsoleErrors = consoleErrors.filter(
        isUndoRedoRegressionError,
      );
      expect(undoRedoErrorStatuses).toEqual([]);
      expect(undoRedoPageErrors).toEqual([]);
      expect(undoRedoConsoleErrors).toEqual([]);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("rapid keyboard undo/redo after mixed section edits does not produce runtime or API errors", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const undoRedoErrorStatuses: number[] = [];
    page.on("pageerror", (error) => {
      pageErrors.push(error?.message ?? String(error));
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("response", (response) => {
      if (!isUndoRedoApiPath(response.url())) {
        return;
      }
      if (response.status() >= 400) {
        undoRedoErrorStatuses.push(response.status());
      }
    });

    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const sectionId = await createCallableSection(
        page,
        projectContext.projectConfigId,
      );
      const secondSectionId = await createCallableSection(
        page,
        projectContext.projectConfigId,
      );
      const sectionNode = page.locator(`[data-testid="rf__node-${sectionId}"]`);
      await expect(sectionNode).toBeVisible();

      await postBackend(page, "/setCallable", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        callableName: "sorted",
        refetchParams: true,
      });
      await postBackend(page, "/setSectionName", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        name: "undo-redo-mixed",
      });
      await postBackend(page, "/setSectionTagColor", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        tagColor: "#16a34a",
      });
      await postBackend(page, "/setSectionStyleColor", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        styleColor: "#2563eb",
      });
      await postBackend(page, "/setSectionColumnWidth", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        columnWidth: 330,
      });
      await postBackend(page, "/setViewport", {
        projectConfigId: projectContext.projectConfigId,
        viewport: { x: 44, y: -18, zoom: 1.25 },
      });
      await page.evaluate(
        async ({ firstSectionId, secondId }) => {
          const mod = await import("/src/state/definitions");
          mod.useProjectState.setState((state) => {
            state.projectConfig.activeIds = [firstSectionId, secondId];
          });
        },
        { firstSectionId: sectionId, secondId: secondSectionId },
      );

      // Ensure keyboard shortcuts target the global document handlers.
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      });
      await repeatUndoShortcut(page, 60);
      await repeatRedoShortcut(page, 60);

      // Let pending transport/state updates settle before asserting errors.
      await page.waitForTimeout(1500);
      const undoRedoPageErrors = pageErrors.filter(isUndoRedoRegressionError);
      const undoRedoConsoleErrors = consoleErrors.filter(
        isUndoRedoRegressionError,
      );
      expect(undoRedoErrorStatuses).toEqual([]);
      expect(undoRedoPageErrors).toEqual([]);
      expect(undoRedoConsoleErrors).toEqual([]);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("rapid undo/redo preserves callable semantic state after gen prefix + set callable", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const undoRedoErrorStatuses: number[] = [];
    page.on("pageerror", (error) => {
      pageErrors.push(error?.message ?? String(error));
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("response", (response) => {
      if (!isUndoRedoApiPath(response.url())) {
        return;
      }
      if (response.status() >= 400) {
        undoRedoErrorStatuses.push(response.status());
      }
    });

    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const sectionId = await createCallableSection(
        page,
        projectContext.projectConfigId,
      );
      const sectionNode = page.locator(`[data-testid="rf__node-${sectionId}"]`);
      await expect(sectionNode).toBeVisible();

      await postBackend(page, "/setGenCodePrefix", {
        projectConfigId: projectContext.projectConfigId,
        genCodePrefix: "import math",
      });
      await postBackend(page, "/setCallable", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        callableName: "math.sqrt",
        refetchParams: false,
      });

      await expect
        .poll(() =>
          readCallableNameFromBackend(
            page,
            projectContext.projectConfigId,
            sectionId,
          ),
        )
        .toBe("math.sqrt");

      await syncProjectStateFromBackend(page, projectContext.projectConfigId);
      await expect(sectionNode.locator("search.section-search")).toContainText(
        "math.sqrt",
      );

      await Promise.all(
        Array.from({ length: 60 }, () =>
          postBackend(page, "/undo", {
            projectConfigId: projectContext.projectConfigId,
            steps: 1,
          }),
        ),
      );
      await Promise.all(
        Array.from({ length: 60 }, () =>
          postBackend(page, "/redo", {
            projectConfigId: projectContext.projectConfigId,
            steps: 1,
          }),
        ),
      );
      await page.waitForTimeout(1500);
      await expect
        .poll(() =>
          readCallableNameFromBackend(
            page,
            projectContext.projectConfigId,
            sectionId,
          ),
        )
        .toBe("math.sqrt");
      await syncProjectStateFromBackend(page, projectContext.projectConfigId);
      await expect(sectionNode.locator("search.section-search")).toContainText(
        "math.sqrt",
      );

      const undoRedoPageErrors = pageErrors.filter(isUndoRedoRegressionError);
      const undoRedoConsoleErrors = consoleErrors.filter(
        isUndoRedoRegressionError,
      );
      expect(undoRedoErrorStatuses).toEqual([]);
      expect(undoRedoPageErrors).toEqual([]);
      expect(undoRedoConsoleErrors).toEqual([]);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
