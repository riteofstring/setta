import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createCallableSection,
  openIsolatedProject,
  postBackend,
  setOverviewTab,
} from "../../helpers";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const RIGHT_PANE_SETTING_ID = "core.project.show_param_display_names";

type ToolError = {
  code: string;
  message: string;
};

type RevealUISettingResult = {
  projectConfigId: string;
  emittedRevealCount: number;
  statuses: Array<{
    status: "revealed" | "failed";
    error: ToolError | null;
  }>;
};

type ProjectStateSummarySection = {
  sectionId?: string;
  coreName?: string;
};

type ProjectStateSummaryResult = {
  sections?: ProjectStateSummarySection[];
};

type CallToolResponse<TStructured> = {
  isError: boolean;
  structuredContent?: TStructured | null;
  content?: Array<{
    type?: string;
    text?: string;
  }>;
};

async function callMcpTool<TStructured>(
  page: Page,
  projectConfigId: string,
  tool: string,
  argumentsPayload: Record<string, unknown>,
): Promise<TStructured> {
  const rawResponse = await page.request.post(
    `${BACKEND_ORIGIN}/__setta__/tools/call`,
    {
      data: {
        tool,
        arguments: argumentsPayload,
        agenticContext: {
          projectConfigId,
          allowUnscoped: true,
        },
      },
      timeout: 15000,
    },
  );
  const rawText = await rawResponse.text();
  if (!rawResponse.ok()) {
    const detail = rawText ? ` ${rawText}` : "";
    throw new Error(
      `MCP tool call failed (${rawResponse.status()}): ${tool}${detail}`,
    );
  }
  const response = JSON.parse(rawText) as CallToolResponse<TStructured>;
  if (response.isError) {
    throw new Error(`Tool ${tool} returned isError=true.`);
  }
  if (
    response.structuredContent !== undefined &&
    response.structuredContent !== null
  ) {
    return response.structuredContent;
  }
  for (const block of response.content ?? []) {
    if (typeof block.text !== "string") {
      continue;
    }
    try {
      return JSON.parse(block.text) as TStructured;
    } catch {
      continue;
    }
  }
  throw new Error(`Missing structured or JSON text result for ${tool}.`);
}

async function resolveTemporarySectionIdFromSummary(
  page: Page,
  projectConfigId: string,
  temporaryProjectConfigId: string,
  sectionName: string,
): Promise<string> {
  const summary = await callMcpTool<ProjectStateSummaryResult>(
    page,
    projectConfigId,
    "get_latest_project_state_summary",
    {
      projectConfigId: temporaryProjectConfigId,
    },
  );
  const sections = Array.isArray(summary.sections) ? summary.sections : [];
  const matchedSection = sections.find(
    (section) =>
      typeof section.coreName === "string" && section.coreName === sectionName,
  );
  if (!matchedSection || typeof matchedSection.sectionId !== "string") {
    const sectionNames = sections
      .map((section) => section.coreName)
      .filter((name): name is string => typeof name === "string");
    throw new Error(
      `Unable to resolve temporary section id for ${sectionName}. Available section names: ${JSON.stringify(sectionNames)}`,
    );
  }
  return matchedSection.sectionId;
}

async function readFrontendActiveIds(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const { useActiveSectionUI } = await import("/src/state/definitions.ts");
    return [...useActiveSectionUI.getState().activeIds];
  });
}

type FrontendUiEditorState = {
  uiEditorVis: boolean;
  uiEditorTabForCode: string | null;
};

async function readFrontendUiEditorState(
  page: Page,
): Promise<FrontendUiEditorState> {
  return page.evaluate(async () => {
    const { useLocalStorage } = await import("/src/state/definitions.ts");
    const state = useLocalStorage.getState();
    const uiEditorTabForCode = state.uiEditorTab["Code"];
    return {
      uiEditorVis: state.uiEditorVis,
      uiEditorTabForCode:
        typeof uiEditorTabForCode === "string" ? uiEditorTabForCode : null,
    };
  });
}

async function setFrontendActiveIds(
  page: Page,
  nextActiveIds: string[],
): Promise<void> {
  await page.evaluate(async (activeIds) => {
    const { setActiveSectionIds } = await import(
      "/src/state/actions/activeSections.ts"
    );
    setActiveSectionIds(activeIds, { syncMode: "ui-only" });
  }, nextActiveIds);
}

async function scheduleFrontendActiveIdsWithBlockedRaf(
  page: Page,
  nextActiveIds: string[],
): Promise<void> {
  await page.evaluate(async (activeIds) => {
    type ActiveIdsRafWindow = Window & {
      __settaActiveIdsBlockedRafCallback?: FrameRequestCallback | null;
      __settaActiveIdsBlockedRafHandle?: number;
      __settaActiveIdsOriginalRequestAnimationFrame?: typeof window.requestAnimationFrame;
      __settaActiveIdsOriginalCancelAnimationFrame?: typeof window.cancelAnimationFrame;
    };
    const windowRef = window as ActiveIdsRafWindow;
    windowRef.__settaActiveIdsBlockedRafCallback = null;
    windowRef.__settaActiveIdsBlockedRafHandle = 1;
    windowRef.__settaActiveIdsOriginalRequestAnimationFrame =
      window.requestAnimationFrame.bind(window);
    windowRef.__settaActiveIdsOriginalCancelAnimationFrame =
      window.cancelAnimationFrame.bind(window);
    const originalRequestAnimationFrame =
      windowRef.__settaActiveIdsOriginalRequestAnimationFrame;
    const originalCancelAnimationFrame =
      windowRef.__settaActiveIdsOriginalCancelAnimationFrame;
    window.requestAnimationFrame = (callback) => {
      if (windowRef.__settaActiveIdsBlockedRafCallback === null) {
        windowRef.__settaActiveIdsBlockedRafCallback = callback;
        return windowRef.__settaActiveIdsBlockedRafHandle ?? 1;
      }
      return originalRequestAnimationFrame(callback);
    };
    window.cancelAnimationFrame = (handle) => {
      if (handle === (windowRef.__settaActiveIdsBlockedRafHandle ?? 1)) {
        windowRef.__settaActiveIdsBlockedRafCallback = null;
        window.requestAnimationFrame = originalRequestAnimationFrame;
        window.cancelAnimationFrame = originalCancelAnimationFrame;
        return;
      }
      originalCancelAnimationFrame(handle);
    };

    const { setActiveSectionIds } = await import(
      "/src/state/actions/activeSections.ts"
    );
    setActiveSectionIds(activeIds);
  }, nextActiveIds);
}

async function flushBlockedFrontendActiveIdsRaf(page: Page): Promise<void> {
  await page.evaluate(() => {
    type ActiveIdsRafWindow = Window & {
      __settaActiveIdsBlockedRafCallback?: FrameRequestCallback | null;
      __settaActiveIdsOriginalRequestAnimationFrame?: typeof window.requestAnimationFrame;
      __settaActiveIdsOriginalCancelAnimationFrame?: typeof window.cancelAnimationFrame;
    };
    const windowRef = window as ActiveIdsRafWindow;
    const blockedCallback = windowRef.__settaActiveIdsBlockedRafCallback;
    const originalRequestAnimationFrame =
      windowRef.__settaActiveIdsOriginalRequestAnimationFrame;
    const originalCancelAnimationFrame =
      windowRef.__settaActiveIdsOriginalCancelAnimationFrame;
    windowRef.__settaActiveIdsBlockedRafCallback = null;
    if (originalRequestAnimationFrame) {
      window.requestAnimationFrame = originalRequestAnimationFrame;
    }
    if (originalCancelAnimationFrame) {
      window.cancelAnimationFrame = originalCancelAnimationFrame;
    }
    blockedCallback?.(16);
  });
}

async function rewriteNextRevealActiveSectionId(
  page: Page,
  replacementSectionId: string,
): Promise<void> {
  await page.evaluate((replacement) => {
    type RevealRewriteWindow = Window & {
      __settaRevealActiveSectionRewriteInstalled?: boolean;
      __settaRevealActiveSectionRewriteConsumed?: boolean;
      __settaRevealActiveSectionRewriteOriginalParse?: typeof JSON.parse;
    };
    const windowRef = window as RevealRewriteWindow;
    windowRef.__settaRevealActiveSectionRewriteConsumed = false;
    if (windowRef.__settaRevealActiveSectionRewriteInstalled) {
      return;
    }
    windowRef.__settaRevealActiveSectionRewriteInstalled = true;
    const originalParse = JSON.parse.bind(JSON);
    windowRef.__settaRevealActiveSectionRewriteOriginalParse = originalParse;
    JSON.parse = function patchedParse(
      text: string,
      reviver?: (this: unknown, key: string, value: unknown) => unknown,
    ): unknown {
      const parsed = originalParse(text, reviver);
      if (
        windowRef.__settaRevealActiveSectionRewriteConsumed ||
        typeof parsed !== "object" ||
        parsed === null
      ) {
        return parsed;
      }
      const payload = parsed as {
        messageType?: unknown;
        content?: { activeSectionId?: unknown };
      };
      if (
        payload.messageType === "UISettingReveal" &&
        payload.content &&
        typeof payload.content.activeSectionId === "string"
      ) {
        payload.content.activeSectionId = replacement;
        windowRef.__settaRevealActiveSectionRewriteConsumed = true;
      }
      return payload;
    };
  }, replacementSectionId);
}

async function rewriteNextRevealAnchorId(
  page: Page,
  replacementAnchorId: string,
): Promise<void> {
  await page.evaluate((replacement) => {
    type RevealRewriteWindow = Window & {
      __settaRevealAnchorRewriteInstalled?: boolean;
      __settaRevealAnchorRewriteConsumed?: boolean;
    };
    const windowRef = window as RevealRewriteWindow;
    windowRef.__settaRevealAnchorRewriteConsumed = false;
    if (windowRef.__settaRevealAnchorRewriteInstalled) {
      return;
    }
    windowRef.__settaRevealAnchorRewriteInstalled = true;
    const originalParse = JSON.parse.bind(JSON);
    JSON.parse = function patchedParse(
      text: string,
      reviver?: (this: unknown, key: string, value: unknown) => unknown,
    ): unknown {
      const parsed = originalParse(text, reviver);
      if (
        windowRef.__settaRevealAnchorRewriteConsumed ||
        typeof parsed !== "object" ||
        parsed === null
      ) {
        return parsed;
      }
      const payload = parsed as {
        messageType?: unknown;
        content?: {
          reveals?: Array<{
            anchorId?: unknown;
          }>;
        };
      };
      if (payload.messageType !== "UISettingReveal") {
        return parsed;
      }
      if (!payload.content || !Array.isArray(payload.content.reveals)) {
        return parsed;
      }
      for (const reveal of payload.content.reveals) {
        if (typeof reveal.anchorId !== "string") {
          continue;
        }
        reveal.anchorId = replacement;
        windowRef.__settaRevealAnchorRewriteConsumed = true;
        break;
      }
      return parsed;
    };
  }, replacementAnchorId);
}

async function wasRevealActiveSectionRewriteConsumed(
  page: Page,
): Promise<boolean> {
  return page.evaluate(() => {
    type RevealRewriteWindow = Window & {
      __settaRevealActiveSectionRewriteConsumed?: boolean;
    };
    const windowRef = window as RevealRewriteWindow;
    return windowRef.__settaRevealActiveSectionRewriteConsumed === true;
  });
}

async function wasRevealAnchorRewriteConsumed(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    type RevealRewriteWindow = Window & {
      __settaRevealAnchorRewriteConsumed?: boolean;
    };
    const windowRef = window as RevealRewriteWindow;
    return windowRef.__settaRevealAnchorRewriteConsumed === true;
  });
}

async function installRevealResultAckDrop(page: Page): Promise<void> {
  await page.evaluate(() => {
    type RevealAckDropWindow = Window & {
      __settaRevealAckDropInstalled?: boolean;
      __settaRevealAckDropped?: boolean;
    };
    const windowRef = window as RevealAckDropWindow;
    windowRef.__settaRevealAckDropped = false;
    if (windowRef.__settaRevealAckDropInstalled) {
      return;
    }
    windowRef.__settaRevealAckDropInstalled = true;
    const originalSend = WebSocket.prototype.send;
    WebSocket.prototype.send = function patchedSend(
      data: string | ArrayBufferLike | Blob | ArrayBufferView,
    ) {
      if (typeof data === "string") {
        try {
          const parsed = JSON.parse(data) as { messageType?: string };
          if (parsed.messageType === "UISettingRevealResult") {
            windowRef.__settaRevealAckDropped = true;
            return;
          }
        } catch {
          // Ignore non-JSON websocket frames.
        }
      }
      return originalSend.call(this, data);
    };
  });
}

async function wasRevealResultAckDropped(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    type RevealAckDropWindow = Window & {
      __settaRevealAckDropped?: boolean;
    };
    const windowRef = window as RevealAckDropWindow;
    return windowRef.__settaRevealAckDropped === true;
  });
}

test("right-pane reveal_ui_setting returns failure when no section is active", async ({
  page,
}) => {
  await setOverviewTab(page, "Overview");
  const projectContext = await openIsolatedProject(page);
  const sectionId = await createCallableSection(
    page,
    projectContext.projectConfigId,
  );

  try {
    await postBackend(page, "/setActiveIds", {
      projectConfigId: projectContext.projectConfigId,
      activeIds: [],
    });

    const revealResult = await callMcpTool<RevealUISettingResult>(
      page,
      projectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: RIGHT_PANE_SETTING_ID,
      },
    );
    expect(revealResult.emittedRevealCount).toBe(0);
    expect(revealResult.statuses[0]?.status).toBe("failed");
    expect(revealResult.statuses[0]?.error?.code).toBe("mutation_failed");
    expect(revealResult.statuses[0]?.error?.message).toContain(
      "sectionIdToActivate",
    );

    await expect(page.getByTestId("ui-editor-tab-content-shell")).toHaveCount(
      0,
    );
    await expect(
      page.locator(
        '[data-setting-anchor="core.project.show_param_display_names"]',
      ),
    ).toHaveCount(0);

    // Keep the created section referenced so test intent is explicit.
    expect(sectionId).toBeTruthy();
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("right-pane reveal_ui_setting activates section from sectionIdToActivate", async ({
  page,
}) => {
  await setOverviewTab(page, "Overview");
  const projectContext = await openIsolatedProject(page);
  const sectionId = await createCallableSection(
    page,
    projectContext.projectConfigId,
  );
  const sectionName = `right-pane-target-${Date.now()}`;

  try {
    await postBackend(page, "/setSectionName", {
      projectConfigId: projectContext.projectConfigId,
      sectionId,
      name: sectionName,
    });
    await postBackend(page, "/setActiveIds", {
      projectConfigId: projectContext.projectConfigId,
      activeIds: [],
    });
    const seedResult = await callMcpTool<RevealUISettingResult>(
      page,
      projectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: RIGHT_PANE_SETTING_ID,
      },
    );
    if (typeof seedResult.projectConfigId !== "string") {
      throw new Error(
        `Expected temporary projectConfigId in seed result: ${JSON.stringify(seedResult)}`,
      );
    }
    const temporarySectionId = await resolveTemporarySectionIdFromSummary(
      page,
      projectContext.projectConfigId,
      seedResult.projectConfigId,
      sectionName,
    );

    const revealResult = await callMcpTool<RevealUISettingResult>(
      page,
      projectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: RIGHT_PANE_SETTING_ID,
        sectionIdToActivate: temporarySectionId,
        durationMs: 8000,
      },
    );
    expect(
      revealResult.emittedRevealCount,
      `Unexpected reveal result: ${JSON.stringify(revealResult)}`,
    ).toBe(1);
    expect(revealResult.statuses[0]?.status).toBe("revealed");
    expect(revealResult.statuses[0]?.error).toBeNull();

    const rightPaneShell = page.getByTestId("ui-editor-tab-content-shell");
    await expect(rightPaneShell).toBeVisible();
    await expect(rightPaneShell.locator("h2")).toContainText("Quick Info");

    const settingAnchor = page.locator(
      '[data-setting-anchor="core.project.show_param_display_names"]',
    );
    await expect(settingAnchor).toBeVisible();
    await expect(settingAnchor).toHaveClass(
      /setta-ui-setting-reveal-highlight/,
    );

    await expect
      .poll(async () => readFrontendActiveIds(page))
      .toEqual([sectionId]);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("right-pane reveal_ui_setting cancels a queued durable active-id sync before transient activation", async ({
  page,
}) => {
  await setOverviewTab(page, "Overview");
  const projectContext = await openIsolatedProject(page);
  const initialSectionId = await createCallableSection(
    page,
    projectContext.projectConfigId,
  );
  const targetSectionId = await createCallableSection(
    page,
    projectContext.projectConfigId,
  );
  const initialSectionName = `right-pane-queued-initial-${Date.now()}`;
  const targetSectionName = `right-pane-queued-target-${Date.now()}`;

  try {
    await postBackend(page, "/setSectionName", {
      projectConfigId: projectContext.projectConfigId,
      sectionId: initialSectionId,
      name: initialSectionName,
    });
    await postBackend(page, "/setSectionName", {
      projectConfigId: projectContext.projectConfigId,
      sectionId: targetSectionId,
      name: targetSectionName,
    });
    await postBackend(page, "/setActiveIds", {
      projectConfigId: projectContext.projectConfigId,
      activeIds: [],
    });

    const seedResult = await callMcpTool<RevealUISettingResult>(
      page,
      projectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: RIGHT_PANE_SETTING_ID,
      },
    );
    if (typeof seedResult.projectConfigId !== "string") {
      throw new Error(
        `Expected temporary projectConfigId in seed result: ${JSON.stringify(seedResult)}`,
      );
    }
    const temporaryInitialSectionId =
      await resolveTemporarySectionIdFromSummary(
        page,
        projectContext.projectConfigId,
        seedResult.projectConfigId,
        initialSectionName,
      );
    const temporaryTargetSectionId = await resolveTemporarySectionIdFromSummary(
      page,
      projectContext.projectConfigId,
      seedResult.projectConfigId,
      targetSectionName,
    );

    // Frontend active ids stay in the live UI store using the real section ids.
    expect(temporaryInitialSectionId).toBeTruthy();
    await scheduleFrontendActiveIdsWithBlockedRaf(page, [initialSectionId]);
    await expect
      .poll(async () => readFrontendActiveIds(page))
      .toEqual([initialSectionId]);

    const revealResultPromise = callMcpTool<RevealUISettingResult>(
      page,
      projectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: RIGHT_PANE_SETTING_ID,
        sectionIdToActivate: temporaryTargetSectionId,
        durationMs: 8000,
      },
    );

    await expect
      .poll(async () => readFrontendActiveIds(page))
      .toEqual([targetSectionId]);

    await flushBlockedFrontendActiveIdsRaf(page);

    const latestProjectState = await postBackend<{
      projectState?: {
        projectConfig?: { activeIds?: string[] };
      };
    }>(page, "/getLatestProjectState", {
      projectConfigId: projectContext.projectConfigId,
    });
    expect(latestProjectState?.projectState?.projectConfig?.activeIds).toEqual(
      [],
    );
    await expect
      .poll(async () => readFrontendActiveIds(page))
      .toEqual([targetSectionId]);

    const revealResult = await revealResultPromise;
    expect(revealResult.emittedRevealCount).toBe(1);
    expect(revealResult.statuses[0]?.status).toBe("revealed");
    expect(revealResult.statuses[0]?.error).toBeNull();
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("right-pane reveal_ui_setting restores frontend activeIds when incoming reveal target is stale", async ({
  page,
}) => {
  await setOverviewTab(page, "Overview");
  const projectContext = await openIsolatedProject(page);
  const initialSectionId = await createCallableSection(
    page,
    projectContext.projectConfigId,
  );
  const requestedSectionId = await createCallableSection(
    page,
    projectContext.projectConfigId,
  );
  const initialSectionName = `right-pane-stale-initial-${Date.now()}`;
  const requestedSectionName = `right-pane-stale-target-${Date.now()}`;

  try {
    await postBackend(page, "/setSectionName", {
      projectConfigId: projectContext.projectConfigId,
      sectionId: initialSectionId,
      name: initialSectionName,
    });
    await postBackend(page, "/setSectionName", {
      projectConfigId: projectContext.projectConfigId,
      sectionId: requestedSectionId,
      name: requestedSectionName,
    });

    const seedResult = await callMcpTool<RevealUISettingResult>(
      page,
      projectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: RIGHT_PANE_SETTING_ID,
      },
    );
    if (typeof seedResult.projectConfigId !== "string") {
      throw new Error(
        `Expected temporary projectConfigId in seed result: ${JSON.stringify(seedResult)}`,
      );
    }
    const temporaryInitialSectionId =
      await resolveTemporarySectionIdFromSummary(
        page,
        projectContext.projectConfigId,
        seedResult.projectConfigId,
        initialSectionName,
      );
    const temporaryRequestedSectionId =
      await resolveTemporarySectionIdFromSummary(
        page,
        projectContext.projectConfigId,
        seedResult.projectConfigId,
        requestedSectionName,
      );
    expect(temporaryInitialSectionId).toBeTruthy();
    await setFrontendActiveIds(page, [initialSectionId]);
    await expect
      .poll(async () => readFrontendActiveIds(page))
      .toEqual([initialSectionId]);

    await rewriteNextRevealActiveSectionId(
      page,
      "missing-section-for-reveal-rollback",
    );
    const revealResult = await callMcpTool<RevealUISettingResult>(
      page,
      projectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: RIGHT_PANE_SETTING_ID,
        sectionIdToActivate: temporaryRequestedSectionId,
        durationMs: 3000,
      },
    );

    expect(revealResult.emittedRevealCount).toBe(0);
    expect(revealResult.statuses[0]?.status).toBe("failed");
    expect(revealResult.statuses[0]?.error?.code).toBe("mutation_failed");
    expect(revealResult.statuses[0]?.error?.message).toContain(
      "Right-pane reveal requires an active section",
    );
    expect(await wasRevealActiveSectionRewriteConsumed(page)).toBe(true);
    await expect
      .poll(async () => readFrontendActiveIds(page))
      .toEqual([initialSectionId]);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("right-pane reveal_ui_setting keeps frontend activation and pane state unchanged when reveal fails after activation", async ({
  page,
}) => {
  await setOverviewTab(page, "Overview");
  const projectContext = await openIsolatedProject(page);
  const sectionId = await createCallableSection(
    page,
    projectContext.projectConfigId,
  );
  const sectionName = `right-pane-timeout-${Date.now()}`;

  try {
    await postBackend(page, "/setSectionName", {
      projectConfigId: projectContext.projectConfigId,
      sectionId,
      name: sectionName,
    });
    await postBackend(page, "/setActiveIds", {
      projectConfigId: projectContext.projectConfigId,
      activeIds: [],
    });
    const seedResult = await callMcpTool<RevealUISettingResult>(
      page,
      projectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: RIGHT_PANE_SETTING_ID,
      },
    );
    if (typeof seedResult.projectConfigId !== "string") {
      throw new Error(
        `Expected temporary projectConfigId in seed result: ${JSON.stringify(seedResult)}`,
      );
    }
    const temporarySectionId = await resolveTemporarySectionIdFromSummary(
      page,
      projectContext.projectConfigId,
      seedResult.projectConfigId,
      sectionName,
    );
    const frontendUiEditorBeforeReveal = await readFrontendUiEditorState(page);
    await expect.poll(async () => readFrontendActiveIds(page)).toEqual([]);
    await rewriteNextRevealAnchorId(
      page,
      "missing-anchor-for-reveal-activation-rollback",
    );

    const revealResult = await callMcpTool<RevealUISettingResult>(
      page,
      projectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: RIGHT_PANE_SETTING_ID,
        sectionIdToActivate: temporarySectionId,
        durationMs: 3000,
      },
    );
    expect(revealResult.statuses[0]?.status).toBe("failed");
    expect(await wasRevealAnchorRewriteConsumed(page)).toBe(true);
    await expect.poll(async () => readFrontendActiveIds(page)).toEqual([]);
    await expect(page.getByTestId("ui-editor-tab-content-shell")).toHaveCount(
      0,
    );
    const frontendUiEditorAfterReveal = await readFrontendUiEditorState(page);
    expect(frontendUiEditorAfterReveal).toEqual(frontendUiEditorBeforeReveal);

    const latestProjectState = await postBackend<{
      projectState?: {
        projectConfig?: { activeIds?: string[] };
      };
    }>(page, "/getLatestProjectState", {
      projectConfigId: projectContext.projectConfigId,
    });
    expect(latestProjectState?.projectState?.projectConfig?.activeIds).toEqual(
      [],
    );
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("right-pane reveal timeout preserves user ABA activeIds navigation", async ({
  page,
}) => {
  await setOverviewTab(page, "Overview");
  const projectContext = await openIsolatedProject(page);
  const firstSectionId = await createCallableSection(
    page,
    projectContext.projectConfigId,
  );
  const secondSectionId = await createCallableSection(
    page,
    projectContext.projectConfigId,
  );
  const firstSectionName = `right-pane-aba-first-${Date.now()}`;
  const secondSectionName = `right-pane-aba-second-${Date.now()}`;

  try {
    await postBackend(page, "/setSectionName", {
      projectConfigId: projectContext.projectConfigId,
      sectionId: firstSectionId,
      name: firstSectionName,
    });
    await postBackend(page, "/setSectionName", {
      projectConfigId: projectContext.projectConfigId,
      sectionId: secondSectionId,
      name: secondSectionName,
    });
    await postBackend(page, "/setActiveIds", {
      projectConfigId: projectContext.projectConfigId,
      activeIds: [],
    });

    const seedResult = await callMcpTool<RevealUISettingResult>(
      page,
      projectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: RIGHT_PANE_SETTING_ID,
      },
    );
    if (typeof seedResult.projectConfigId !== "string") {
      throw new Error(
        `Expected temporary projectConfigId in seed result: ${JSON.stringify(seedResult)}`,
      );
    }
    const temporaryFirstSectionId = await resolveTemporarySectionIdFromSummary(
      page,
      projectContext.projectConfigId,
      seedResult.projectConfigId,
      firstSectionName,
    );

    await installRevealResultAckDrop(page);

    const revealResultPromise = callMcpTool<RevealUISettingResult>(
      page,
      projectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: RIGHT_PANE_SETTING_ID,
        sectionIdToActivate: temporaryFirstSectionId,
        durationMs: 250,
      },
    );

    await expect.poll(() => wasRevealResultAckDropped(page)).toBe(true);
    const projectStateAfterDroppedAck = await postBackend<{
      projectState?: {
        projectConfig?: { activeIds?: string[] };
      };
    }>(page, "/getLatestProjectState", {
      projectConfigId: projectContext.projectConfigId,
    });
    expect(
      projectStateAfterDroppedAck?.projectState?.projectConfig?.activeIds,
    ).toEqual([]);

    await postBackend(page, "/setActiveIds", {
      projectConfigId: projectContext.projectConfigId,
      activeIds: [secondSectionId],
    });
    await postBackend(page, "/setActiveIds", {
      projectConfigId: projectContext.projectConfigId,
      activeIds: [firstSectionId],
    });

    const revealResult = await revealResultPromise;
    expect(revealResult.emittedRevealCount).toBe(0);
    expect(revealResult.statuses[0]?.status).toBe("failed");
    expect(revealResult.statuses[0]?.error?.message).toContain(
      "Timed out waiting for frontend reveal confirmation",
    );

    const latestProjectState = await postBackend<{
      projectState?: {
        projectConfig?: { activeIds?: string[] };
      };
    }>(page, "/getLatestProjectState", {
      projectConfigId: projectContext.projectConfigId,
    });
    expect(latestProjectState?.projectState?.projectConfig?.activeIds).toEqual([
      firstSectionId,
    ]);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("right-pane reveal_ui_setting rejects incompatible sectionIdToActivate without mutating activeIds", async ({
  page,
}) => {
  await setOverviewTab(page, "Overview");
  const projectContext = await openIsolatedProject(page);
  const sectionName = `right-pane-incompatible-${Date.now()}`;

  try {
    const createdCodeSection = await postBackend<{
      sectionId?: string;
    }>(page, "/createTopLevelSection", {
      projectConfigId: projectContext.projectConfigId,
      implType: "Code",
    });
    if (!createdCodeSection?.sectionId) {
      throw new Error("Missing sectionId when creating Code section.");
    }
    await postBackend(page, "/setSectionName", {
      projectConfigId: projectContext.projectConfigId,
      sectionId: createdCodeSection.sectionId,
      name: sectionName,
    });
    await postBackend(page, "/setActiveIds", {
      projectConfigId: projectContext.projectConfigId,
      activeIds: [],
    });
    const seedResult = await callMcpTool<RevealUISettingResult>(
      page,
      projectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: RIGHT_PANE_SETTING_ID,
      },
    );
    if (typeof seedResult.projectConfigId !== "string") {
      throw new Error(
        `Expected temporary projectConfigId in seed result: ${JSON.stringify(seedResult)}`,
      );
    }
    const temporarySectionId = await resolveTemporarySectionIdFromSummary(
      page,
      projectContext.projectConfigId,
      seedResult.projectConfigId,
      sectionName,
    );

    const revealResult = await callMcpTool<RevealUISettingResult>(
      page,
      projectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: RIGHT_PANE_SETTING_ID,
        sectionIdToActivate: temporarySectionId,
        durationMs: 3000,
      },
    );
    expect(revealResult.emittedRevealCount).toBe(0);
    expect(revealResult.statuses[0]?.status).toBe("failed");
    expect(revealResult.statuses[0]?.error?.code).toBe("mutation_failed");
    expect(revealResult.statuses[0]?.error?.message).toContain(
      "Section type Code does not support tab QuickInfoConfig.",
    );

    const latestProjectState = await postBackend<{
      projectState?: {
        projectConfig?: { activeIds?: string[] };
      };
    }>(page, "/getLatestProjectState", {
      projectConfigId: projectContext.projectConfigId,
    });
    expect(latestProjectState?.projectState?.projectConfig?.activeIds).toEqual(
      [],
    );
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
