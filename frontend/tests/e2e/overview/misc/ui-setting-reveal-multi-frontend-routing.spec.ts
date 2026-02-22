import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  openIsolatedProject,
  setOverviewTab,
} from "../../helpers";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const WATCH_CODE_ENABLED_SETTING_ID = "core.watch_code.enabled";
const FRONTEND_IDENTITY_MESSAGE_TYPE = "FrontendIdentity";
const FRONTEND_IDENTITY_GLOBAL_KEY = "__settaFrontendIdentity";

type ToolError = {
  code: string;
  message: string;
};

type RevealUISettingResult = {
  emittedRevealCount: number;
  statuses: Array<{
    status: "revealed" | "failed";
    error: ToolError | null;
  }>;
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
  frontendWebsocketId: string,
  shareSessionId?: string,
): Promise<TStructured> {
  const agenticContext: Record<string, unknown> = {
    projectConfigId,
    frontendWebsocketId,
    allowUnscoped: true,
  };
  if (typeof shareSessionId === "string" && shareSessionId.trim() !== "") {
    agenticContext.shareSessionId = shareSessionId;
  }
  const rawResponse = await page.request.post(
    `${BACKEND_ORIGIN}/__setta__/tools/call`,
    {
      data: {
        tool,
        arguments: argumentsPayload,
        agenticContext,
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

async function installFrontendIdentityCapture(page: Page): Promise<void> {
  await page.addInitScript(
    ({ identityMessageType, globalKey }) => {
      const targetWindow = window as unknown as Record<string, unknown>;
      targetWindow[globalKey] = null;
      const originalAddEventListener = WebSocket.prototype.addEventListener;
      WebSocket.prototype.addEventListener = function (
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | AddEventListenerOptions,
      ): void {
        if (type !== "message" || listener === null) {
          originalAddEventListener.call(this, type, listener, options);
          return;
        }
        const wrappedListener: EventListener = (event) => {
          if (event instanceof MessageEvent && typeof event.data === "string") {
            try {
              const payload = JSON.parse(event.data) as {
                messageType?: unknown;
                content?: { websocketId?: unknown };
              };
              if (
                payload.messageType === identityMessageType &&
                typeof payload.content?.websocketId === "string" &&
                payload.content.websocketId.trim() !== ""
              ) {
                targetWindow[globalKey] = payload.content.websocketId.trim();
              }
            } catch {}
          }
          if (typeof listener === "function") {
            listener.call(this, event);
            return;
          }
          listener.handleEvent(event);
        };
        originalAddEventListener.call(this, type, wrappedListener, options);
      };
    },
    {
      identityMessageType: FRONTEND_IDENTITY_MESSAGE_TYPE,
      globalKey: FRONTEND_IDENTITY_GLOBAL_KEY,
    },
  );
}

async function waitForFrontendIdentity(page: Page): Promise<string> {
  await expect
    .poll(async () => {
      return page.evaluate((globalKey) => {
        const value = (window as unknown as Record<string, unknown>)[globalKey];
        if (typeof value !== "string" || value.trim() === "") {
          return null;
        }
        return value.trim();
      }, FRONTEND_IDENTITY_GLOBAL_KEY);
    })
    .not.toBeNull();
  const identity = await page.evaluate((globalKey) => {
    const value = (window as unknown as Record<string, unknown>)[globalKey];
    if (typeof value !== "string" || value.trim() === "") {
      return null;
    }
    return value.trim();
  }, FRONTEND_IDENTITY_GLOBAL_KEY);
  if (identity === null) {
    throw new Error("Expected frontend websocket identity to be available.");
  }
  return identity;
}

test("reveal_ui_setting targets the initiating frontend in multi-tab sessions", async ({
  page,
}) => {
  await setOverviewTab(page, "Overview");
  await installFrontendIdentityCapture(page);
  const projectContext = await openIsolatedProject(page);
  const revealHighlightsOne = page.locator(
    ".setta-ui-setting-reveal-highlight",
  );
  const pageOneUrl = page.url();
  const frontendIdOne = await waitForFrontendIdentity(page);

  const secondPage = await page.context().newPage();
  await setOverviewTab(secondPage, "Overview");
  await installFrontendIdentityCapture(secondPage);
  await secondPage.goto(pageOneUrl, { waitUntil: "domcontentloaded" });
  const revealHighlightsTwo = secondPage.locator(
    ".setta-ui-setting-reveal-highlight",
  );
  const frontendIdTwo = await waitForFrontendIdentity(secondPage);

  expect(frontendIdOne).not.toBe(frontendIdTwo);

  try {
    const firstReveal = await callMcpTool<RevealUISettingResult>(
      page,
      projectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: WATCH_CODE_ENABLED_SETTING_ID,
        durationMs: 600,
      },
      frontendIdOne,
    );
    expect(firstReveal.emittedRevealCount).toBe(1);
    expect(firstReveal.statuses[0]?.status).toBe("revealed");
    await expect
      .poll(async () => revealHighlightsOne.count())
      .toBeGreaterThan(0);
    await expect.poll(async () => revealHighlightsTwo.count()).toBe(0);
    await expect
      .poll(async () => revealHighlightsOne.count(), {
        timeout: 5000,
      })
      .toBe(0);

    const secondReveal = await callMcpTool<RevealUISettingResult>(
      secondPage,
      projectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: WATCH_CODE_ENABLED_SETTING_ID,
        durationMs: 600,
      },
      frontendIdTwo,
    );
    expect(secondReveal.emittedRevealCount).toBe(1);
    expect(secondReveal.statuses[0]?.status).toBe("revealed");
    await expect
      .poll(async () => revealHighlightsTwo.count())
      .toBeGreaterThan(0);
    await expect.poll(async () => revealHighlightsOne.count()).toBe(0);
  } finally {
    await cleanupIsolatedProject(page, projectContext.projectConfigId);
    await secondPage.close();
  }
});

test("reveal_ui_setting fails fast when frontend websocket id is unavailable", async ({
  page,
}) => {
  await setOverviewTab(page, "Overview");
  const projectContext = await openIsolatedProject(page);

  try {
    const requestedFrontendId = "frontend-missing-e2e";
    const startedAt = Date.now();
    const revealResult = await callMcpTool<RevealUISettingResult>(
      page,
      projectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: WATCH_CODE_ENABLED_SETTING_ID,
        durationMs: 8000,
      },
      requestedFrontendId,
    );
    const elapsedMs = Date.now() - startedAt;

    expect(elapsedMs).toBeLessThan(5000);
    expect(revealResult.emittedRevealCount).toBe(0);
    expect(revealResult.statuses[0]?.status).toBe("failed");
    expect(revealResult.statuses[0]?.error?.code).toBe("mutation_failed");
    expect(revealResult.statuses[0]?.error?.message).toContain(
      requestedFrontendId,
    );
    expect(revealResult.statuses[0]?.error?.message).not.toContain(
      "Timed out waiting for frontend reveal confirmation",
    );
  } finally {
    await cleanupIsolatedProject(page, projectContext.projectConfigId);
  }
});

test("reveal_ui_setting accepts share-scoped calls that include frontend affinity metadata", async ({
  page,
}) => {
  await setOverviewTab(page, "Overview");
  await installFrontendIdentityCapture(page);
  const projectContext = await openIsolatedProject(page);
  const revealHighlightsOne = page.locator(
    ".setta-ui-setting-reveal-highlight",
  );
  const pageOneUrl = page.url();
  const frontendIdOne = await waitForFrontendIdentity(page);

  const secondPage = await page.context().newPage();
  await setOverviewTab(secondPage, "Overview");
  await installFrontendIdentityCapture(secondPage);
  await secondPage.goto(pageOneUrl, { waitUntil: "domcontentloaded" });
  const revealHighlightsTwo = secondPage.locator(
    ".setta-ui-setting-reveal-highlight",
  );
  await waitForFrontendIdentity(secondPage);

  try {
    const revealResult = await callMcpTool<RevealUISettingResult>(
      page,
      projectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: WATCH_CODE_ENABLED_SETTING_ID,
        durationMs: 1200,
      },
      frontendIdOne,
      "share-session-e2e",
    );
    expect(revealResult.emittedRevealCount).toBe(1);
    expect(revealResult.statuses[0]?.status).toBe("revealed");

    await expect
      .poll(async () => revealHighlightsOne.count())
      .toBeGreaterThan(0);
    await expect.poll(async () => revealHighlightsTwo.count()).toBe(0);

    await expect
      .poll(async () => revealHighlightsOne.count(), { timeout: 5000 })
      .toBe(0);
  } finally {
    await cleanupIsolatedProject(page, projectContext.projectConfigId);
    await secondPage.close();
  }
});

test("share-scoped reveal_ui_setting fails when origin affinity is missing", async ({
  page,
}) => {
  await setOverviewTab(page, "Overview");
  await installFrontendIdentityCapture(page);
  const projectContext = await openIsolatedProject(page);
  const pageOneUrl = page.url();
  await waitForFrontendIdentity(page);

  const secondPage = await page.context().newPage();
  await setOverviewTab(secondPage, "Overview");
  await installFrontendIdentityCapture(secondPage);
  await secondPage.goto(pageOneUrl, { waitUntil: "domcontentloaded" });
  await waitForFrontendIdentity(secondPage);

  try {
    const revealResult = await callMcpTool<RevealUISettingResult>(
      page,
      projectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: WATCH_CODE_ENABLED_SETTING_ID,
        durationMs: 1200,
      },
      "   ",
      "share-session-e2e",
    );
    expect(revealResult.emittedRevealCount).toBe(0);
    expect(revealResult.statuses[0]?.status).toBe("failed");
    expect(revealResult.statuses[0]?.error?.code).toBe("mutation_failed");
    expect(revealResult.statuses[0]?.error?.message).toContain(
      "multiple frontends are connected",
    );
    expect(revealResult.statuses[0]?.error?.message).toContain(
      "frontendWebsocketId",
    );
  } finally {
    await cleanupIsolatedProject(page, projectContext.projectConfigId);
    await secondPage.close();
  }
});
