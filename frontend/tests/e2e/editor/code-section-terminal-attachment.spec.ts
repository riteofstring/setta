import { expect, test, type Locator, type Page } from "@playwright/test";
import { ensureAppReady, postBackend } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const HOME_URL = new URL("/home", BASE_URL).toString();
const PROJECT_URL = resolveProjectUrl();
const READY_SELECTOR = ".react-flow__pane";

type ProjectMetadataEntry = { id: string; name: string };
type ProjectMetadataResponse = {
  defaultProjectConfigId: string | null;
  projectMetadata: ProjectMetadataEntry[];
};
type TopLevelSectionLayout = { x: number; y: number; zIndex?: number };
type SectionCore = {
  sharedModifier: { attachedTerminalSectionId?: string | null };
};
type ProjectStateResponse = {
  projectConfig: {
    sectionVariantMap: Record<string, string>;
    topLevelSections: Record<string, TopLevelSectionLayout>;
  };
  sections: Record<string, SectionCore>;
  sectionVariants: Record<string, { impl: string }>;
  sectionImpls: Record<
    string,
    {
      type: string;
      attachedTerminalSectionId?: string | null;
      children?: string[];
      code?: string;
      size?: {
        width: number | "auto";
        height: number | "auto";
      };
    }
  >;
};

test("run attaches a terminal and reuses it", async ({ page }) => {
  test.setTimeout(90000);
  await ensureAppReady(page);

  const { projectConfigId, projectConfigName } =
    await createNewProjectConfig(page);

  try {
    const sectionId = await createCodeSection(page);
    await postBackend(page, "/setSectionName", {
      projectConfigId,
      sectionId,
      name: "Runner Code",
    });

    await runCodeBlockInPage(page, sectionId);
    const firstTerminalId = await waitForAttachedTerminalId(
      page,
      projectConfigName,
      sectionId,
    );

    await runCodeBlockInPage(page, sectionId);
    const secondTerminalId = await waitForAttachedTerminalId(
      page,
      projectConfigName,
      sectionId,
    );

    expect(secondTerminalId).toBe(firstTerminalId);
    const embeddedTerminalHost = page.locator(
      `.react-flow__node[data-id="${sectionId}"] [data-attached-terminal-section-id="${firstTerminalId}"]`,
    );
    await expect(embeddedTerminalHost).toBeVisible();
    const terminalNode = page.locator(
      `.react-flow__node[data-id="${firstTerminalId}"]`,
    );
    await expect(terminalNode).toHaveCount(0);
  } finally {
    await deleteProjectConfigById(page, projectConfigId);
  }
});

test("code header terminal button creates an attached terminal without running", async ({
  page,
}) => {
  test.setTimeout(90000);
  await ensureAppReady(page);

  const { projectConfigId, projectConfigName } =
    await createNewProjectConfig(page);

  try {
    const sectionId = await createCodeSection(page);
    const codeNode = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
    const codeSection = codeNode.locator(
      `section[data-section-id="${sectionId}"]`,
    );
    const codeHeader = codeSection.locator("header.section-title");
    const toggleButton = codeHeader.locator("[data-attached-terminal-toggle]");
    const trashButton = codeNode.locator("[data-attached-terminal-trash]");

    await expect(toggleButton).toHaveCount(1);
    await expect(toggleButton).toHaveAttribute("title", "Create terminal");
    await expect(trashButton).toHaveCount(0);

    await toggleButton.click({ force: true });

    const terminalId = await waitForAttachedTerminalId(
      page,
      projectConfigName,
      sectionId,
    );
    const embeddedTerminalHost = codeNode.locator(
      `[data-attached-terminal-section-id="${terminalId}"]`,
    );
    const terminalNode = page.locator(
      `.react-flow__node[data-id="${terminalId}"]`,
    );
    const attachedTerminalSection = codeNode.locator(
      `section[data-section-id="${terminalId}"]`,
    );
    const attachedTerminalTrashButton = attachedTerminalSection.locator(
      "[data-attached-terminal-trash]",
    );
    await expect(embeddedTerminalHost).toBeVisible();
    await expect(terminalNode).toHaveCount(0);
    await expect(toggleButton).toHaveAttribute("title", "Hide terminal");
    await expect(attachedTerminalTrashButton).toHaveCount(1);
  } finally {
    await deleteProjectConfigById(page, projectConfigId);
  }
});

test("embedded terminal keeps code editor visible", async ({ page }) => {
  test.setTimeout(90000);
  await ensureAppReady(page);

  const { projectConfigId, projectConfigName } =
    await createNewProjectConfig(page);

  try {
    const sectionId = await createCodeSection(page);
    await runCodeBlockInPage(page, sectionId);
    const terminalId = await waitForAttachedTerminalId(
      page,
      projectConfigName,
      sectionId,
    );

    const codeEditor = page.locator(
      `.react-flow__node[data-id="${sectionId}"] article[data-section-main-editor]`,
    );
    const terminalContainer = page.locator(
      `.react-flow__node[data-id="${sectionId}"] [data-attached-terminal-section-id="${terminalId}"]`,
    );

    await expect(codeEditor).toBeVisible();
    await expect(terminalContainer).toBeVisible();

    const codeBox = await codeEditor.boundingBox();
    const terminalBox = await terminalContainer.boundingBox();
    if (!codeBox || !terminalBox) {
      throw new Error("Missing bounding boxes for visibility check.");
    }
    const isInsideCodeEditor = await terminalContainer.evaluate((node) => {
      return Boolean(node.closest("article[data-section-main-editor]"));
    });
    expect(isInsideCodeEditor).toBe(false);
  } finally {
    await deleteProjectConfigById(page, projectConfigId);
  }
});

test("terminal text selection stays aligned at react flow zoom", async ({
  page,
}) => {
  test.setTimeout(90000);
  await addTerminalOutputInstrumentation(page);
  await ensureAppReady(page);

  const { projectConfigId, projectConfigName } =
    await createNewProjectConfig(page);

  try {
    const terminalId = await createTerminalSection(page);
    await resetViewport(page);
    await waitForTerminalReady(page, terminalId, {
      required: !process.env.CI,
      timeoutMs: process.env.CI ? 5000 : 20000,
    });

    // Make the terminal wide enough that the marker line doesn't wrap so we
    // can do a precise single-line selection.
    await setSectionSize(page, terminalId, { width: 1200, height: 420 });

    const marker =
      "SELECTION_ZOOM_TEST_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    await focusTerminalAndType(page, terminalId, `printf '${marker}\\n'`);
    await waitForTerminalOutputMarker(page, terminalId, marker, 20000);
    await waitForTerminalOutputToStabilize(page, terminalId, {
      timeoutMs: 10000,
      stableMs: 500,
    });
    await waitForTerminalRowsMarker(
      page,
      terminalId,
      marker,
      process.env.CI ? 30000 : 20000,
    );

    const startOffset = 14;
    const endOffset = 42;

    const selectionAtZoom1 = await dragSelectTerminalMarkerRangeAndCopy({
      page,
      terminalId,
      marker,
      startOffset,
      endOffset,
    });

    const normalizedZoom1 = selectionAtZoom1.replace(/\r/g, "").trimEnd();
    expect(normalizedZoom1.length).toBeGreaterThan(6);
    expect(marker).toContain(normalizedZoom1);

    const terminalNode = page.locator(
      `.react-flow__node[data-id="${terminalId}"]`,
    );
    await expect(terminalNode).toBeVisible();
    const boxAtZoom1 = await terminalNode.boundingBox();
    if (!boxAtZoom1) {
      throw new Error("Missing terminal bounding box.");
    }

    const zoomOutButton = page.getByRole("button", { name: "zoom out" });
    await zoomOutButton.click();
    await page.waitForTimeout(80);
    await zoomOutButton.click();
    await page.waitForTimeout(150);

    const zoomOut = await page.evaluate(() => window.reactFlowZoom ?? 1);
    expect(zoomOut).toBeLessThan(0.8);
    const boxAfterZoomOut = await terminalNode.boundingBox();
    if (!boxAfterZoomOut) {
      throw new Error("Missing terminal bounding box after zoom out.");
    }
    expect(boxAfterZoomOut.width).toBeLessThan(boxAtZoom1.width - 10);

    const selectionAtZoomOut = await dragSelectTerminalMarkerRangeAndCopy({
      page,
      terminalId,
      marker,
      startOffset,
      endOffset,
    });
    expect(selectionAtZoomOut.replace(/\r/g, "").trimEnd()).toBe(
      normalizedZoom1,
    );

    const zoomInButton = page.getByRole("button", { name: "zoom in" });
    await zoomInButton.click();
    await page.waitForTimeout(80);
    await zoomInButton.click();
    await page.waitForTimeout(80);
    await zoomInButton.click();
    await page.waitForTimeout(150);

    const zoomIn = await page.evaluate(() => window.reactFlowZoom ?? 1);
    expect(zoomIn).toBeGreaterThan(1.1);
    const boxAfterZoomIn = await terminalNode.boundingBox();
    if (!boxAfterZoomIn) {
      throw new Error("Missing terminal bounding box after zoom in.");
    }
    expect(boxAfterZoomIn.width).toBeGreaterThan(boxAtZoom1.width + 10);

    const selectionAtZoomIn = await dragSelectTerminalMarkerRangeAndCopy({
      page,
      terminalId,
      marker,
      startOffset,
      endOffset,
    });
    expect(selectionAtZoomIn.replace(/\r/g, "").trimEnd()).toBe(
      normalizedZoom1,
    );
  } finally {
    await deleteProjectConfigById(page, projectConfigId);
  }
});

test("attached terminal renders without header and resizes independently", async ({
  page,
}) => {
  test.setTimeout(90000);
  await ensureAppReady(page);

  const { projectConfigId, projectConfigName } =
    await createNewProjectConfig(page);

  try {
    const sectionId = await createCodeSection(page);
    await runCodeBlockInPage(page, sectionId);
    const terminalId = await waitForAttachedTerminalId(
      page,
      projectConfigName,
      sectionId,
    );

    const codeNode = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
    const codeEditor = codeNode.locator(`article[data-section-main-editor]`);
    const terminalHost = codeNode.locator(
      `[data-attached-terminal-section-id="${terminalId}"]`,
    );

    await expect(codeEditor).toBeVisible();
    await expect(terminalHost).toBeVisible();

    const terminalSection = codeNode.locator(
      `section[data-section-id="${terminalId}"]`,
    );
    await expect(terminalSection).toBeVisible();
    await expect(terminalSection.locator("header.section-title")).toHaveCount(
      0,
    );

    const codeSection = codeNode.locator(
      `section[data-section-id="${sectionId}"]`,
    );
    const codeHeader = codeSection.locator("header.section-title");
    await expect(
      codeHeader.locator("[data-attached-terminal-toggle]"),
    ).toHaveCount(1);
    await expect(
      codeHeader.locator("[data-attached-terminal-trash]"),
    ).toHaveCount(0);
    await expect(
      terminalSection.locator("[data-attached-terminal-trash]"),
    ).toHaveCount(1);
    await expect(
      terminalSection.locator(".section-resize-handle-bottom"),
    ).toHaveCount(1);
    await expect(
      terminalSection.locator(".section-resize-handle-right"),
    ).toHaveCount(1);

    const initialCodeBox = await codeEditor.boundingBox();
    const initialTerminalBox = await terminalHost.boundingBox();
    if (!initialCodeBox || !initialTerminalBox) {
      throw new Error("Missing bounding boxes for resize check.");
    }

    const nextTerminalHeight = Math.round(initialTerminalBox.height + 90);
    await setSectionSize(page, terminalId, { height: nextTerminalHeight });

    await expect
      .poll(async () => {
        const updatedBox = await terminalHost.boundingBox();
        return updatedBox ? updatedBox.height : 0;
      })
      .toBeGreaterThan(initialTerminalBox.height + 40);

    const updatedCodeBox = await codeEditor.boundingBox();
    if (!updatedCodeBox) {
      throw new Error("Missing code editor bounding box.");
    }
    expect(
      Math.abs(updatedCodeBox.height - initialCodeBox.height),
    ).toBeLessThanOrEqual(3);
  } finally {
    await deleteProjectConfigById(page, projectConfigId);
  }
});

test("embedded terminal code editor scrolls when content overflows", async ({
  page,
}) => {
  test.setTimeout(90000);
  await ensureAppReady(page);

  const { projectConfigId, projectConfigName } =
    await createNewProjectConfig(page);

  try {
    const sectionId = await createCodeSection(page);
    await runCodeBlockInPage(page, sectionId);
    await waitForAttachedTerminalId(page, projectConfigName, sectionId);
    await setSectionHeight(page, sectionId, 260);

    const longCode = Array.from(
      { length: 240 },
      (_, index) => `line_${index + 1}`,
    ).join("\n");
    await setCodeForSection(page, sectionId, longCode);

    const scroller = page.locator(
      `.react-flow__node[data-id="${sectionId}"] .cm-scroller`,
    );
    await expect(scroller).toBeVisible();

    await expect
      .poll(async () => {
        const metrics = await scroller.evaluate((el) => ({
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
        }));
        return metrics.scrollHeight > metrics.clientHeight;
      })
      .toBe(true);

    const scrollTop = await scroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      return el.scrollTop;
    });
    expect(scrollTop).toBeGreaterThan(0);
  } finally {
    await deleteProjectConfigById(page, projectConfigId);
  }
});

test("embedded terminal group renders a single outline + agentic handles and toggling off reverts join styling", async ({
  page,
}) => {
  test.setTimeout(90000);
  await ensureAppReady(page);

  const { projectConfigId, projectConfigName } =
    await createNewProjectConfig(page);

  try {
    const sectionId = await createCodeSection(page);
    await runCodeBlockInPage(page, sectionId);
    const terminalId = await waitForAttachedTerminalId(
      page,
      projectConfigName,
      sectionId,
    );

    const codeNode = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
    const joinedGroup = codeNode.locator("[data-joined-code-terminal-group]");
    await expect(joinedGroup).toBeVisible();

    const codeSection = codeNode.locator(
      `section[data-section-id="${sectionId}"]`,
    );
    const terminalSection = codeNode.locator(
      `section[data-section-id="${terminalId}"]`,
    );
    await expect(codeSection).toBeVisible();
    await expect(terminalSection).toBeVisible();

    await expect(codeSection).toHaveClass(/rounded-b-none/);
    await expect(terminalSection).toHaveClass(/rounded-t-none/);

    const agenticHandles = codeNode.locator(
      ".react-flow__handle.agentic-handle",
    );
    await expect(agenticHandles).toHaveCount(2);

    await expect
      .poll(async () => {
        const widths = await Promise.all([
          joinedGroup.evaluate(
            (el) => window.getComputedStyle(el).outlineWidth,
          ),
          codeSection.evaluate(
            (el) => window.getComputedStyle(el).outlineWidth,
          ),
          terminalSection.evaluate(
            (el) => window.getComputedStyle(el).outlineWidth,
          ),
        ]);
        return widths.join("|");
      })
      .toBe("4px|0px|0px");

    const codeHeader = codeSection.locator("header.section-title");
    const toggleButton = codeHeader.locator("[data-attached-terminal-toggle]");
    await expect(toggleButton).toHaveCount(1);
    await toggleButton.click({ force: true });

    const terminalHost = codeNode.locator(
      `[data-attached-terminal-section-id="${terminalId}"]`,
    );
    await expect(joinedGroup).toHaveCount(0);
    await expect(terminalHost).toHaveCount(0);
    await expect(codeSection).not.toHaveClass(/rounded-b-none/);
    await expect(terminalSection).toHaveCount(0);
    await expect(agenticHandles).toHaveCount(2);

    await toggleButton.click({ force: true });
    await expect(joinedGroup).toBeVisible();
    await expect(terminalHost).toBeVisible();
    await expect(codeSection).toHaveClass(/rounded-b-none/);
    await expect(terminalSection).toBeVisible();
    await expect(terminalSection).toHaveClass(/rounded-t-none/);
    await expect(agenticHandles).toHaveCount(2);
  } finally {
    await deleteProjectConfigById(page, projectConfigId);
  }
});

test("resizing embedded terminal width also resizes the code section", async ({
  page,
}) => {
  test.setTimeout(90000);
  await ensureAppReady(page);

  const { projectConfigId, projectConfigName } =
    await createNewProjectConfig(page);

  try {
    const sectionId = await createCodeSection(page);
    await runCodeBlockInPage(page, sectionId);
    const terminalId = await waitForAttachedTerminalId(
      page,
      projectConfigName,
      sectionId,
    );

    const codeNode = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
    const codeSection = codeNode.locator(
      `section[data-section-id="${sectionId}"]`,
    );
    const terminalSection = codeNode.locator(
      `section[data-section-id="${terminalId}"]`,
    );
    await expect(codeSection).toBeVisible();
    await expect(terminalSection).toBeVisible();

    const initialBoxes = await Promise.all([
      codeSection.boundingBox(),
      terminalSection.boundingBox(),
    ]);
    const initialCodeBox = initialBoxes[0];
    const initialTerminalBox = initialBoxes[1];
    if (!initialCodeBox || !initialTerminalBox) {
      throw new Error("Missing bounding boxes for embedded resize check.");
    }

    const nextWidth = Math.round(initialTerminalBox.width + 160);

    await setSectionSize(page, terminalId, { width: nextWidth });

    await expect
      .poll(async () => {
        const nextBoxes = await Promise.all([
          codeSection.boundingBox(),
          terminalSection.boundingBox(),
        ]);
        const nextCodeBox = nextBoxes[0];
        const nextTerminalBox = nextBoxes[1];
        if (!nextCodeBox || !nextTerminalBox) {
          return false;
        }
        const codeDelta = nextCodeBox.width - initialCodeBox.width;
        const widthDiff = Math.abs(nextCodeBox.width - nextTerminalBox.width);
        return codeDelta > 60 && widthDiff < 3;
      })
      .toBe(true);

    const finalBoxes = await Promise.all([
      codeSection.boundingBox(),
      terminalSection.boundingBox(),
    ]);
    const finalCodeBox = finalBoxes[0];
    const finalTerminalBox = finalBoxes[1];
    if (!finalCodeBox || !finalTerminalBox) {
      throw new Error(
        "Missing final bounding boxes for embedded resize check.",
      );
    }
    expect(finalCodeBox.width - initialCodeBox.width).toBeGreaterThan(60);
    expect(Math.abs(finalCodeBox.width - finalTerminalBox.width)).toBeLessThan(
      3,
    );
  } finally {
    await deleteProjectConfigById(page, projectConfigId);
  }
});

test("embedded terminal trash deletes the attached terminal", async ({
  page,
}) => {
  test.setTimeout(90000);
  await ensureAppReady(page);

  const { projectConfigId, projectConfigName } =
    await createNewProjectConfig(page);

  try {
    const sectionId = await createCodeSection(page);
    await runCodeBlockInPage(page, sectionId);
    const terminalId = await waitForAttachedTerminalId(
      page,
      projectConfigName,
      sectionId,
    );

    const codeNode = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
    const codeSection = codeNode.locator(
      `section[data-section-id="${sectionId}"]`,
    );
    const codeHeader = codeSection.locator("header.section-title");
    const toggleButton = codeHeader.locator("[data-attached-terminal-toggle]");
    const terminalSection = codeNode.locator(
      `section[data-section-id="${terminalId}"]`,
    );
    const trashButton = terminalSection.locator(
      "[data-attached-terminal-trash]",
    );
    await expect(toggleButton).toHaveCount(1);
    await expect(trashButton).toHaveCount(1);

    await trashButton.click({ force: true });

    await expect
      .poll(async () => {
        const state = await loadProjectState(page, projectConfigName);
        const impl = resolveSectionImpl(state, sectionId);
        return impl?.attachedTerminalSectionId ?? null;
      })
      .toBeNull();
    await expect
      .poll(async () => {
        const state = await loadProjectState(page, projectConfigName);
        return resolveSectionImpl(state, terminalId) ? "present" : null;
      })
      .toBeNull();
  } finally {
    await deleteProjectConfigById(page, projectConfigId);
  }
});

test("embedded terminals only receive runs from their code section", async ({
  page,
}) => {
  test.setTimeout(90000);
  await ensureAppReady(page);

  const { projectConfigId, projectConfigName } =
    await createNewProjectConfig(page);

  try {
    const codeXId = await createCodeSection(page);
    const codeYId = await createCodeSection(page);
    const markerX = `X_MARKER_${Date.now()}`;
    const markerY = `Y_MARKER_${Date.now()}`;

    await setSectionSize(page, codeXId, { height: 520 });
    await setSectionSize(page, codeYId, { height: 520 });

    await setCodeForSection(
      page,
      codeXId,
      `import sys\nprint("${markerX}", flush=True)\n`,
    );
    await setCodeForSection(
      page,
      codeYId,
      `import sys\nprint("${markerY}", flush=True)\n`,
    );

    await runCodeBlockInPage(page, codeXId);
    const terminalXId = await waitForAttachedTerminalId(
      page,
      projectConfigName,
      codeXId,
    );
    await expect
      .poll(async () => {
        return (await getTerminalRowsSnapshot(page, terminalXId)).join("\n");
      })
      .toContain(markerX);

    await runCodeBlockInPage(page, codeYId);
    const terminalYId = await waitForAttachedTerminalId(
      page,
      projectConfigName,
      codeYId,
    );
    expect(terminalYId).not.toBe(terminalXId);
    await expect
      .poll(async () => {
        return (await getTerminalRowsSnapshot(page, terminalYId)).join("\n");
      })
      .toContain(markerY);

    await expect
      .poll(async () => {
        const rows = await getTerminalRowsSnapshot(page, terminalXId);
        return rows.some((row) => row.includes(markerY));
      })
      .toBe(false);
  } finally {
    await deleteProjectConfigById(page, projectConfigId);
  }
});

test("terminal can attach via moveSectionsWithBackend", async ({ page }) => {
  test.setTimeout(90000);
  await ensureAppReady(page);

  const { projectConfigId, projectConfigName } =
    await createNewProjectConfig(page);

  try {
    const codeSectionId = await createCodeSection(page);
    const terminalSectionId = await createTerminalSection(page);

    const codeNode = page.locator(
      `.react-flow__node[data-id="${codeSectionId}"]`,
    );
    const terminalNode = page.locator(
      `.react-flow__node[data-id="${terminalSectionId}"]`,
    );

    await expect(codeNode).toBeVisible();
    await expect(terminalNode).toBeVisible();

    await page.evaluate(
      async ({ parentId, childId }) => {
        const { moveSectionsWithBackend } = await import(
          "/src/state/actions/sections/moveSections"
        );
        moveSectionsWithBackend({
          sectionIds: [childId],
          newParentId: parentId,
          newIndex: 0,
          positionsById: null,
        });
      },
      { parentId: codeSectionId, childId: terminalSectionId },
    );

    const attachedId = await waitForAttachedTerminalId(
      page,
      projectConfigName,
      codeSectionId,
    );
    expect(attachedId).toBe(terminalSectionId);
    await expect
      .poll(async () => {
        const state = await loadProjectState(page, projectConfigName);
        return Boolean(state.projectConfig.topLevelSections[terminalSectionId]);
      })
      .toBe(false);
    const embeddedTerminalHost = page.locator(
      `.react-flow__node[data-id="${codeSectionId}"] [data-attached-terminal-section-id="${terminalSectionId}"]`,
    );
    await expect(embeddedTerminalHost).toBeVisible();
    await expect(
      page.locator(`.react-flow__node[data-id="${terminalSectionId}"]`),
    ).toHaveCount(0);
  } finally {
    await deleteProjectConfigById(page, projectConfigId);
  }
});

test("attach then detach round trip", async ({ page }) => {
  test.setTimeout(90000);
  await ensureAppReady(page);

  const { projectConfigId, projectConfigName } =
    await createNewProjectConfig(page);

  try {
    const codeSectionId = await createCodeSection(page);
    const terminalSectionId = await createTerminalSection(page);

    const codeNode = page.locator(
      `.react-flow__node[data-id="${codeSectionId}"]`,
    );
    const terminalNode = page.locator(
      `.react-flow__node[data-id="${terminalSectionId}"]`,
    );

    await expect(codeNode).toBeVisible();
    await expect(terminalNode).toBeVisible();

    await postBackend(page, "/moveSections", {
      projectConfigId,
      sectionIds: [terminalSectionId],
      newParentId: codeSectionId,
      newIndex: 0,
      positionsById: null,
    });

    const attachedId = await waitForAttachedTerminalId(
      page,
      projectConfigName,
      codeSectionId,
    );
    expect(attachedId).toBe(terminalSectionId);
    await expect
      .poll(async () => {
        const state = await loadProjectState(page, projectConfigName);
        return Boolean(state.projectConfig.topLevelSections[terminalSectionId]);
      })
      .toBe(false);

    const embeddedTerminalHost = page.locator(
      `.react-flow__node[data-id="${codeSectionId}"] [data-attached-terminal-section-id="${terminalSectionId}"]`,
    );
    await expect(embeddedTerminalHost).toBeVisible();

    await postBackend(page, "/moveSections", {
      projectConfigId,
      sectionIds: [terminalSectionId],
      newParentId: null,
      newIndex: null,
      positionsById: {
        [terminalSectionId]: { x: 40, y: 40 },
      },
    });

    await expect
      .poll(async () => {
        const state = await loadProjectState(page, projectConfigName);
        const impl = resolveSectionImpl(state, codeSectionId);
        const children = impl?.children ?? [];
        const attached = impl?.attachedTerminalSectionId ?? null;
        const isTopLevel = Boolean(
          state.projectConfig.topLevelSections[terminalSectionId],
        );
        return attached === null && children.length === 0 && isTopLevel;
      })
      .toBe(true);
  } finally {
    await deleteProjectConfigById(page, projectConfigId);
  }
});

test("embedded terminal can detach via drag and drop", async ({ page }) => {
  test.setTimeout(90000);
  await addTerminalOutputInstrumentation(page);
  await ensureAppReady(page);

  const { projectConfigId, projectConfigName } =
    await createNewProjectConfig(page);

  try {
    const sectionId = await createCodeSection(page);
    await resetViewport(page);
    await runCodeBlockInPage(page, sectionId);
    const terminalId = await waitForAttachedTerminalId(
      page,
      projectConfigName,
      sectionId,
    );
    await waitForTerminalReady(page, terminalId, {
      required: !process.env.CI,
      timeoutMs: process.env.CI ? 5000 : 20000,
    });

    const terminalHost = page.locator(
      `.react-flow__node[data-id="${sectionId}"] [data-attached-terminal-section-id="${terminalId}"]`,
    );
    await expect(terminalHost).toBeVisible();
    await expect(
      terminalHost.locator("xpath=ancestor::section[1]"),
    ).toBeVisible();

    const embeddedTerminalContainer = page
      .locator(
        `.react-flow__node[data-id="${sectionId}"] [data-attached-terminal-section-id="${terminalId}"]`,
      )
      .locator("xpath=ancestor::section[1]");

    const getEmbeddedTerminalBox = async (): Promise<{
      x: number;
      y: number;
      width: number;
      height: number;
    } | null> => {
      if ((await embeddedTerminalContainer.count()) === 0) {
        return null;
      }
      return await embeddedTerminalContainer.boundingBox();
    };
    const getEmbeddedTerminalDragBox = async (): Promise<{
      x: number;
      y: number;
      width: number;
      height: number;
    } | null> => {
      if ((await embeddedTerminalContainer.count()) === 0) {
        return null;
      }
      const headerHandle = embeddedTerminalContainer
        .locator("header.section-title")
        .first();
      if ((await headerHandle.count()) > 0) {
        const headerBox = await headerHandle.boundingBox();
        if (headerBox) {
          return headerBox;
        }
      }
      return await getEmbeddedTerminalBox();
    };

    const pane = page.locator(".react-flow__pane");
    const codeNode = page.locator(`.react-flow__node[data-id="${sectionId}"]`);

    const dragAttempts = process.env.CI ? 5 : 3;
    for (let attempt = 0; attempt < dragAttempts; attempt += 1) {
      if (await isTerminalDetachedInDom(page, sectionId, terminalId)) {
        break;
      }
      await focusPaneForDnd(page);

      const paneBox = await pane.boundingBox();
      const codeBox = await codeNode.boundingBox();

      if (!paneBox || !codeBox) {
        throw new Error("Missing bounding boxes for drag.");
      }
      const terminalBox = await getEmbeddedTerminalDragBox();
      if (!terminalBox) {
        await page.waitForTimeout(250);
        continue;
      }

      const startX = terminalBox.x + Math.min(4, terminalBox.width / 2);
      const startY = terminalBox.y + Math.min(4, terminalBox.height / 2);
      const { x: targetX, y: targetY } = getDetachTargetPoint({
        paneBox,
        codeBox,
        attempt,
      });

      await page.keyboard.down("Alt");
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.waitForTimeout(250);
      await page.mouse.move(targetX, targetY, { steps: 12 });
      await page.mouse.up();
      await page.keyboard.up("Alt");

      let didDetach = false;
      try {
        await expect
          .poll(
            async () =>
              await isTerminalDetachedInDom(page, sectionId, terminalId),
            { timeout: 5000 },
          )
          .toBe(true);
        didDetach = true;
      } catch {
        didDetach = false;
      }
      if (didDetach) {
        break;
      }
    }

    await expect
      .poll(
        async () => {
          const state = await loadProjectState(page, projectConfigName);
          const terminalLayout =
            state.projectConfig.topLevelSections[terminalId];
          const codeImpl = resolveSectionImpl(state, sectionId);
          const children = codeImpl?.children ?? [];
          return Boolean(terminalLayout) && !children.includes(terminalId);
        },
        { timeout: 20000 },
      )
      .toBe(true);

    const detachedTerminalNode = page.locator(
      `.react-flow__node[data-id="${terminalId}"]`,
    );
    await expect(detachedTerminalNode).toBeVisible();
    await expect(
      detachedTerminalNode.locator(`section[data-section-id="${terminalId}"]`),
    ).toBeVisible();
    await expect(
      detachedTerminalNode.locator("header.section-title"),
    ).toBeVisible();
    await expectDetachedTerminalHeaderLayout(page, terminalId);
  } finally {
    await deleteProjectConfigById(page, projectConfigId);
  }
});

test("detaching a narrow attached terminal does not append extra output", async ({
  page,
}) => {
  test.setTimeout(process.env.CI ? 120000 : 90000);
  await addTerminalOutputInstrumentation(page);
  await ensureAppReady(page);

  const { projectConfigId, projectConfigName } =
    await createNewProjectConfig(page);

  try {
    const codeSectionId = await createCodeSection(page);
    await resetViewport(page);

    const terminalId = await createTerminalSection(page);
    await page.evaluate(
      async ({ parentId, childId }) => {
        const { moveSectionsWithBackend } = await import(
          "/src/state/actions/sections/moveSections"
        );
        moveSectionsWithBackend({
          sectionIds: [childId],
          newParentId: parentId,
          newIndex: 0,
          positionsById: null,
        });
      },
      { parentId: codeSectionId, childId: terminalId },
    );
    const attachedId = await waitForAttachedTerminalId(
      page,
      projectConfigName,
      codeSectionId,
    );
    expect(attachedId).toBe(terminalId);
    await expect(
      page.locator(`.react-flow__node[data-id="${terminalId}"]`),
    ).toHaveCount(0, { timeout: 20000 });

    const embeddedTerminalHost = page.locator(
      `.react-flow__node[data-id="${codeSectionId}"] [data-attached-terminal-section-id="${terminalId}"]`,
    );
    await expect(embeddedTerminalHost).toBeVisible();
    await waitForTerminalReady(page, terminalId, {
      timeoutMs: process.env.CI ? 60000 : 40000,
    });
    await waitForTerminalOutputToStabilize(page, terminalId, {
      timeoutMs: 20000,
      stableMs: 750,
    });

    const marker = `WRAP_MARKER_${Date.now()}`;
    const longLine = `${marker}_${"x".repeat(160)}`;
    await focusTerminalAndType(
      page,
      terminalId,
      `printf '%s\\n%s\\n' '${marker}' '${longLine}'`,
    );
    await waitForTerminalOutputMarker(page, terminalId, marker, 20000);

    await setSectionSize(page, codeSectionId, { width: 320, height: 480 });

    await expect(embeddedTerminalHost).toBeVisible();
    await syncEmbeddedTerminalSectionSize(
      page,
      terminalId,
      embeddedTerminalHost,
    );

    await waitForTerminalOutputToStabilize(page, terminalId, {
      timeoutMs: 20000,
      stableMs: 750,
    });
    const beforeOutput = await getTerminalOutputBuffer(page, terminalId);
    const beforeMarkerCount = countOccurrences(beforeOutput, marker);
    const beforeLongLineCount = countOccurrences(beforeOutput, longLine);
    expect(beforeMarkerCount).toBeGreaterThan(0);
    expect(beforeLongLineCount).toBeGreaterThan(0);

    const codeBox = await page
      .locator(`.react-flow__node[data-id="${codeSectionId}"]`)
      .boundingBox();

    if (!codeBox) {
      throw new Error("Missing bounding boxes for drag.");
    }

    await postBackend(page, "/moveSections", {
      projectConfigId,
      sectionIds: [terminalId],
      newParentId: null,
      newIndex: null,
      positionsById: {
        [terminalId]: {
          x: Math.round(codeBox.x + codeBox.width + 200),
          y: Math.round(codeBox.y),
        },
      },
    });

    const terminalNode = page.locator(
      `.react-flow__node[data-id="${terminalId}"]`,
    );
    await expect(terminalNode).toBeVisible();

    // Give the detach move a chance to emit any terminal traffic it would
    // produce (we still expect it to be minimal).
    await waitForTerminalOutputToStabilize(page, terminalId, {
      timeoutMs: 10000,
      stableMs: 750,
    });
    const afterOutput = await getTerminalOutputBuffer(page, terminalId);
    expect(countOccurrences(afterOutput, marker)).toBe(beforeMarkerCount);
    expect(countOccurrences(afterOutput, longLine)).toBe(beforeLongLineCount);
  } finally {
    await deleteProjectConfigById(page, projectConfigId);
  }
});

test("detached terminal accepts input", async ({ page }) => {
  test.setTimeout(process.env.CI ? 120000 : 90000);
  await addTerminalOutputInstrumentation(page);
  await ensureAppReady(page);

  const { projectConfigId, projectConfigName } =
    await createNewProjectConfig(page);

  try {
    const codeSectionId = await createCodeSection(page);
    await resetViewport(page);

    const terminalId = await createTerminalSection(page);
    await postBackend(page, "/moveSections", {
      projectConfigId,
      sectionIds: [terminalId],
      newParentId: codeSectionId,
      newIndex: 0,
      positionsById: null,
    });
    const attachedId = await waitForAttachedTerminalId(
      page,
      projectConfigName,
      codeSectionId,
    );
    expect(attachedId).toBe(terminalId);

    const embeddedTerminalHost = page.locator(
      `.react-flow__node[data-id="${codeSectionId}"] [data-attached-terminal-section-id="${terminalId}"]`,
    );
    await expect(embeddedTerminalHost).toBeVisible();
    await waitForTerminalReady(page, terminalId, {
      timeoutMs: process.env.CI ? 60000 : 40000,
    });
    await waitForTerminalOutputToStabilize(page, terminalId, {
      timeoutMs: 20000,
      stableMs: 750,
    });

    const codeBox = await page
      .locator(`.react-flow__node[data-id="${codeSectionId}"]`)
      .boundingBox();
    if (!codeBox) {
      throw new Error("Missing bounding boxes for drag.");
    }

    await postBackend(page, "/moveSections", {
      projectConfigId,
      sectionIds: [terminalId],
      newParentId: null,
      newIndex: null,
      positionsById: {
        [terminalId]: {
          x: Math.round(codeBox.x + codeBox.width + 200),
          y: Math.round(codeBox.y),
        },
      },
    });

    const terminalNode = page.locator(
      `.react-flow__node[data-id="${terminalId}"]`,
    );
    await expect(terminalNode).toBeVisible();
    await expect(
      terminalNode.locator(`section[data-section-id="${terminalId}"]`),
    ).toBeVisible();
    await expect(terminalNode.locator("header.section-title")).toBeVisible();
    await expectDetachedTerminalHeaderLayout(page, terminalId);

    const inputMarker = `DETACH_ECHO_${Date.now()}`;
    await ensureTerminalAcceptsInput(page, terminalId, inputMarker, {
      timeoutMs: process.env.CI ? 60000 : 30000,
    });
  } finally {
    await deleteProjectConfigById(page, projectConfigId);
  }
});

test("terminal reflows long lines when width increases", async ({ page }) => {
  test.setTimeout(process.env.CI ? 120000 : 90000);
  await addTerminalOutputInstrumentation(page);
  await addTerminalResizeInstrumentation(page);
  await ensureAppReady(page);

  const { projectConfigId, projectConfigName } =
    await createNewProjectConfig(page);

  try {
    const codeSectionId = await createCodeSection(page);
    await resetViewport(page);

    const terminalId = await createTerminalSection(page);
    await postBackend(page, "/moveSections", {
      projectConfigId,
      sectionIds: [terminalId],
      newParentId: codeSectionId,
      newIndex: 0,
      positionsById: null,
    });
    const attachedId = await waitForAttachedTerminalId(
      page,
      projectConfigName,
      codeSectionId,
    );
    expect(attachedId).toBe(terminalId);

    const embeddedTerminalHost = page.locator(
      `.react-flow__node[data-id="${codeSectionId}"] [data-attached-terminal-section-id="${terminalId}"]`,
    );
    await expect(embeddedTerminalHost).toBeVisible();
    await waitForTerminalReady(page, terminalId, {
      timeoutMs: process.env.CI ? 60000 : 40000,
    });
    await embeddedTerminalHost
      .locator(".xterm-helper-textarea, .xterm textarea")
      .first()
      .waitFor({ state: "attached", timeout: 20000 });
    await embeddedTerminalHost
      .locator(".xterm-rows > div")
      .first()
      .waitFor({ state: "attached", timeout: 20000 });

    await page.evaluate(() => {
      window.__terminalResizeCountsBySectionId = {};
      window.__terminalResizePhase = "idle";
    });

    await setSectionSize(page, codeSectionId, { width: 300, height: 480 });
    await syncEmbeddedTerminalSectionSize(
      page,
      terminalId,
      embeddedTerminalHost,
    );
    await expect
      .poll(async () => {
        return await page.evaluate((id) => {
          const counts = window.__terminalResizeCountsBySectionId?.[id];
          if (!counts) {
            return 0;
          }
          return (counts.drag ?? 0) + (counts.post ?? 0) + (counts.idle ?? 0);
        }, terminalId);
      })
      .toBeGreaterThan(0);
    await waitForTerminalResizeCountsToStabilize(page, terminalId, {
      timeoutMs: 20000,
      stableMs: 750,
    });
    await waitForTerminalOutputToStabilize(page, terminalId, {
      timeoutMs: 20000,
      stableMs: 750,
    });

    const narrowResize = await getTerminalLastResize(page, terminalId);
    if (!narrowResize) {
      throw new Error(
        `Missing terminalResize payload for ${terminalId} after narrow sizing.`,
      );
    }
    const narrowCols = narrowResize.cols;
    if (!Number.isFinite(narrowCols) || narrowCols <= 0) {
      throw new Error(
        `Invalid narrow terminal cols observed for ${terminalId}: ${String(narrowCols)}`,
      );
    }

    // Keep output minimal so the wrapped line stays in view during row sampling.
    await focusTerminalAndType(page, terminalId, "clear");
    await waitForTerminalOutputToStabilize(page, terminalId, {
      timeoutMs: 20000,
      stableMs: 750,
    });

    const marker = `REFLOW_MARKER_${Date.now()}`;
    // Pick a line length that is guaranteed to wrap in the narrow terminal and
    // then unwrap (fewer rows) when the terminal widens by at least 1 column.
    const desiredLength = 3 * narrowCols + 1;
    const xCount = Math.max(60, desiredLength - (marker.length + 1));
    await focusTerminalAndType(
      page,
      terminalId,
      `python -c "m='${marker}'; print(m, flush=True); print(m + '_' + 'x'*${xCount}, flush=True)"`,
    );
    await waitForTerminalOutputMarker(page, terminalId, `${marker}_`, 20000);

    await expect
      .poll(async () => {
        const rows = await getTerminalRowsSnapshot(page, terminalId);
        return countLongLineWrapRows(rows, marker);
      })
      .toBeGreaterThan(3);
    const narrowRowCount = countLongLineWrapRows(
      await getTerminalRowsSnapshot(page, terminalId),
      marker,
    );
    expect(narrowRowCount).toBeGreaterThan(3);

    const resizeCountBeforeWide = await page.evaluate((id) => {
      const counts = window.__terminalResizeCountsBySectionId?.[id];
      if (!counts) {
        return 0;
      }
      return (counts.drag ?? 0) + (counts.post ?? 0) + (counts.idle ?? 0);
    }, terminalId);

    await setSectionSize(page, codeSectionId, { width: 960, height: 480 });
    await syncEmbeddedTerminalSectionSize(
      page,
      terminalId,
      embeddedTerminalHost,
    );
    await expect
      .poll(async () => {
        return await page.evaluate((id) => {
          const counts = window.__terminalResizeCountsBySectionId?.[id];
          if (!counts) {
            return 0;
          }
          return (counts.drag ?? 0) + (counts.post ?? 0) + (counts.idle ?? 0);
        }, terminalId);
      })
      .toBeGreaterThan(resizeCountBeforeWide);
    await waitForTerminalResizeCountsToStabilize(page, terminalId, {
      timeoutMs: 20000,
      stableMs: 750,
    });
    await waitForTerminalOutputToStabilize(page, terminalId, {
      timeoutMs: 20000,
      stableMs: 750,
    });

    const wideResize = await getTerminalLastResize(page, terminalId);
    if (!wideResize) {
      throw new Error(
        `Missing terminalResize payload for ${terminalId} after wide sizing.`,
      );
    }
    if (wideResize.cols <= narrowCols) {
      throw new Error(
        `Expected terminal cols to increase after widening: narrow=${narrowCols} wide=${wideResize.cols}`,
      );
    }

    try {
      await expect
        .poll(
          async () => {
            const rows = await getTerminalRowsSnapshot(page, terminalId);
            return countLongLineWrapRows(rows, marker);
          },
          { timeout: process.env.CI ? 30000 : 15000 },
        )
        .toBeLessThan(narrowRowCount);
    } catch (err) {
      const rows = await getTerminalRowsSnapshot(page, terminalId);
      const relevant = rows.slice(-60).join("\n");
      throw new Error(
        `Long line reflow assertion failed.\n\nTerminal rows tail:\n${relevant}\n\nOriginal error: ${String(err)}`,
      );
    }
    // Wrapping should reduce when the terminal grows wider.
  } finally {
    await deleteProjectConfigById(page, projectConfigId);
  }
});

test("terminal reflows command echo when width increases", async ({ page }) => {
  test.setTimeout(process.env.CI ? 120000 : 90000);
  await addTerminalOutputInstrumentation(page);
  await addTerminalResizeInstrumentation(page);
  await ensureAppReady(page);

  const { projectConfigId, projectConfigName } =
    await createNewProjectConfig(page);

  try {
    const codeSectionId = await createCodeSection(page);
    await resetViewport(page);

    // This test needs a stable interactive shell prompt. Running a code block
    // injects a command into the PTY and can leave the terminal busy, which
    // makes subsequent `echo`/`stty`/`python -c` steps flaky. Attach a fresh
    // terminal section instead.
    const terminalId = await createTerminalSection(page);
    await postBackend(page, "/moveSections", {
      projectConfigId,
      sectionIds: [terminalId],
      newParentId: codeSectionId,
      newIndex: 0,
      positionsById: null,
    });
    const attachedId = await waitForAttachedTerminalId(
      page,
      projectConfigName,
      codeSectionId,
    );
    expect(attachedId).toBe(terminalId);

    const embeddedTerminalHost = page.locator(
      `.react-flow__node[data-id="${codeSectionId}"] [data-attached-terminal-section-id="${terminalId}"]`,
    );
    await expect(embeddedTerminalHost).toBeVisible();
    await waitForTerminalReady(page, terminalId, {
      timeoutMs: process.env.CI ? 60000 : 40000,
    });
    await waitForTerminalOutputToStabilize(page, terminalId, {
      timeoutMs: 20000,
      stableMs: 750,
    });

    await page.evaluate(() => {
      window.__terminalResizeCountsBySectionId = {};
      window.__terminalResizePhase = "idle";
    });

    await setSectionSize(page, codeSectionId, { width: 300, height: 480 });
    await syncEmbeddedTerminalSectionSize(
      page,
      terminalId,
      embeddedTerminalHost,
    );
    await expect
      .poll(async () => {
        return await page.evaluate((id) => {
          const counts = window.__terminalResizeCountsBySectionId?.[id];
          if (!counts) {
            return 0;
          }
          return (counts.drag ?? 0) + (counts.post ?? 0) + (counts.idle ?? 0);
        }, terminalId);
      })
      .toBeGreaterThan(0);
    await waitForTerminalOutputToStabilize(page, terminalId, {
      timeoutMs: 20000,
      stableMs: 750,
    });

    // Confirm the shell is at a prompt and accepting input before we type the
    // long wrapped command line. Otherwise the run output/prompt redraw can
    // race with our keystrokes and corrupt the echo.
    const readyMarker = `CMDREFLOW_READY_${Date.now()}`;
    await focusTerminalAndType(page, terminalId, `echo ${readyMarker}`);
    await waitForTerminalOutputMarker(page, terminalId, readyMarker, 20000);
    await waitForTerminalOutputToStabilize(page, terminalId, {
      timeoutMs: 20000,
      stableMs: 750,
    });

    // Make the viewport deterministic. The code-run startup chatter can leave
    // little vertical room for the wrapped echo line, causing most of it to
    // scroll out of view (and making row counting flaky).
    await focusTerminalAndType(page, terminalId, "clear");
    await waitForTerminalOutputToStabilize(page, terminalId, {
      timeoutMs: 20000,
      stableMs: 750,
    });

    const sttyMarker = `CMDREFLOW_STTY_${Date.now()}`;
    await focusTerminalAndType(
      page,
      terminalId,
      `echo ${sttyMarker} $(stty size)`,
    );
    await waitForTerminalOutputMarker(page, terminalId, sttyMarker, 20000);
    const sttyOutput = await getTerminalOutputBuffer(page, terminalId);
    const sttyMatch = sttyOutput.match(
      new RegExp(`${sttyMarker}\\s+(\\d+)\\s+(\\d+)`),
    );
    if (!sttyMatch) {
      throw new Error(`Failed to parse stty output for ${sttyMarker}.`);
    }
    const cols = Number(sttyMatch[2]);
    if (!Number.isFinite(cols) || cols <= 0) {
      throw new Error(`Invalid stty cols parsed: ${sttyMatch[2]}`);
    }

    // Simulate zsh/ZLE-style "hard wrapped" lines: full-width rows separated by
    // newlines (not marked `isWrapped` by xterm), which normally won't reflow on
    // widen. Our frontend widens by marking these as wrapped right before
    // resizing, so xterm can reflow them.
    await focusTerminalAndType(
      page,
      terminalId,
      `python -c \"print('x'*${cols}); print('x'*${cols}); print('x'*${cols}); print('x'*${cols}); print('x'*${cols}); print('x'*${cols})\"`,
    );
    await waitForTerminalOutputToStabilize(page, terminalId, {
      timeoutMs: 20000,
      stableMs: 750,
    });

    await expect
      .poll(async () => {
        const rows = await getTerminalRowsSnapshot(page, terminalId);
        return countLongLineRows(rows, sttyMarker);
      })
      .toBeGreaterThan(1);
    const narrowRowCount = countLongLineRows(
      await getTerminalRowsSnapshot(page, terminalId),
      sttyMarker,
    );
    expect(narrowRowCount).toBeGreaterThan(1);

    const resizeCountBeforeWide = await page.evaluate((id) => {
      const counts = window.__terminalResizeCountsBySectionId?.[id];
      if (!counts) {
        return 0;
      }
      return (counts.drag ?? 0) + (counts.post ?? 0) + (counts.idle ?? 0);
    }, terminalId);

    await setSectionSize(page, codeSectionId, { width: 640, height: 480 });
    await syncEmbeddedTerminalSectionSize(
      page,
      terminalId,
      embeddedTerminalHost,
    );
    await expect
      .poll(async () => {
        return await page.evaluate((id) => {
          const counts = window.__terminalResizeCountsBySectionId?.[id];
          if (!counts) {
            return 0;
          }
          return (counts.drag ?? 0) + (counts.post ?? 0) + (counts.idle ?? 0);
        }, terminalId);
      })
      .toBeGreaterThan(resizeCountBeforeWide);
    await waitForTerminalOutputToStabilize(page, terminalId, {
      timeoutMs: 20000,
      stableMs: 750,
    });

    try {
      await expect
        .poll(async () => {
          const rows = await getTerminalRowsSnapshot(page, terminalId);
          return countLongLineRows(rows, sttyMarker);
        })
        .toBeLessThan(narrowRowCount);
    } catch (err) {
      const rows = await getTerminalRowsSnapshot(page, terminalId);
      const relevant = rows.slice(-60).join("\n");
      throw new Error(
        `Command echo reflow assertion failed.\n\nTerminal rows tail:\n${relevant}\n\nOriginal error: ${String(err)}`,
      );
    }
  } finally {
    await deleteProjectConfigById(page, projectConfigId);
  }
});

test("attached terminal text reflows when width increases", async ({
  page,
}) => {
  test.setTimeout(process.env.CI ? 120000 : 90000);
  await addTerminalOutputInstrumentation(page);
  await addTerminalResizeInstrumentation(page);
  await ensureAppReady(page);

  const { projectConfigId, projectConfigName } =
    await createNewProjectConfig(page);

  try {
    const codeSectionId = await createCodeSection(page);
    const terminalId = await createTerminalSection(page);

    await postBackend(page, "/setCodeSectionAttachedTerminal", {
      projectConfigId,
      sectionId: codeSectionId,
      terminalSectionId: terminalId,
    });
    const attachedId = await waitForAttachedTerminalId(
      page,
      projectConfigName,
      codeSectionId,
    );
    expect(attachedId).toBe(terminalId);
    const embeddedTerminalHost = page.locator(
      `.react-flow__node[data-id="${codeSectionId}"] [data-attached-terminal-section-id="${terminalId}"]`,
    );
    await expect(embeddedTerminalHost).toBeVisible();

    await waitForTerminalReady(page, terminalId, {
      required: !process.env.CI,
      timeoutMs: process.env.CI ? 5000 : 20000,
    });

    // Reset counters so we only measure the explicit narrow->wide resize flow.
    await page.evaluate(() => {
      window.__terminalResizeCountsBySectionId = {};
      window.__terminalLastResizeBySectionId = {};
      window.__terminalResizePhase = "idle";
    });

    await setSectionSize(page, terminalId, { width: 320, height: 420 });
    await expect
      .poll(async () => {
        const box = await embeddedTerminalHost.boundingBox();
        return box ? box.width : 0;
      })
      .toBeGreaterThan(220);
    await expect
      .poll(async () => {
        return await page.evaluate((id) => {
          const counts = window.__terminalResizeCountsBySectionId?.[id];
          if (!counts) {
            return 0;
          }
          return (counts.drag ?? 0) + (counts.post ?? 0) + (counts.idle ?? 0);
        }, terminalId);
      })
      .toBeGreaterThan(0);
    await waitForTerminalResizeCountsToStabilize(page, terminalId, {
      timeoutMs: 20000,
      stableMs: 750,
    });

    const narrowResize = await getTerminalLastResize(page, terminalId);
    if (!narrowResize) {
      throw new Error(
        `Missing terminalResize payload for ${terminalId} after narrow sizing.`,
      );
    }
    const narrowCols = narrowResize.cols;
    if (!Number.isFinite(narrowCols) || narrowCols <= 0) {
      throw new Error(
        `Invalid narrow terminal cols observed for ${terminalId}: ${String(narrowCols)}`,
      );
    }

    // Write a long line that should unwrap into fewer rows after widening.
    const marker = `ATTACHED_REFLOW_${Date.now()}`;
    const xCount = Math.max(120, 3 * narrowCols);
    await focusTerminalAndType(
      page,
      terminalId,
      `python -c "m='${marker}'; print(m, flush=True); print(m + '_' + 'x'*${xCount}, flush=True)"`,
    );
    await waitForTerminalOutputMarker(page, terminalId, `${marker}_`, 20000);

    await expect
      .poll(async () => {
        const rows = await getTerminalRowsSnapshot(page, terminalId);
        return countLongLineWrapRows(rows, marker);
      })
      .toBeGreaterThan(3);
    const narrowRowCount = countLongLineWrapRows(
      await getTerminalRowsSnapshot(page, terminalId),
      marker,
    );
    expect(narrowRowCount).toBeGreaterThan(3);

    const resizeCountBeforeWide = await page.evaluate((id) => {
      const counts = window.__terminalResizeCountsBySectionId?.[id];
      if (!counts) {
        return 0;
      }
      return (counts.drag ?? 0) + (counts.post ?? 0) + (counts.idle ?? 0);
    }, terminalId);

    await setSectionSize(page, terminalId, { width: 920, height: 420 });
    await expect
      .poll(async () => {
        const box = await embeddedTerminalHost.boundingBox();
        return box ? box.width : 0;
      })
      .toBeGreaterThan(600);
    await expect
      .poll(async () => {
        return await page.evaluate((id) => {
          const counts = window.__terminalResizeCountsBySectionId?.[id];
          if (!counts) {
            return 0;
          }
          return (counts.drag ?? 0) + (counts.post ?? 0) + (counts.idle ?? 0);
        }, terminalId);
      })
      .toBeGreaterThan(resizeCountBeforeWide);
    await waitForTerminalResizeCountsToStabilize(page, terminalId, {
      timeoutMs: 20000,
      stableMs: 750,
    });

    const wideResize = await getTerminalLastResize(page, terminalId);
    if (!wideResize) {
      throw new Error(
        `Missing terminalResize payload for ${terminalId} after wide sizing.`,
      );
    }
    if (wideResize.cols <= narrowCols) {
      throw new Error(
        `Expected terminal cols to increase after widening: narrow=${narrowCols} wide=${wideResize.cols}`,
      );
    }

    await expect
      .poll(async () => {
        const rows = await getTerminalRowsSnapshot(page, terminalId);
        return countLongLineWrapRows(rows, marker);
      })
      .toBeLessThan(narrowRowCount);
  } finally {
    await deleteProjectConfigById(page, projectConfigId);
  }
});

test("detached terminal text reflows when width increases", async ({
  page,
}) => {
  test.setTimeout(process.env.CI ? 120000 : 90000);
  await addTerminalOutputInstrumentation(page);
  await addTerminalResizeInstrumentation(page);
  await ensureAppReady(page);

  const { projectConfigId } = await createNewProjectConfig(page);

  try {
    const terminalId = await createTerminalSection(page);
    await waitForTerminalReady(page, terminalId, {
      required: !process.env.CI,
      timeoutMs: process.env.CI ? 5000 : 20000,
    });

    await page.evaluate(() => {
      window.__terminalResizeCountsBySectionId = {};
      window.__terminalLastResizeBySectionId = {};
      window.__terminalResizePhase = "idle";
    });

    await setSectionSize(page, terminalId, { width: 320, height: 420 });
    await expect
      .poll(async () => {
        return await page.evaluate((id) => {
          const counts = window.__terminalResizeCountsBySectionId?.[id];
          if (!counts) {
            return 0;
          }
          return (counts.drag ?? 0) + (counts.post ?? 0) + (counts.idle ?? 0);
        }, terminalId);
      })
      .toBeGreaterThan(0);
    await waitForTerminalResizeCountsToStabilize(page, terminalId, {
      timeoutMs: 20000,
      stableMs: 750,
    });

    const narrowResize = await getTerminalLastResize(page, terminalId);
    if (!narrowResize) {
      throw new Error(
        `Missing terminalResize payload for ${terminalId} after narrow sizing.`,
      );
    }
    const narrowCols = narrowResize.cols;
    if (!Number.isFinite(narrowCols) || narrowCols <= 0) {
      throw new Error(
        `Invalid narrow terminal cols observed for ${terminalId}: ${String(narrowCols)}`,
      );
    }

    const marker = `DETACHED_REFLOW_${Date.now()}`;
    const xCount = Math.max(120, 3 * narrowCols);
    await focusTerminalAndType(
      page,
      terminalId,
      `python -c "m='${marker}'; print(m, flush=True); print(m + '_' + 'x'*${xCount}, flush=True)"`,
    );
    await waitForTerminalOutputMarker(page, terminalId, `${marker}_`, 20000);

    await expect
      .poll(async () => {
        const rows = await getTerminalRowsSnapshot(page, terminalId);
        return countLongLineWrapRows(rows, marker);
      })
      .toBeGreaterThan(3);
    const narrowRowCount = countLongLineWrapRows(
      await getTerminalRowsSnapshot(page, terminalId),
      marker,
    );
    expect(narrowRowCount).toBeGreaterThan(3);

    await setSectionSize(page, terminalId, { width: 920, height: 420 });
    await waitForTerminalResizeCountsToStabilize(page, terminalId, {
      timeoutMs: 20000,
      stableMs: 750,
    });

    const wideResize = await getTerminalLastResize(page, terminalId);
    if (!wideResize) {
      throw new Error(
        `Missing terminalResize payload for ${terminalId} after wide sizing.`,
      );
    }
    if (wideResize.cols <= narrowCols) {
      throw new Error(
        `Expected terminal cols to increase after widening: narrow=${narrowCols} wide=${wideResize.cols}`,
      );
    }

    await expect
      .poll(async () => {
        const rows = await getTerminalRowsSnapshot(page, terminalId);
        return countLongLineWrapRows(rows, marker);
      })
      .toBeLessThan(narrowRowCount);
  } finally {
    await deleteProjectConfigById(page, projectConfigId);
  }
});

test("attaching a narrow terminal to a wider code section expands terminal cols", async ({
  page,
}) => {
  test.setTimeout(process.env.CI ? 120000 : 90000);
  await addTerminalOutputInstrumentation(page);
  await addTerminalResizeInstrumentation(page);
  await ensureAppReady(page);

  const { projectConfigId, projectConfigName } =
    await createNewProjectConfig(page);

  try {
    const codeSectionId = await createCodeSection(page);
    const terminalId = await createTerminalSection(page);
    await waitForTerminalReady(page, terminalId, {
      required: !process.env.CI,
      timeoutMs: process.env.CI ? 5000 : 20000,
    });

    // Establish a narrow detached baseline first.
    await setSectionSize(page, terminalId, { width: 320, height: 420 });
    await expect
      .poll(async () => {
        return await page.evaluate((id) => {
          const counts = window.__terminalResizeCountsBySectionId?.[id];
          if (!counts) {
            return 0;
          }
          return (counts.drag ?? 0) + (counts.post ?? 0) + (counts.idle ?? 0);
        }, terminalId);
      })
      .toBeGreaterThan(0);
    await waitForTerminalResizeCountsToStabilize(page, terminalId, {
      timeoutMs: 20000,
      stableMs: 750,
    });
    const narrowResize = await getTerminalLastResize(page, terminalId);
    if (!narrowResize) {
      throw new Error(
        `Missing terminalResize payload for ${terminalId} before attach.`,
      );
    }
    const narrowCols = narrowResize.cols;

    // Attach to a wider code section and verify cols increase after embed.
    await setSectionSize(page, codeSectionId, { width: 920, height: 520 });
    await postBackend(page, "/setCodeSectionAttachedTerminal", {
      projectConfigId,
      sectionId: codeSectionId,
      terminalSectionId: terminalId,
    });

    const attachedId = await waitForAttachedTerminalId(
      page,
      projectConfigName,
      codeSectionId,
    );
    expect(attachedId).toBe(terminalId);
    const embeddedTerminalHost = page.locator(
      `.react-flow__node[data-id="${codeSectionId}"] [data-attached-terminal-section-id="${terminalId}"]`,
    );
    await expect(embeddedTerminalHost).toBeVisible();

    await expect
      .poll(async () => {
        const resize = await getTerminalLastResize(page, terminalId);
        return resize?.cols ?? 0;
      })
      .toBeGreaterThan(narrowCols);
    const wideResize = await getTerminalLastResize(page, terminalId);
    if (!wideResize || wideResize.cols <= narrowCols) {
      const wideCols = wideResize ? wideResize.cols : "none";
      throw new Error(
        `Expected terminal cols to increase after attach: narrow=${narrowCols} wide=${wideCols}`,
      );
    }
  } finally {
    await deleteProjectConfigById(page, projectConfigId);
  }
});

test("terminal created as attached reflows while attached and after detach", async ({
  page,
}) => {
  test.setTimeout(process.env.CI ? 120000 : 90000);
  await addTerminalOutputInstrumentation(page);
  await addTerminalResizeInstrumentation(page);
  await ensureAppReady(page);

  const { projectConfigId, projectConfigName } =
    await createNewProjectConfig(page);

  try {
    const codeSectionId = await createCodeSection(page);
    const codeNode = page.locator(
      `.react-flow__node[data-id="${codeSectionId}"]`,
    );
    const toggleButton = codeNode.locator("[data-attached-terminal-toggle]");
    await expect(toggleButton).toHaveCount(1);
    await toggleButton.click({ force: true });

    const terminalId = await waitForAttachedTerminalId(
      page,
      projectConfigName,
      codeSectionId,
    );
    const embeddedTerminalHost = page.locator(
      `.react-flow__node[data-id="${codeSectionId}"] [data-attached-terminal-section-id="${terminalId}"]`,
    );
    await expect(embeddedTerminalHost).toBeVisible();
    await waitForTerminalReady(page, terminalId, {
      required: !process.env.CI,
      timeoutMs: process.env.CI ? 5000 : 20000,
    });

    await expect
      .poll(async () => {
        const state = await loadProjectState(page, projectConfigName);
        const terminalImpl = resolveSectionImpl(state, terminalId);
        return terminalImpl?.size?.height ?? "missing";
      })
      .not.toBe("auto");

    await page.evaluate(() => {
      window.__terminalResizeCountsBySectionId = {};
      window.__terminalLastResizeBySectionId = {};
      window.__terminalResizePhase = "idle";
    });

    await setSectionSize(page, terminalId, { width: 320, height: 420 });
    await expect
      .poll(async () => {
        const resize = await getTerminalLastResize(page, terminalId);
        return resize?.cols ?? 0;
      })
      .toBeGreaterThan(0);
    await waitForTerminalResizeCountsToStabilize(page, terminalId, {
      timeoutMs: 20000,
      stableMs: 750,
    });
    const narrowAttachedResize = await getTerminalLastResize(page, terminalId);
    if (!narrowAttachedResize) {
      throw new Error(
        `Missing terminalResize payload for ${terminalId} in attached narrow state.`,
      );
    }

    const attachedMarker = `ATTACHED_INIT_REFLOW_${Date.now()}`;
    const attachedXCount = Math.max(120, 3 * narrowAttachedResize.cols);
    await focusTerminalAndType(
      page,
      terminalId,
      `python -c "m='${attachedMarker}'; print(m, flush=True); print(m + '_' + 'x'*${attachedXCount}, flush=True)"`,
    );
    await waitForTerminalOutputMarker(
      page,
      terminalId,
      `${attachedMarker}_`,
      20000,
    );
    const attachedNarrowRows = countLongLineWrapRows(
      await getTerminalRowsSnapshot(page, terminalId),
      attachedMarker,
    );
    expect(attachedNarrowRows).toBeGreaterThan(3);

    await setSectionSize(page, terminalId, { width: 920, height: 420 });
    await expect
      .poll(async () => {
        const resize = await getTerminalLastResize(page, terminalId);
        return resize?.cols ?? 0;
      })
      .toBeGreaterThan(narrowAttachedResize.cols);
    await expect
      .poll(async () => {
        const rows = await getTerminalRowsSnapshot(page, terminalId);
        return countLongLineWrapRows(rows, attachedMarker);
      })
      .toBeLessThan(attachedNarrowRows);

    const codeBox = await codeNode.boundingBox();
    if (!codeBox) {
      throw new Error("Missing code section bounding box for detach move.");
    }
    await postBackend(page, "/moveSections", {
      projectConfigId,
      sectionIds: [terminalId],
      newParentId: null,
      newIndex: null,
      positionsById: {
        [terminalId]: {
          x: Math.round(codeBox.x + codeBox.width + 200),
          y: Math.round(codeBox.y),
        },
      },
    });
    const detachedTerminalNode = page.locator(
      `.react-flow__node[data-id="${terminalId}"]`,
    );
    await expect(detachedTerminalNode).toBeVisible();
    await expect(
      detachedTerminalNode.locator(`section[data-section-id="${terminalId}"]`),
    ).toBeVisible();
    await expect(
      detachedTerminalNode.locator("header.section-title"),
    ).toBeVisible();
    await expectDetachedTerminalHeaderLayout(page, terminalId);

    await setSectionSize(page, terminalId, { width: 340, height: 420 });
    await expect
      .poll(async () => {
        const resize = await getTerminalLastResize(page, terminalId);
        return resize?.cols ?? 0;
      })
      .toBeGreaterThan(0);
    await waitForTerminalResizeCountsToStabilize(page, terminalId, {
      timeoutMs: 20000,
      stableMs: 750,
    });
    const narrowDetachedResize = await getTerminalLastResize(page, terminalId);
    if (!narrowDetachedResize) {
      throw new Error(
        `Missing terminalResize payload for ${terminalId} in detached narrow state.`,
      );
    }

    const detachedMarker = `DETACHED_AFTER_ATTACH_INIT_${Date.now()}`;
    const detachedXCount = Math.max(120, 3 * narrowDetachedResize.cols);
    await focusTerminalAndType(
      page,
      terminalId,
      `python -c "m='${detachedMarker}'; print(m, flush=True); print(m + '_' + 'x'*${detachedXCount}, flush=True)"`,
    );
    await waitForTerminalOutputMarker(
      page,
      terminalId,
      `${detachedMarker}_`,
      20000,
    );
    const detachedNarrowRows = countLongLineWrapRows(
      await getTerminalRowsSnapshot(page, terminalId),
      detachedMarker,
    );
    expect(detachedNarrowRows).toBeGreaterThan(3);

    await setSectionSize(page, terminalId, { width: 940, height: 420 });
    await expect
      .poll(async () => {
        const resize = await getTerminalLastResize(page, terminalId);
        return resize?.cols ?? 0;
      })
      .toBeGreaterThan(narrowDetachedResize.cols);
    await expect
      .poll(async () => {
        const rows = await getTerminalRowsSnapshot(page, terminalId);
        return countLongLineWrapRows(rows, detachedMarker);
      })
      .toBeLessThan(detachedNarrowRows);
  } finally {
    await deleteProjectConfigById(page, projectConfigId);
  }
});

test("terminal resize messages are throttled during drag detach", async ({
  page,
}) => {
  test.setTimeout(process.env.CI ? 120000 : 90000);
  await addTerminalOutputInstrumentation(page);
  await addTerminalResizeInstrumentation(page);
  await ensureAppReady(page);

  const { projectConfigId, projectConfigName } =
    await createNewProjectConfig(page);
  let dragStarted = false;
  let altPressed = false;

  try {
    const codeSectionId = await createCodeSection(page);

    const terminalId = await createTerminalSection(page);
    await postBackend(page, "/moveSections", {
      projectConfigId,
      sectionIds: [terminalId],
      newParentId: codeSectionId,
      newIndex: 0,
      positionsById: null,
    });
    const attachedId = await waitForAttachedTerminalId(
      page,
      projectConfigName,
      codeSectionId,
    );
    expect(attachedId).toBe(terminalId);

    const embeddedTerminalHost = page.locator(
      `.react-flow__node[data-id="${codeSectionId}"] [data-attached-terminal-section-id="${terminalId}"]`,
    );
    await expect(embeddedTerminalHost).toBeVisible();
    await waitForTerminalReady(page, terminalId, {
      timeoutMs: process.env.CI ? 60000 : 40000,
    });
    await embeddedTerminalHost
      .locator(".xterm-helper-textarea, .xterm textarea")
      .first()
      .waitFor({ state: "attached", timeout: 20000 });

    await waitForTerminalOutputToStabilize(page, terminalId, {
      timeoutMs: 20000,
      stableMs: 750,
    });
    const marker = `RESIZE_MARKER_${Date.now()}`;
    const longLine = `${marker}_${"x".repeat(160)}`;
    await focusTerminalAndType(
      page,
      terminalId,
      `printf '%s\\n%s\\n' '${marker}' '${longLine}'`,
    );
    await waitForTerminalOutputMarker(page, terminalId, marker, 20000);
    await waitForTerminalOutputToStabilize(page, terminalId, {
      timeoutMs: 20000,
      stableMs: 750,
    });

    await setSectionSize(page, codeSectionId, { width: 320, height: 480 });
    await syncEmbeddedTerminalSectionSize(
      page,
      terminalId,
      embeddedTerminalHost,
    );
    await page.waitForTimeout(200);

    await waitForTerminalResizeCountsToStabilize(page, terminalId, {
      timeoutMs: 10000,
      stableMs: 500,
    });
    await page.evaluate(() => {
      window.__terminalResizeCountsBySectionId = {};
      window.__terminalResizePhase = "idle";
    });

    await expect(embeddedTerminalHost).toBeVisible();
    const embeddedTerminal = embeddedTerminalHost.locator(
      "xpath=ancestor::section[1]",
    );
    await expect(embeddedTerminal).toBeVisible();
    const terminalBox = await embeddedTerminal.boundingBox();
    if (!terminalBox) {
      throw new Error("Missing embedded terminal bounding box.");
    }

    await focusPaneForDnd(page);
    await page.keyboard.down("Alt");
    altPressed = true;

    const pane = page.locator(".react-flow__pane");
    const paneBox = await pane.boundingBox();
    const codeBox = await page
      .locator(`.react-flow__node[data-id="${codeSectionId}"]`)
      .boundingBox();

    if (!paneBox || !codeBox) {
      throw new Error("Missing bounding boxes for drag.");
    }

    const { x: startX, y: startY } = getDragStartPoint(terminalBox);
    const targetX = Math.min(
      codeBox.x + codeBox.width + 320,
      paneBox.x + paneBox.width - 40,
    );
    const targetY = Math.min(codeBox.y + 40, paneBox.y + paneBox.height - 40);

    await page.evaluate(() => {
      window.__terminalResizePhase = "drag";
    });
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    dragStarted = true;
    await page.waitForTimeout(250);
    await page.mouse.move(targetX, targetY, { steps: 8 });
    await page.mouse.up();
    dragStarted = false;

    await page.evaluate(() => {
      window.__terminalResizePhase = "post";
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      window.__terminalResizePhase = "idle";
    });

    await page.keyboard.up("Alt");
    altPressed = false;

    const resizeCounts = await page.evaluate(
      () => window.__terminalResizeCountsBySectionId,
    );
    const terminalCounts = resizeCounts?.[terminalId] ?? {};
    const maxResizeMessages = process.env.CI ? 8 : 4;
    expect(terminalCounts.drag ?? 0).toBeLessThanOrEqual(maxResizeMessages);
    expect(terminalCounts.post ?? 0).toBeLessThanOrEqual(maxResizeMessages);
  } finally {
    if (dragStarted) {
      await page.mouse.up();
    }
    if (altPressed) {
      await page.keyboard.up("Alt");
    }
    await deleteProjectConfigById(page, projectConfigId);
  }
});

async function runCodeBlockInPage(
  page: Page,
  sectionId: string,
): Promise<void> {
  await page.evaluate(async (id) => {
    const { runCodeBlock } = await import("/src/state/actions/runOrImportCode");
    await runCodeBlock(id);
  }, sectionId);
}

async function setCodeForSection(
  page: Page,
  sectionId: string,
  code: string,
): Promise<void> {
  await page.evaluate(
    async ({ id, value }) => {
      const { queueCodeUpdate, flushPendingCodeUpdate } = await import(
        "/src/state/actions/codeUpdates"
      );
      queueCodeUpdate(id, value);
      await flushPendingCodeUpdate(id);
    },
    { id: sectionId, value: code },
  );
}

async function setSectionHeight(
  page: Page,
  sectionId: string,
  height: number,
): Promise<void> {
  await setSectionSize(page, sectionId, { height });
}

async function setSectionSize(
  page: Page,
  sectionId: string,
  size: { width?: number; height?: number },
): Promise<void> {
  await page.evaluate(
    async ({ id, nextSize }) => {
      const { dispatchOptimisticProjectStateUpdate, getCurrProjectConfigId } =
        await import("/src/state/actions/sectionInfos");
      const { setSelfParentSiblingChildrenWidths } = await import(
        "/src/state/actions/sections/sectionSizes"
      );
      const { route_set_section_sizes } = await import(
        "/src/utils/generatedEndpoints"
      );
      let updatedSectionSizes = {};
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
          updatedSectionSizes = setSelfParentSiblingChildrenWidths(
            id,
            nextSize,
            state,
          );
        },
        send: (frontendOpId) =>
          route_set_section_sizes({
            projectConfigId: getCurrProjectConfigId(),
            sectionSizes: updatedSectionSizes,
            frontendOpId,
          }),
      });
    },
    { id: sectionId, nextSize: size },
  );
}

async function getTerminalRowsSnapshot(
  page: Page,
  terminalId: string,
): Promise<string[]> {
  return await page.evaluate((id) => {
    const collectRows = (container: Element | null): string[] => {
      if (!container) {
        return [];
      }
      // Ensure we sample the bottom of the terminal so recently-echoed input is
      // visible even if the viewport was scrolled during attach/resize.
      const viewport = container.querySelector(".xterm-viewport");
      if (viewport instanceof HTMLElement) {
        viewport.scrollTop = viewport.scrollHeight;
      }
      const rows = container.querySelectorAll(".xterm-rows > div");
      return Array.from(rows).map((row) => row.textContent ?? "");
    };

    const candidates: Element[] = Array.from(
      document.querySelectorAll(`[data-attached-terminal-section-id="${id}"]`),
    );
    const detached = document.querySelector(
      `.react-flow__node[data-id="${id}"]`,
    );
    if (detached) {
      candidates.push(detached);
    }

    const active = document.activeElement;
    if (active instanceof Element) {
      const activeEmbedded = active.closest(
        `[data-attached-terminal-section-id="${id}"]`,
      );
      const activeDetached = active.closest(
        `.react-flow__node[data-id="${id}"]`,
      );
      const activeContainer = activeEmbedded ?? activeDetached;
      const activeRows = collectRows(activeContainer);
      if (activeRows.length > 0) {
        return activeRows;
      }
    }

    let bestRows: string[] = [];
    let bestScore = -1;
    for (const candidate of candidates) {
      const rows = collectRows(candidate);
      if (rows.length === 0) {
        continue;
      }
      const nonEmpty = rows.filter((row) => row.trim().length > 0).length;
      const joinedLength = rows.reduce((sum, row) => sum + row.length, 0);
      const inLayout =
        candidate instanceof HTMLElement &&
        candidate.getClientRects().length > 0;
      const score =
        (inLayout ? 1_000_000_000 : 0) + nonEmpty * 10_000 + joinedLength;
      if (score > bestScore) {
        bestScore = score;
        bestRows = rows;
      }
    }
    return bestRows;
  }, terminalId);
}

async function getTerminalReadyCount(
  page: Page,
  terminalId: string,
): Promise<number> {
  return await page.evaluate((id) => {
    const readyCountMap = window as typeof window & {
      __terminalReadyCountBySectionId?: Record<string, number>;
      __terminalReadyBySectionId?: Record<string, boolean>;
    };
    const readyCount = readyCountMap.__terminalReadyCountBySectionId?.[id];
    if (typeof readyCount === "number") {
      return readyCount;
    }
    return readyCountMap.__terminalReadyBySectionId?.[id] ? 1 : 0;
  }, terminalId);
}

function countLongLineRows(rows: string[], marker: string): number {
  return rows.filter((row) => {
    const trimmed = row.trim();
    if (!trimmed) {
      return false;
    }
    if (trimmed.includes(marker)) {
      return true;
    }
    if (/^x+$/.test(trimmed)) {
      return true;
    }
    // Some terminals (and zsh line editing) can produce wrap continuations that
    // include prefix characters (digits/underscores) in addition to the x-tail.
    // Count any row with a sufficiently-long x run as part of the wrapped line.
    return /x{20,}/.test(trimmed);
  }).length;
}

function countLongLineWrapRows(rows: string[], marker: string): number {
  const markerPrefix = `${marker}_`;
  return rows.filter((row) => {
    const trimmed = row.trim();
    if (!trimmed) {
      return false;
    }
    if (trimmed.includes(markerPrefix)) {
      return true;
    }
    if (/^x+$/.test(trimmed)) {
      return true;
    }
    return /x{20,}/.test(trimmed);
  }).length;
}

async function syncEmbeddedTerminalSectionSize(
  page: Page,
  terminalId: string,
  embeddedTerminalHost: Locator,
): Promise<{ width: number; height: number }> {
  const embeddedTerminal = embeddedTerminalHost.locator(
    "xpath=ancestor::section[1]",
  );
  await expect(embeddedTerminal).toBeVisible();
  const terminalBox = await embeddedTerminal.boundingBox();
  if (!terminalBox) {
    throw new Error("Missing embedded terminal bounding box.");
  }
  const size = {
    width: Math.round(terminalBox.width),
    height: Math.round(terminalBox.height),
  };
  await setSectionSize(page, terminalId, size);
  return size;
}

async function focusTerminalAndType(
  page: Page,
  terminalId: string,
  text: string,
): Promise<void> {
  const detachedTerminalNode = page.locator(
    `.react-flow__node[data-id="${terminalId}"]`,
  );
  const embeddedTerminalHost = page.locator(
    `[data-attached-terminal-section-id="${terminalId}"]`,
  );
  const embeddedCount = await embeddedTerminalHost.count();
  const detachedCount = await detachedTerminalNode.count();
  let root: Locator | null = null;
  if (embeddedCount > 0) {
    root = embeddedTerminalHost.locator("xpath=ancestor::section[1]");
  } else if (detachedCount > 0) {
    root = detachedTerminalNode;
  }
  if (!root) {
    throw new Error(`Missing terminal DOM for ${terminalId}.`);
  }

  const terminalContainer = root.locator(".xterm");
  await expect(terminalContainer).toBeVisible();
  await terminalContainer.click({ position: { x: 8, y: 8 } });
  const input = root.locator(".xterm-helper-textarea, .xterm textarea");
  await input.first().waitFor({ state: "attached", timeout: 20000 });
  await input.first().evaluate((el) => {
    if (el instanceof HTMLTextAreaElement) {
      el.focus();
      const end = el.value.length;
      el.setSelectionRange(end, end);
      return;
    }
    (el as HTMLElement).focus();
  });
  await expect
    .poll(async () => {
      return await input
        .first()
        .evaluate((el) => document.activeElement === el);
    })
    .toBe(true);
  await page.waitForTimeout(50);
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
}

async function addTerminalOutputInstrumentation(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const windowWithOutput = window as typeof window & {
      __terminalOutputInstrumented?: boolean;
      __terminalOutputBySectionId?: Record<string, string>;
      __terminalReadyBySectionId?: Record<string, boolean>;
      __terminalReadyCountBySectionId?: Record<string, number>;
    };
    if (!windowWithOutput.__terminalOutputBySectionId) {
      windowWithOutput.__terminalOutputBySectionId = {};
    }
    if (!windowWithOutput.__terminalReadyBySectionId) {
      windowWithOutput.__terminalReadyBySectionId = {};
    }
    if (!windowWithOutput.__terminalReadyCountBySectionId) {
      windowWithOutput.__terminalReadyCountBySectionId = {};
    }
    const currentWebSocket = WebSocket as typeof WebSocket & {
      __terminalOutputWrapped?: boolean;
    };
    if (!currentWebSocket.__terminalOutputWrapped) {
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
        socket.addEventListener("message", (event) => {
          const appendOutput = (text: string) => {
            if (!text) {
              return;
            }
            try {
              const urlObj = new URL(socket.url);
              const parts = urlObj.pathname.split("/").filter(Boolean);
              const sectionId =
                parts.length >= 2 ? parts[parts.length - 2] : "unknown";
              windowWithOutput.__terminalOutputBySectionId![sectionId] =
                (windowWithOutput.__terminalOutputBySectionId![sectionId] ??
                  "") + text;
            } catch {
              // Ignore output parse errors.
            }
          };

          if (typeof event.data === "string") {
            if (event.data === "SETTA_TERMINAL_READY") {
              try {
                const urlObj = new URL(socket.url);
                const parts = urlObj.pathname.split("/").filter(Boolean);
                const sectionId =
                  parts.length >= 2 ? parts[parts.length - 2] : "unknown";
                windowWithOutput.__terminalReadyBySectionId![sectionId] = true;
                windowWithOutput.__terminalReadyCountBySectionId![sectionId] =
                  (windowWithOutput.__terminalReadyCountBySectionId![
                    sectionId
                  ] ?? 0) + 1;
              } catch {
                // Ignore parse errors.
              }
              return;
            }
            appendOutput(event.data);
            return;
          }
          if (event.data instanceof ArrayBuffer) {
            appendOutput(new TextDecoder().decode(event.data));
            return;
          }
          if (event.data instanceof Blob) {
            event.data
              .arrayBuffer()
              .then((buffer) => {
                appendOutput(new TextDecoder().decode(buffer));
              })
              .catch(() => {
                // Ignore decode errors.
              });
          }
        });
        return socket;
      } as typeof WebSocket;
      WrappedWebSocket.prototype = OriginalWebSocket.prototype;
      Object.assign(WrappedWebSocket, OriginalWebSocket);
      (
        WrappedWebSocket as typeof WebSocket & {
          __terminalOutputWrapped?: boolean;
        }
      ).__terminalOutputWrapped = true;
      window.WebSocket = WrappedWebSocket;
    }
    windowWithOutput.__terminalOutputInstrumented = true;
  });
}

async function getTerminalOutputBuffer(
  page: Page,
  terminalId: string,
): Promise<string> {
  return await page.evaluate((id) => {
    return (
      (
        window as typeof window & {
          __terminalOutputBySectionId?: Record<string, string>;
        }
      ).__terminalOutputBySectionId?.[id] ?? ""
    );
  }, terminalId);
}

async function waitForTerminalOutputToStabilize(
  page: Page,
  terminalId: string,
  options?: {
    timeoutMs?: number;
    stableMs?: number;
    pollMs?: number;
  },
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 10000;
  const stableMs = options?.stableMs ?? 500;
  const pollMs = options?.pollMs ?? 100;
  const deadline = Date.now() + timeoutMs;

  let previousLength = (await getTerminalOutputBuffer(page, terminalId)).length;
  let stableSince = Date.now();

  while (Date.now() < deadline) {
    await page.waitForTimeout(pollMs);
    const nextLength = (await getTerminalOutputBuffer(page, terminalId)).length;
    if (nextLength === previousLength) {
      if (Date.now() - stableSince >= stableMs) {
        return;
      }
      continue;
    }
    previousLength = nextLength;
    stableSince = Date.now();
  }

  throw new Error(
    `Timed out waiting for terminal ${terminalId} output to stabilize.`,
  );
}

async function waitForTerminalOutputMarker(
  page: Page,
  terminalId: string,
  marker: string,
  timeoutMs = 20000,
): Promise<void> {
  await expect
    .poll(
      async () => {
        return await getTerminalOutputBuffer(page, terminalId);
      },
      { timeout: timeoutMs },
    )
    .toContain(marker);
}

async function waitForTerminalRowsMarker(
  page: Page,
  terminalId: string,
  marker: string,
  timeoutMs = 20000,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const rows = await getTerminalRowsSnapshot(page, terminalId);
        // Marker can be split across wrapped rows (no single row contains it).
        const joined = rows.join("");
        if (joined.includes(marker)) {
          return true;
        }
        // In some cases the wrapped row ends up with terminal fill whitespace in
        // the middle of the marker; strip whitespace and try again.
        return joined.replaceAll(/\s+/g, "").includes(marker);
      },
      { timeout: timeoutMs },
    )
    .toBe(true);
}

async function waitForTerminalReady(
  page: Page,
  terminalId: string,
  options?: {
    timeoutMs?: number;
    required?: boolean;
    minReadyCount?: number;
  },
): Promise<boolean> {
  const timeoutMs = options?.timeoutMs ?? 20000;
  const required = options?.required ?? true;
  const minReadyCount = options?.minReadyCount ?? 1;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const readyCount = await page.evaluate((id) => {
      const readyMap = window as typeof window & {
        __terminalReadyBySectionId?: Record<string, boolean>;
        __terminalReadyCountBySectionId?: Record<string, number>;
      };
      const count = readyMap.__terminalReadyCountBySectionId?.[id];
      if (typeof count === "number") {
        return count;
      }
      return readyMap.__terminalReadyBySectionId?.[id] ? 1 : 0;
    }, terminalId);
    if (readyCount >= minReadyCount) {
      return true;
    }
    await page.waitForTimeout(250);
  }
  if (required) {
    throw new Error(`Timed out waiting for terminal ${terminalId} readiness.`);
  }
  return false;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) {
    throw new Error("Expected non-empty needle for countOccurrences.");
  }
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

async function ensureTerminalAcceptsInput(
  page: Page,
  terminalId: string,
  marker: string,
  options?: { timeoutMs?: number; attemptTimeoutMs?: number },
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 30000;
  const attemptTimeoutMs = options?.attemptTimeoutMs ?? 8000;
  const deadline = Date.now() + timeoutMs;

  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    await focusTerminalAndType(page, terminalId, `echo ${marker}`);
    try {
      await waitForTerminalOutputMarker(
        page,
        terminalId,
        marker,
        attemptTimeoutMs,
      );
      return;
    } catch {
      await page.waitForTimeout(500);
    }
  }

  const output = await getTerminalOutputBuffer(page, terminalId);
  const tail = output.slice(Math.max(0, output.length - 2000));
  throw new Error(
    `Timed out waiting for terminal ${terminalId} to accept input (marker ${marker}).\n\nOutput tail:\n${tail}`,
  );
}

async function waitForTerminalResizeCountsToStabilize(
  page: Page,
  terminalId: string,
  options?: { timeoutMs?: number; stableMs?: number; pollMs?: number },
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 10000;
  const stableMs = options?.stableMs ?? 500;
  const pollMs = options?.pollMs ?? 100;
  const deadline = Date.now() + timeoutMs;

  const getResizeCountSum = async () => {
    return await page.evaluate((id) => {
      const counts = window.__terminalResizeCountsBySectionId?.[id];
      if (!counts) {
        return 0;
      }
      return (counts.drag ?? 0) + (counts.post ?? 0) + (counts.idle ?? 0);
    }, terminalId);
  };

  let previousCount = await getResizeCountSum();
  let stableSince = Date.now();

  while (Date.now() < deadline) {
    await page.waitForTimeout(pollMs);
    const nextCount = await getResizeCountSum();
    if (nextCount === previousCount) {
      if (Date.now() - stableSince >= stableMs) {
        return;
      }
      continue;
    }
    previousCount = nextCount;
    stableSince = Date.now();
  }

  throw new Error(
    `Timed out waiting for terminal ${terminalId} resize counts to stabilize.`,
  );
}

async function getTerminalLastResize(
  page: Page,
  terminalId: string,
): Promise<{ cols: number; rows: number } | null> {
  return await page.evaluate((id) => {
    const entry = window.__terminalLastResizeBySectionId?.[id];
    if (!entry) {
      return null;
    }
    if (typeof entry.cols !== "number" || typeof entry.rows !== "number") {
      return null;
    }
    return { cols: entry.cols, rows: entry.rows };
  }, terminalId);
}

async function addTerminalResizeInstrumentation(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (window.__terminalResizeInstrumented) {
      return;
    }
    window.__terminalResizeInstrumented = true;
    window.__terminalResizePhase = "idle";
    window.__terminalResizeCountsBySectionId = {};
    window.__terminalLastResizeBySectionId = {};
    const originalSend = WebSocket.prototype.send;
    WebSocket.prototype.send = function (data) {
      try {
        if (typeof data === "string") {
          const parsed = JSON.parse(data);
          if (parsed?.messageType === "terminalResize") {
            const url = new URL(this.url);
            const parts = url.pathname.split("/").filter(Boolean);
            const sectionId =
              parts.length >= 2 ? parts[parts.length - 2] : "unknown";
            const phase = window.__terminalResizePhase ?? "idle";
            if (!window.__terminalResizeCountsBySectionId[sectionId]) {
              window.__terminalResizeCountsBySectionId[sectionId] = {
                drag: 0,
                post: 0,
                idle: 0,
              };
            }
            const counts = window.__terminalResizeCountsBySectionId[sectionId];
            counts[phase] = (counts[phase] ?? 0) + 1;
            if (
              typeof parsed.cols === "number" &&
              typeof parsed.rows === "number"
            ) {
              window.__terminalLastResizeBySectionId[sectionId] = {
                cols: parsed.cols,
                rows: parsed.rows,
              };
            }
          }
        }
      } catch {
        // Ignore parse errors and fall through to the original send.
      }
      return originalSend.apply(this, arguments);
    };
  });
}

async function focusPaneForDnd(page: Page): Promise<void> {
  await page.click(".react-flow__pane", {
    position: { x: 8, y: 8 },
    force: true,
  });
}

async function resetViewport(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { useReactFlow } = await import("/src/forks/xyflow/core/store");
    useReactFlow.setState({
      transform: [0, 0, 1],
      fitViewOnInit: false,
      fitViewOnInitDone: true,
    });
    window.reactFlowZoom = 1;
  });
}

function getDragStartPoint(box: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number } {
  const offset = 12;
  return {
    x: box.x + Math.min(offset, box.width / 2),
    y: box.y + Math.min(offset, box.height / 2),
  };
}

function getDetachTargetPoint({
  paneBox,
  codeBox,
  attempt,
}: {
  paneBox: { x: number; y: number; width: number; height: number };
  codeBox: { x: number; y: number; width: number; height: number };
  attempt: number;
}): { x: number; y: number } {
  const margin = 40;
  const centerX = codeBox.x + codeBox.width / 2;
  const centerY = codeBox.y + codeBox.height / 2;
  const stepOffset = attempt * 40;
  const verticalOffset = attempt * 20;
  const candidates = [
    { x: codeBox.x + codeBox.width + 320 + stepOffset, y: codeBox.y + 40 },
    { x: codeBox.x - 320 - stepOffset, y: codeBox.y + 40 },
    { x: centerX, y: centerY + 240 + verticalOffset },
    { x: centerX, y: centerY - 240 - verticalOffset },
  ].map((point) => ({
    x: clamp(point.x, paneBox.x + margin, paneBox.x + paneBox.width - margin),
    y: clamp(point.y, paneBox.y + margin, paneBox.y + paneBox.height - margin),
  }));

  const startIndex = attempt % candidates.length;
  const ordered = candidates
    .slice(startIndex)
    .concat(candidates.slice(0, startIndex));
  const picked = ordered.find((point) => isPointOutsideBox(codeBox, point, 20));
  return picked ?? candidates[0];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

async function dragSelectTerminalMarkerRangeAndCopy({
  page,
  terminalId,
  marker,
  startOffset,
  endOffset,
}: {
  page: Page;
  terminalId: string;
  marker: string;
  startOffset: number;
  endOffset: number;
}): Promise<string> {
  let lastSelection = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const start = await getTerminalMarkerCharCenter({
      page,
      terminalId,
      marker,
      markerOffset: startOffset,
    });
    const end = await getTerminalMarkerCharCenter({
      page,
      terminalId,
      marker,
      markerOffset: endOffset,
    });

    const offsetSpan = Math.abs(endOffset - startOffset);
    const deltaX = end.x - start.x;
    const estimatedCellWidth =
      offsetSpan > 0 ? Math.abs(deltaX) / offsetSpan : 10;
    // Drag from just inside the start cell to just inside the end cell so
    // integer mouse coordinate rounding at different zoom levels doesn't drop
    // boundary characters.
    const pad = Math.min(Math.max(estimatedCellWidth * 0.45, 2), 14);
    const startX = start.x - pad;
    const endX = end.x + pad;

    await page.mouse.move(startX, start.y);
    await page.mouse.down();
    await page.mouse.move(endX, end.y, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(100);

    lastSelection = await copyTerminalSelection(page, terminalId);
    if (lastSelection.replace(/\r/g, "").trim().length > 0) {
      return lastSelection;
    }
    await page.waitForTimeout(100);
  }

  return lastSelection;
}

async function getTerminalMarkerCharCenter({
  page,
  terminalId,
  marker,
  markerOffset,
}: {
  page: Page;
  terminalId: string;
  marker: string;
  markerOffset: number;
}): Promise<{ x: number; y: number }> {
  return await page.evaluate(
    ({ id, marker, markerOffset }) => {
      const embedded = document.querySelector(
        `[data-attached-terminal-section-id="${id}"]`,
      );
      const container =
        embedded ??
        document.querySelector(`.react-flow__node[data-id="${id}"]`);
      if (!container) {
        throw new Error(`Missing terminal container for ${id}.`);
      }

      const rows = Array.from(container.querySelectorAll(".xterm-rows > div"));
      const row = rows.find((row) => (row.textContent ?? "").includes(marker));
      if (!row) {
        throw new Error(`Missing terminal row for marker ${marker}.`);
      }

      const rowText = row.textContent ?? "";
      const markerStart = rowText.indexOf(marker);
      if (markerStart < 0) {
        throw new Error("Marker not found in row text.");
      }
      const targetIndex = markerStart + markerOffset;
      if (
        targetIndex < markerStart ||
        targetIndex >= markerStart + marker.length
      ) {
        throw new Error("Requested markerOffset is out of bounds.");
      }

      const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
      let remaining = targetIndex;
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!(node instanceof Text)) {
          continue;
        }
        const text = node.textContent ?? "";
        if (remaining < text.length) {
          const range = document.createRange();
          range.setStart(node, remaining);
          range.setEnd(node, remaining + 1);
          const rect = range.getBoundingClientRect();
          if (rect.width > 0 || rect.height > 0) {
            return {
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
            };
          }
          const rowRect = row.getBoundingClientRect();
          return { x: rowRect.left + 2, y: rowRect.top + rowRect.height / 2 };
        }
        remaining -= text.length;
      }
      throw new Error("Unable to resolve marker character position.");
    },
    { id: terminalId, marker, markerOffset },
  );
}

async function copyTerminalSelection(
  page: Page,
  terminalId: string,
): Promise<string> {
  return await page.evaluate((id) => {
    const embedded = document.querySelector(
      `[data-attached-terminal-section-id="${id}"]`,
    );
    const container =
      embedded ?? document.querySelector(`.react-flow__node[data-id="${id}"]`);
    if (!container) {
      throw new Error(`Missing terminal container for ${id}.`);
    }
    const textarea = container.querySelector(
      ".xterm-helper-textarea, .xterm textarea",
    );
    const xterm = container.querySelector(".xterm");
    const target = (textarea ?? xterm) as HTMLElement | null;
    if (!target) {
      throw new Error("Missing xterm element.");
    }
    // xterm wires clipboard handlers around its helper textarea; dispatching
    // here matches how real copy events are triggered more closely than
    // dispatching on the container.
    target.focus?.();
    const clipboardData = new DataTransfer();
    // Chromium has tightened restrictions around constructing ClipboardEvent
    // with a writable `clipboardData`. xterm only checks for the presence of
    // `event.clipboardData`, so define it manually on a standard Event.
    const event = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: clipboardData,
    });
    target.dispatchEvent(event);
    return clipboardData.getData("text/plain");
  }, terminalId);
}

async function expectDetachedTerminalHeaderLayout(
  page: Page,
  terminalId: string,
): Promise<void> {
  await expect
    .poll(async () => {
      return await page.evaluate((id) => {
        const node = document.querySelector(
          `.react-flow__node[data-id="${id}"]`,
        );
        if (!node) {
          return "missing-node";
        }
        const header = node.querySelector("header.section-title");
        if (!header) {
          return "missing-header";
        }
        const editor = node.querySelector("[data-section-main-editor]");
        if (!editor) {
          return "missing-editor";
        }
        const headerBox = header.getBoundingClientRect();
        const editorBox = editor.getBoundingClientRect();
        return editorBox.top >= headerBox.bottom - 1
          ? "ok"
          : `overlap:${Math.round(editorBox.top)}:${Math.round(headerBox.bottom)}`;
      }, terminalId);
    })
    .toBe("ok");
}

function isPointOutsideBox(
  box: { x: number; y: number; width: number; height: number },
  point: { x: number; y: number },
  margin: number,
): boolean {
  return (
    point.x < box.x - margin ||
    point.x > box.x + box.width + margin ||
    point.y < box.y - margin ||
    point.y > box.y + box.height + margin
  );
}

async function isTerminalDetachedInDom(
  page: Page,
  sectionId: string,
  terminalId: string,
): Promise<boolean> {
  const embeddedCount = await page
    .locator(
      `.react-flow__node[data-id="${sectionId}"] [data-attached-terminal-section-id="${terminalId}"]`,
    )
    .count();
  const terminalNodeCount = await page
    .locator(`.react-flow__node[data-id="${terminalId}"]`)
    .count();
  return embeddedCount === 0 && terminalNodeCount > 0;
}

async function waitForAttachedTerminalId(
  page: Page,
  projectConfigName: string,
  sectionId: string,
  options?: { requireChild?: boolean },
): Promise<string> {
  const requireChild = options?.requireChild ?? false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await loadProjectState(page, projectConfigName);
    const core = state.sections[sectionId];
    const coreAttachedId =
      core?.sharedModifier.attachedTerminalSectionId ?? null;
    const impl = resolveSectionImpl(state, sectionId);
    if (!core && !impl) {
      await page.waitForTimeout(250);
      continue;
    }
    const attachedId =
      coreAttachedId ?? impl?.attachedTerminalSectionId ?? null;
    if (!attachedId) {
      await page.waitForTimeout(250);
      continue;
    }
    if (requireChild) {
      if (!impl?.children || !impl.children.includes(attachedId)) {
        await page.waitForTimeout(250);
        continue;
      }
    }
    const attachedImpl = resolveSectionImpl(state, attachedId);
    if (!attachedImpl || attachedImpl.type !== "Terminal") {
      await page.waitForTimeout(250);
      continue;
    }
    return attachedId;
  }
  throw new Error("Timed out waiting for attached terminal.");
}

function resolveSectionImpl(
  state: ProjectStateResponse,
  sectionId: string,
): ProjectStateResponse["sectionImpls"][string] | null {
  const variantId = state.projectConfig.sectionVariantMap[sectionId];
  if (!variantId) {
    return null;
  }
  const variant = state.sectionVariants[variantId];
  if (!variant) {
    return null;
  }
  return state.sectionImpls[variant.impl] ?? null;
}

async function loadProjectState(
  page: Page,
  projectConfigName: string,
): Promise<ProjectStateResponse> {
  const response = await postBackend<ProjectStateResponse>(
    page,
    "/loadProjectConfig",
    { projectConfigName },
  );
  if (!response) {
    throw new Error("Missing project config response.");
  }
  return response;
}

async function createNewProjectConfig(
  page: Page,
): Promise<{ projectConfigId: string; projectConfigName: string }> {
  await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "New Config" }).click();
  await page.waitForSelector(READY_SELECTOR);

  const projectConfigName = getProjectConfigName(page.url(), PROJECT_URL);
  if (!projectConfigName) {
    throw new Error("Unable to resolve new project config name.");
  }
  const projectConfigId = await resolveProjectConfigId(page, projectConfigName);
  return { projectConfigId, projectConfigName };
}

async function resolveProjectConfigId(
  page: Page,
  projectConfigName: string,
): Promise<string> {
  const metadata = await postBackend<ProjectMetadataResponse>(
    page,
    "/loadAllProjectMetadata",
    {},
  );
  if (!metadata) {
    throw new Error("Missing project metadata response.");
  }
  const match = metadata.projectMetadata.find(
    (entry) => entry.name === projectConfigName,
  );
  if (!match) {
    throw new Error(
      `Unable to resolve project config id for ${projectConfigName}.`,
    );
  }
  return match.id;
}

async function createCodeSection(page: Page): Promise<string> {
  return await createTopLevelSectionOfType(page, "Code");
}

async function createTerminalSection(page: Page): Promise<string> {
  return await createTopLevelSectionOfType(page, "Terminal");
}

async function createTopLevelSectionOfType(
  page: Page,
  implType: "Code" | "Terminal",
): Promise<string> {
  const sectionId = await page.evaluate(async (type) => {
    const { createTopLevelSection } = await import(
      "/src/state/actions/sections/createSections"
    );
    const { SectionTypeEnum } = await import("/src/utils/generatedTypes");
    const resolvedType = SectionTypeEnum[type] ?? type;
    return await createTopLevelSection({
      implType: resolvedType,
      implOverrides: null,
      position: null,
    });
  }, implType);
  if (!sectionId) {
    throw new Error("Missing sectionId when creating section.");
  }
  return sectionId;
}

function getProjectConfigName(pageUrl: string, baseUrl: string): string {
  const pagePath = new URL(pageUrl).pathname;
  const basePath = new URL(baseUrl).pathname;
  let relativePath = pagePath;

  if (basePath !== "/") {
    const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
    if (relativePath.startsWith(normalizedBase)) {
      relativePath = relativePath.slice(normalizedBase.length);
    } else if (relativePath.startsWith(basePath)) {
      relativePath = relativePath.slice(basePath.length);
    }
  }

  relativePath = relativePath.replace(/^\/+/, "");
  return decodeURIComponent(relativePath);
}

async function deleteProjectConfigById(
  page: Page,
  projectConfigId: string,
): Promise<void> {
  if (page.isClosed()) {
    return;
  }
  // Clean up via the same surface area as users (home page), otherwise the
  // still-mounted project page can keep sending layout updates for the deleted
  // config and starve the delete request.
  try {
    await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });
  } catch (error) {
    if (page.isClosed()) {
      return;
    }
    throw error;
  }

  try {
    await postBackend(page, "/deleteProjectConfigs", {
      ids: [projectConfigId],
    });
  } catch (error) {
    if (page.isClosed()) {
      return;
    }
    throw error;
  }
}

function resolveProjectUrl(): string {
  const configuredUrl = process.env.SETTA_PROJECT_URL;
  if (configuredUrl) {
    return configuredUrl;
  }
  const configuredPath = process.env.SETTA_PROJECT_PATH;
  if (configuredPath) {
    return new URL(configuredPath, BASE_URL).toString();
  }
  return BASE_URL;
}
