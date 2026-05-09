import { expect, test } from "@playwright/test";
import { ensureAppReady } from "../helpers";
import {
  addTerminalOutputInstrumentation,
  addTerminalResizeInstrumentation,
  countLongLineRows,
  countLongLineWrapRows,
  createCodeSection,
  createNewProjectConfig,
  createTerminalSection,
  deleteProjectConfigById,
  ensureTerminalAcceptsInput,
  expectDetachedTerminalHeaderLayout,
  focusTerminalAndType,
  getTerminalLastResize,
  getTerminalOutputBuffer,
  getTerminalRowsSnapshot,
  moveSectionsViaBackend,
  resetViewport,
  setSectionSize,
  syncEmbeddedTerminalSectionSize,
  waitForAttachedTerminalId,
  waitForTerminalOutputMarker,
  waitForTerminalOutputToStabilize,
  waitForTerminalReady,
  waitForTerminalResizeCountsToStabilize,
} from "./code-section-terminal-attachment-helpers";

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

    const embeddedTerminalHost = page.locator(
      `.setta-gpu-flow__node[data-id="${codeSectionId}"] [data-attached-terminal-section-id="${terminalId}"]`,
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
    await ensureTerminalAcceptsInput(page, terminalId, readyMarker, {
      timeoutMs: 20000,
      attemptTimeoutMs: 5000,
    });
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
    let sttyMatch: RegExpMatchArray | null = null;
    await expect
      .poll(
        async () => {
          const sttyOutput = await getTerminalOutputBuffer(page, terminalId);
          sttyMatch = sttyOutput.match(
            new RegExp(`${sttyMarker}\\s+(\\d+)\\s+(\\d+)`),
          );
          return sttyMatch !== null;
        },
        { timeout: 20000 },
      )
      .toBe(true);
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
