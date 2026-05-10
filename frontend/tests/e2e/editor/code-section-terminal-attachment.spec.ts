import { expect, test } from "@playwright/test";
import { ensureAppReady, postBackend } from "../helpers";
import {
  addTerminalOutputInstrumentation,
  countOccurrences,
  createCodeSection,
  createNewProjectConfig,
  createTerminalSection,
  deleteProjectConfigById,
  dragSelectTerminalMarkerRangeAndCopy,
  ensureTerminalAcceptsInput,
  expectDetachedTerminalHeaderLayout,
  focusTerminalAndType,
  getDetachTargetPoint,
  getTerminalOutputBuffer,
  getTerminalRowsSnapshot,
  loadProjectState,
  moveSectionsViaBackend,
  resetViewport,
  runCodeBlockInPage,
  setCodeForSection,
  setSectionHeight,
  setSectionSize,
  syncEmbeddedTerminalSectionSize,
  waitForAttachedTerminalId,
  waitForTerminalOutputMarker,
  waitForTerminalOutputToStabilize,
  waitForTerminalReady,
  waitForTerminalRowsMarker,
} from "./code-section-terminal-attachment-helpers";

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
      `.setta-gpu-flow__node[data-id="${sectionId}"] [data-attached-terminal-section-id="${firstTerminalId}"]`,
    );
    await expect(embeddedTerminalHost).toBeVisible();
    const terminalNode = page.locator(
      `.setta-gpu-flow__node[data-id="${firstTerminalId}"]`,
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
    const codeNode = page.locator(
      `.setta-gpu-flow__node[data-id="${sectionId}"]`,
    );
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
      `.setta-gpu-flow__node[data-id="${terminalId}"]`,
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
      `.setta-gpu-flow__node[data-id="${sectionId}"] article[data-section-main-editor]`,
    );
    const terminalContainer = page.locator(
      `.setta-gpu-flow__node[data-id="${sectionId}"] [data-attached-terminal-section-id="${terminalId}"]`,
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

test("terminal startup stays clean while preserving input readiness", async ({
  page,
}) => {
  test.setTimeout(90000);
  await addTerminalOutputInstrumentation(page);
  await ensureAppReady(page);

  const { projectConfigId } = await createNewProjectConfig(page);

  try {
    const terminalId = await createTerminalSection(page);
    await waitForTerminalReady(page, terminalId, {
      required: !process.env.CI,
      timeoutMs: process.env.CI ? 5000 : 20000,
    });
    await waitForTerminalOutputToStabilize(page, terminalId, {
      timeoutMs: 10000,
      stableMs: 500,
    });

    const initialOutput = await getTerminalOutputBuffer(page, terminalId);
    expect(initialOutput).not.toContain("SETTA_RDY");
    expect(initialOutput).not.toContain("printf '%s\\n' 'SETTA_RDY'");

    await ensureTerminalAcceptsInput(
      page,
      terminalId,
      `STARTUP_CLEAN_READY_${Date.now()}`,
    );
  } finally {
    await deleteProjectConfigById(page, projectConfigId);
  }
});

test("terminal text selection stays aligned at GPU flow zoom", async ({
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
    await ensureTerminalAcceptsInput(
      page,
      terminalId,
      `SELECTION_READY_${Date.now()}`,
    );

    const marker =
      "SELECTION_ZOOM_TEST_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    await focusTerminalAndType(page, terminalId, `printf '${marker}\\n'`);
    await waitForTerminalRowsMarker(
      page,
      terminalId,
      marker,
      process.env.CI ? 30000 : 20000,
    );
    await waitForTerminalOutputToStabilize(page, terminalId, {
      timeoutMs: 10000,
      stableMs: 500,
    });

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
      `.setta-gpu-flow__node[data-id="${terminalId}"]`,
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

    const zoomOut = await page.evaluate(() => window.settaGpuFlowZoom ?? 1);
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

    const zoomIn = await page.evaluate(() => window.settaGpuFlowZoom ?? 1);
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

    const codeNode = page.locator(
      `.setta-gpu-flow__node[data-id="${sectionId}"]`,
    );
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
      `.setta-gpu-flow__node[data-id="${sectionId}"] .cm-scroller`,
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

    const codeNode = page.locator(
      `.setta-gpu-flow__node[data-id="${sectionId}"]`,
    );
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

    const targetHandle = codeNode.locator(
      `.setta-gpu-flow__handle.agentic-handle[data-nodeid="${sectionId}"][data-handleid="agentic-edge-target"]`,
    );
    const sourceHandle = codeNode.locator(
      `.setta-gpu-flow__handle.agentic-handle[data-nodeid="${sectionId}"][data-handleid="agentic-edge-source"]`,
    );
    const reverseStartHandle = codeNode.locator(
      `.setta-gpu-flow__handle.agentic-handle[data-nodeid="${sectionId}"][data-handleid="agentic-edge-reverse-start"][data-reverse-start="true"]`,
    );
    await expect(targetHandle).toHaveCount(1);
    await expect(sourceHandle).toHaveCount(1);
    await expect(reverseStartHandle).toHaveCount(1);

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
    await expect(targetHandle).toHaveCount(1);
    await expect(sourceHandle).toHaveCount(1);
    await expect(reverseStartHandle).toHaveCount(1);

    await toggleButton.click({ force: true });
    await expect(joinedGroup).toBeVisible();
    await expect(terminalHost).toBeVisible();
    await expect(codeSection).toHaveClass(/rounded-b-none/);
    await expect(terminalSection).toBeVisible();
    await expect(terminalSection).toHaveClass(/rounded-t-none/);
    await expect(targetHandle).toHaveCount(1);
    await expect(sourceHandle).toHaveCount(1);
    await expect(reverseStartHandle).toHaveCount(1);
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

    const codeNode = page.locator(
      `.setta-gpu-flow__node[data-id="${sectionId}"]`,
    );
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

    const codeNode = page.locator(
      `.setta-gpu-flow__node[data-id="${sectionId}"]`,
    );
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
      `.setta-gpu-flow__node[data-id="${codeSectionId}"]`,
    );
    const terminalNode = page.locator(
      `.setta-gpu-flow__node[data-id="${terminalSectionId}"]`,
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
      `.setta-gpu-flow__node[data-id="${codeSectionId}"] [data-attached-terminal-section-id="${terminalSectionId}"]`,
    );
    await expect(embeddedTerminalHost).toBeVisible();
    await expect(
      page.locator(`.setta-gpu-flow__node[data-id="${terminalSectionId}"]`),
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
      `.setta-gpu-flow__node[data-id="${codeSectionId}"]`,
    );
    const terminalNode = page.locator(
      `.setta-gpu-flow__node[data-id="${terminalSectionId}"]`,
    );

    await expect(codeNode).toBeVisible();
    await expect(terminalNode).toBeVisible();

    await moveSectionsViaBackend(page, {
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
      `.setta-gpu-flow__node[data-id="${codeSectionId}"] [data-attached-terminal-section-id="${terminalSectionId}"]`,
    );
    await expect(embeddedTerminalHost).toBeVisible();

    await moveSectionsViaBackend(page, {
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

test("embedded terminal can detach via frontend move action", async ({
  page,
}) => {
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
    await waitForTerminalOutputToStabilize(page, terminalId, {
      timeoutMs: 10000,
      stableMs: 500,
    });

    const terminalHost = page.locator(
      `.setta-gpu-flow__node[data-id="${sectionId}"] [data-attached-terminal-section-id="${terminalId}"]`,
    );
    await expect(terminalHost).toBeVisible();
    await expect(
      terminalHost.locator("xpath=ancestor::section[1]"),
    ).toBeVisible();

    const codeNode = page.locator(
      `.setta-gpu-flow__node[data-id="${sectionId}"]`,
    );
    const pane = page.locator(".setta-gpu-flow__pane");
    const paneBox = await pane.boundingBox();
    const codeBox = await codeNode.boundingBox();
    if (!paneBox || !codeBox) {
      throw new Error("Missing bounding boxes for detach move.");
    }
    const { x: targetX, y: targetY } = getDetachTargetPoint({
      paneBox,
      codeBox,
      attempt: 0,
    });
    const moveResponsePromise = page.waitForResponse((response) => {
      if (response.request().method() !== "POST") {
        return false;
      }
      const url = new URL(response.url());
      if (!url.pathname.endsWith("/api/moveSections")) {
        return false;
      }
      const payload = response.request().postDataJSON() as
        | {
            projectConfigId?: string;
            sectionIds?: string[];
            newParentId?: string | null;
          }
        | undefined;
      return (
        payload?.projectConfigId === projectConfigId &&
        payload.newParentId === null &&
        payload.sectionIds?.includes(terminalId) === true
      );
    });
    // Drag-detach coverage lives in the dedicated drag test below; keep this
    // case deterministic so it can assert the detach backend mutation path.
    await page.evaluate(
      async ({ detachedTerminalId, targetX, targetY }) => {
        const { moveSectionsWithBackend } = await import(
          "/src/state/actions/sections/moveSections"
        );
        moveSectionsWithBackend({
          sectionIds: [detachedTerminalId],
          newParentId: null,
          newIndex: null,
          positionsById: {
            [detachedTerminalId]: { x: targetX, y: targetY },
          },
        });
      },
      {
        detachedTerminalId: terminalId,
        targetX,
        targetY,
      },
    );
    const moveResponse = await moveResponsePromise;
    expect(moveResponse.ok()).toBe(true);

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
      `.setta-gpu-flow__node[data-id="${terminalId}"]`,
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
      page.locator(`.setta-gpu-flow__node[data-id="${terminalId}"]`),
    ).toHaveCount(0, { timeout: 20000 });

    const embeddedTerminalHost = page.locator(
      `.setta-gpu-flow__node[data-id="${codeSectionId}"] [data-attached-terminal-section-id="${terminalId}"]`,
    );
    await expect(embeddedTerminalHost).toBeVisible();
    await waitForTerminalReady(page, terminalId, {
      timeoutMs: process.env.CI ? 60000 : 40000,
    });
    await waitForTerminalOutputToStabilize(page, terminalId, {
      timeoutMs: 20000,
      stableMs: 750,
    });

    await ensureTerminalAcceptsInput(
      page,
      terminalId,
      `DETACH_WRAP_READY_${Date.now()}`,
    );
    const marker = `WRAP_MARKER_${Date.now()}`;
    const xCount = 160;
    const longLine = `${marker}_${"x".repeat(xCount)}`;
    await focusTerminalAndType(
      page,
      terminalId,
      `python -c "m='${marker}'; print(m, flush=True); print(m + '_' + 'x'*${xCount}, flush=True)"`,
    );
    await waitForTerminalOutputMarker(page, terminalId, `${marker}_`, 20000);

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
      .locator(`.setta-gpu-flow__node[data-id="${codeSectionId}"]`)
      .boundingBox();

    if (!codeBox) {
      throw new Error("Missing bounding boxes for drag.");
    }

    await moveSectionsViaBackend(page, {
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
      `.setta-gpu-flow__node[data-id="${terminalId}"]`,
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
