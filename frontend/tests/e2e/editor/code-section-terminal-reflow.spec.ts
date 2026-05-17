import { expect, test } from "@playwright/test";
import { ensureAppReady } from "../helpers";
import {
  activateMovingFreeDragMode,
  addTerminalOutputInstrumentation,
  addTerminalResizeInstrumentation,
  clickGpuSourceControl,
  countLongLineWrapRows,
  createCodeSection,
  createNewProjectConfig,
  createTerminalSection,
  deleteProjectConfigById,
  ensureTerminalAcceptsInput,
  expectDetachedTerminalHeaderLayout,
  focusPaneForDnd,
  focusTerminalAndType,
  getEmbeddedTerminalHost,
  getDragStartPoint,
  getTerminalLastResize,
  getTerminalRowsSnapshot,
  loadProjectState,
  moveSectionsViaBackend,
  resolveSectionImpl,
  setSectionSize,
  syncEmbeddedTerminalSectionSize,
  waitForAttachedTerminalId,
  waitForTerminalOutputMarker,
  waitForTerminalOutputToStabilize,
  waitForTerminalReady,
  waitForTerminalResizeCountsToStabilize,
} from "./code-section-terminal-attachment-helpers";

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

    await moveSectionsViaBackend(page, {
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
    const embeddedTerminalHost = getEmbeddedTerminalHost(page, terminalId);
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

    await ensureTerminalAcceptsInput(
      page,
      terminalId,
      `ATTACHED_REFLOW_READY_${Date.now()}`,
      {
        timeoutMs: process.env.CI ? 60000 : 30000,
      },
    );
    await focusTerminalAndType(page, terminalId, "clear");
    await waitForTerminalOutputToStabilize(page, terminalId, {
      timeoutMs: 20000,
      stableMs: 750,
    });

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

    await ensureTerminalAcceptsInput(
      page,
      terminalId,
      `DETACHED_REFLOW_READY_${Date.now()}`,
      {
        timeoutMs: process.env.CI ? 60000 : 30000,
      },
    );
    await focusTerminalAndType(page, terminalId, "clear");
    await waitForTerminalOutputToStabilize(page, terminalId, {
      timeoutMs: 20000,
      stableMs: 750,
    });

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
    await moveSectionsViaBackend(page, {
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
    const embeddedTerminalHost = getEmbeddedTerminalHost(page, terminalId);
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
      `.setta-gpu-flow__node[data-id="${codeSectionId}"]`,
    );
    const toggleButton = codeNode.locator("[data-attached-terminal-toggle]");
    await expect(toggleButton).toHaveCount(1);
    await clickGpuSourceControl(toggleButton);

    const terminalId = await waitForAttachedTerminalId(
      page,
      projectConfigName,
      codeSectionId,
    );
    const embeddedTerminalHost = getEmbeddedTerminalHost(page, terminalId);
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

    await ensureTerminalAcceptsInput(
      page,
      terminalId,
      `ATTACHED_INIT_REFLOW_READY_${Date.now()}`,
      {
        timeoutMs: process.env.CI ? 60000 : 30000,
      },
    );
    await focusTerminalAndType(page, terminalId, "clear");
    await waitForTerminalOutputToStabilize(page, terminalId, {
      timeoutMs: 20000,
      stableMs: 750,
    });

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

    await ensureTerminalAcceptsInput(
      page,
      terminalId,
      `DETACHED_AFTER_ATTACH_INIT_READY_${Date.now()}`,
      {
        timeoutMs: process.env.CI ? 60000 : 30000,
      },
    );
    await focusTerminalAndType(page, terminalId, "clear");
    await waitForTerminalOutputToStabilize(page, terminalId, {
      timeoutMs: 20000,
      stableMs: 750,
    });

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
    await moveSectionsViaBackend(page, {
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

    const embeddedTerminalHost = getEmbeddedTerminalHost(page, terminalId);
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
    const releaseMovingFreeMode = await activateMovingFreeDragMode(page);
    altPressed = true;

    const pane = page.locator(".setta-gpu-flow__pane");
    const paneBox = await pane.boundingBox();
    const codeBox = await page
      .locator(`.setta-gpu-flow__node[data-id="${codeSectionId}"]`)
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

    await releaseMovingFreeMode();
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
