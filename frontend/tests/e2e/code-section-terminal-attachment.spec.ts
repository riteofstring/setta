import { expect, test, type Page } from "@playwright/test";
import { ensureAppReady, postBackend } from "./helpers";

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
    await deleteProjectConfigByName(page, projectConfigName);
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
      return Boolean(node.closest('article[data-section-main-editor]'));
    });
    expect(isInsideCodeEditor).toBe(false);
  } finally {
    await deleteProjectConfigByName(page, projectConfigName);
  }
});

test("attached terminal renders without header and resizes independently", async ({
  page,
}) => {
  test.setTimeout(90000);
  await ensureAppReady(page);

  const { projectConfigName } = await createNewProjectConfig(page);

  try {
    const sectionId = await createCodeSection(page);
    await runCodeBlockInPage(page, sectionId);
    const terminalId = await waitForAttachedTerminalId(
      page,
      projectConfigName,
      sectionId,
    );

    const codeNode = page.locator(
      `.react-flow__node[data-id="${sectionId}"]`,
    );
    const codeEditor = codeNode.locator(
      `article[data-section-main-editor]`,
    );
    const terminalHost = codeNode.locator(
      `[data-attached-terminal-section-id="${terminalId}"]`,
    );

    await expect(codeEditor).toBeVisible();
    await expect(terminalHost).toBeVisible();

    const terminalSection = terminalHost.locator("xpath=ancestor::section[1]");
    await expect(terminalSection).toBeVisible();
    await expect(terminalSection.locator("header.section-title")).toHaveCount(0);
    await expect(
      terminalSection.locator(".section-resize-handle-bottom"),
    ).toHaveCount(1);
    await expect(terminalSection.locator(".section-resize-handle-right")).toHaveCount(1);

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
    expect(Math.abs(updatedCodeBox.height - initialCodeBox.height)).toBeLessThanOrEqual(3);
  } finally {
    await deleteProjectConfigByName(page, projectConfigName);
  }
});

test("embedded terminal code editor scrolls when content overflows", async ({
  page,
}) => {
  test.setTimeout(90000);
  await ensureAppReady(page);

  const { projectConfigName } = await createNewProjectConfig(page);

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
    await deleteProjectConfigByName(page, projectConfigName);
  }
});

test("embedded terminals only receive runs from their code section", async ({
  page,
}) => {
  test.setTimeout(90000);
  await ensureAppReady(page);

  const { projectConfigName } = await createNewProjectConfig(page);

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
    await deleteProjectConfigByName(page, projectConfigName);
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
    await deleteProjectConfigByName(page, projectConfigName);
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
    await deleteProjectConfigByName(page, projectConfigName);
  }
});

test("embedded terminal can detach via drag and drop", async ({ page }) => {
  test.setTimeout(90000);
  await ensureAppReady(page);

  const { projectConfigName } = await createNewProjectConfig(page);

  try {
    const sectionId = await createCodeSection(page);
    await runCodeBlockInPage(page, sectionId);
    const terminalId = await waitForAttachedTerminalId(
      page,
      projectConfigName,
      sectionId,
    );

    const terminalHost = page.locator(
      `.react-flow__node[data-id="${sectionId}"] [data-attached-terminal-section-id="${terminalId}"]`,
    );
    await expect(terminalHost).toBeVisible();
    const terminalContainer = terminalHost.locator("xpath=ancestor::section[1]");
    await expect(terminalContainer).toBeVisible();

    await focusPaneForDnd(page);
    await page.keyboard.down("Alt");

    const pane = page.locator(".react-flow__pane");
    const paneBox = await pane.boundingBox();
    const terminalBox = await terminalContainer.boundingBox();
    const codeBox = await page
      .locator(`.react-flow__node[data-id="${sectionId}"]`)
      .boundingBox();

    if (!paneBox || !terminalBox || !codeBox) {
      throw new Error("Missing bounding boxes for drag.");
    }

    const { x: startX, y: startY } = getDragStartPoint(terminalBox);
    const targetX = Math.min(
      codeBox.x + codeBox.width + 320,
      paneBox.x + paneBox.width - 40,
    );
    const targetY = Math.min(
      codeBox.y + 40,
      paneBox.y + paneBox.height - 40,
    );

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.waitForTimeout(250);
    await page.mouse.move(targetX, targetY, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up("Alt");

    await expect
      .poll(async () => {
        const state = await loadProjectState(page, projectConfigName);
        const terminalLayout =
          state.projectConfig.topLevelSections[terminalId];
        const codeImpl = resolveSectionImpl(state, sectionId);
        const children = codeImpl?.children ?? [];
        return Boolean(terminalLayout) && !children.includes(terminalId);
      })
      .toBe(true);
  } finally {
    await deleteProjectConfigByName(page, projectConfigName);
  }
});

test("detaching a narrow attached terminal does not append extra output", async ({
  page,
}) => {
  test.skip(
    Boolean(process.env.CI),
    "Skipped in CI due to terminal readiness/output flakiness on GitHub Actions.",
  );
  test.setTimeout(90000);
  await addTerminalOutputInstrumentation(page);
  await ensureAppReady(page);

  const { projectConfigId, projectConfigName } =
    await createNewProjectConfig(page);

  try {
    const codeSectionId = await createCodeSection(page);
    await resetViewport(page);

    const marker = `WRAP_MARKER_${Date.now()}`;
    const longLine = `${marker}_${"x".repeat(160)}`;
    await setCodeForSection(
      page,
      codeSectionId,
      `import sys\nprint("${marker}", flush=True)\nprint("${longLine}", flush=True)\n`,
    );

    await runCodeBlockInPage(page, codeSectionId);
    const terminalId = await waitForAttachedTerminalId(
      page,
      projectConfigName,
      codeSectionId,
    );

    const embeddedTerminalHost = page.locator(
      `.react-flow__node[data-id="${codeSectionId}"] [data-attached-terminal-section-id="${terminalId}"]`,
    );
    await expect(embeddedTerminalHost).toBeVisible();
    await waitForTerminalReady(page, terminalId);

    await runCodeBlockInPage(page, codeSectionId);
    await waitForTerminalOutputMarker(page, terminalId, marker, 20000);

    await setSectionSize(page, codeSectionId, { width: 320, height: 480 });

    await expect(embeddedTerminalHost).toBeVisible();
    const embeddedTerminal = embeddedTerminalHost.locator(
      "xpath=ancestor::section[1]",
    );
    await expect(embeddedTerminal).toBeVisible();
    const terminalBox = await embeddedTerminal.boundingBox();
    if (!terminalBox) {
      throw new Error("Missing embedded terminal bounding box.");
    }
    await setSectionSize(page, terminalId, {
      width: Math.round(terminalBox.width),
      height: Math.round(terminalBox.height),
    });

    const beforeOutput = await getTerminalOutputBuffer(page, terminalId);

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
        [terminalId]: { x: Math.round(codeBox.x + codeBox.width + 200), y: Math.round(codeBox.y) },
      },
    });

    const terminalNode = page.locator(
      `.react-flow__node[data-id="${terminalId}"]`,
    );
    await expect(terminalNode).toBeVisible();

    const afterOutput = await getTerminalOutputBuffer(page, terminalId);
    const appendedOutput = afterOutput.slice(beforeOutput.length);
    expect(appendedOutput.length).toBeLessThanOrEqual(128);
  } finally {
    await deleteProjectConfigByName(page, projectConfigName);
  }
});

test("terminal resize messages are throttled during drag detach", async ({
  page,
}) => {
  test.skip(
    Boolean(process.env.CI),
    "Skipped in CI due to terminal readiness/output flakiness on GitHub Actions.",
  );
  test.setTimeout(90000);
  await addTerminalOutputInstrumentation(page);
  await addTerminalResizeInstrumentation(page);
  await ensureAppReady(page);

  const { projectConfigName } = await createNewProjectConfig(page);
  let dragStarted = false;
  let altPressed = false;

  try {
    const codeSectionId = await createCodeSection(page);

    const marker = `RESIZE_MARKER_${Date.now()}`;
    const longLine = `${marker}_${"x".repeat(160)}`;
    await setCodeForSection(
      page,
      codeSectionId,
      `import sys\nprint("${marker}", flush=True)\nprint("${longLine}", flush=True)\n`,
    );

    await runCodeBlockInPage(page, codeSectionId);
    const terminalId = await waitForAttachedTerminalId(
      page,
      projectConfigName,
      codeSectionId,
    );

    const embeddedTerminalHost = page.locator(
      `.react-flow__node[data-id="${codeSectionId}"] [data-attached-terminal-section-id="${terminalId}"]`,
    );
    await expect(embeddedTerminalHost).toBeVisible();
    await waitForTerminalReady(page, terminalId);
    await runCodeBlockInPage(page, codeSectionId);

    await expect
      .poll(
        async () => {
          const rows = await getTerminalRowsSnapshot(page, terminalId);
          return rows.some((row) => row.trim().length > 0);
        },
        { timeout: 20000 },
      )
      .toBe(true);

    await setSectionSize(page, codeSectionId, { width: 320, height: 480 });
    await page.waitForTimeout(200);

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
    const targetY = Math.min(
      codeBox.y + 40,
      paneBox.y + paneBox.height - 40,
    );

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
    expect(terminalCounts.drag ?? 0).toBeLessThanOrEqual(4);
    expect(terminalCounts.post ?? 0).toBeLessThanOrEqual(4);
  } finally {
    if (dragStarted) {
      await page.mouse.up();
    }
    if (altPressed) {
      await page.keyboard.up("Alt");
    }
    await deleteProjectConfigByName(page, projectConfigName);
  }
});

async function runCodeBlockInPage(page: Page, sectionId: string): Promise<void> {
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
    const embedded = document.querySelector(
      `[data-attached-terminal-section-id="${id}"]`,
    );
    const container =
      embedded ??
      document.querySelector(`.react-flow__node[data-id="${id}"]`);
    if (!container) {
      return [];
    }
    const rows = container.querySelectorAll(".xterm-rows > div");
    return Array.from(rows).map((row) => row.textContent ?? "");
  }, terminalId);
}

async function addTerminalOutputInstrumentation(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const windowWithOutput = window as typeof window & {
      __terminalOutputInstrumented?: boolean;
      __terminalOutputBySectionId?: Record<string, string>;
      __terminalReadyBySectionId?: Record<string, boolean>;
    };
    if (!windowWithOutput.__terminalOutputBySectionId) {
      windowWithOutput.__terminalOutputBySectionId = {};
    }
    if (!windowWithOutput.__terminalReadyBySectionId) {
      windowWithOutput.__terminalReadyBySectionId = {};
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
      (WrappedWebSocket as typeof WebSocket & {
        __terminalOutputWrapped?: boolean;
      }).__terminalOutputWrapped = true;
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
      (window as typeof window & {
        __terminalOutputBySectionId?: Record<string, string>;
      }).__terminalOutputBySectionId?.[id] ?? ""
    );
  }, terminalId);
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

async function waitForTerminalReady(
  page: Page,
  terminalId: string,
  timeoutMs = 20000,
): Promise<void> {
  await expect
    .poll(
      async () => {
        return await page.evaluate((id) => {
          const readyMap = (window as typeof window & {
            __terminalReadyBySectionId?: Record<string, boolean>;
          }).__terminalReadyBySectionId;
          return readyMap?.[id] ?? false;
        }, terminalId);
      },
      { timeout: timeoutMs },
    )
    .toBe(true);
}

async function addTerminalResizeInstrumentation(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (window.__terminalResizeInstrumented) {
      return;
    }
    window.__terminalResizeInstrumented = true;
    window.__terminalResizePhase = "idle";
    window.__terminalResizeCountsBySectionId = {};
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
            const counts =
              window.__terminalResizeCountsBySectionId[sectionId];
            counts[phase] = (counts[phase] ?? 0) + 1;
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
  const projectConfigId = await resolveProjectConfigId(
    page,
    projectConfigName,
  );
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
    throw new Error(`Unable to resolve project config id for ${projectConfigName}.`);
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

async function deleteProjectConfigByName(
  page: Page,
  projectConfigName: string,
): Promise<void> {
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
    return;
  }
  await postBackend(page, "/deleteProjectConfigs", { ids: [match.id] });
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
