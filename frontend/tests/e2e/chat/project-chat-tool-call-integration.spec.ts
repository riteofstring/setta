import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
  setOverviewTab,
} from "../helpers";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const AGENT_INTEGRATION_SKIP_REASON =
  "Agent integration tests are opt-in; set SETTA_RUN_AGENT_INTEGRATION_TESTS=1 to run.";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY?.trim() ?? "";

type EngineConfig = {
  id: string;
  name: string;
  engineType: string;
  settaLlmConfigId?: string | null;
};
type AllLLMConfigs = {
  configs?: Record<
    string,
    { model: string; provider?: string; api_key_env?: string | null }
  >;
  default_config_id?: string | null;
};
type ToolCallLeakMonitorResult = {
  sawLeak: boolean;
  samples: string[];
};

test.describe.serial("project chat tool call integration", () => {
  test.skip(!agentIntegrationTestsEnabled(), AGENT_INTEGRATION_SKIP_REASON);
  test.skip(!ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY not set");
  test.setTimeout(420_000);

  test("uses default setta llm config and renders tool calls in project chat", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      // The E2E runner uses a temp workspace; seed this run's Anthropic key into
      // that workspace so the default claude-sonnet config becomes selectable.
      await postBackend(page, "/llm/apiKeys", {
        apiKeys: { ANTHROPIC_API_KEY },
      });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector(".react-flow__pane");

      const llmConfig = await getBackend<AllLLMConfigs>(
        page.request,
        "/llm/config",
      );
      if (!llmConfig) {
        throw new Error("Missing LLM config payload.");
      }
      expect(llmConfig.default_config_id).toBe("claude-sonnet");

      const engineConfigs = await getBackend<EngineConfig[]>(
        page.request,
        "/getEngineConfigs",
      );
      if (!engineConfigs) {
        throw new Error("Missing engine config payload.");
      }
      const defaultSettaEngine = engineConfigs.find(
        (config) =>
          config.engineType === "setta_llm" &&
          config.settaLlmConfigId === "claude-sonnet",
      );
      if (!defaultSettaEngine) {
        throw new Error(
          "Missing Setta LLM engine config wired to claude-sonnet.",
        );
      }

      const overviewPane = page.locator("#OverviewPane");
      await expect(
        overviewPane.getByRole("heading", { name: "Project AI Chat" }),
      ).toBeVisible();

      const chatInput = overviewPane.getByPlaceholder("Type a message...");
      await expect(chatInput).toBeVisible();
      await expect(chatInput).toBeEnabled();
      await installToolCallLeakMonitor(page);

      const sectionName = `PW Tool Call ${Date.now()}`;
      const prompt = [
        "Use Setta MCP tools now.",
        `Create exactly one top-level TextBlock section named "${sectionName}".`,
        'Do not ask follow-up questions. After tool calls complete, reply with exactly "done".',
      ].join(" ");

      const submitLlmRequestPromise = page.waitForRequest((request) => {
        return (
          request.url().includes("/api/getLLMResponse") &&
          request.method() === "POST"
        );
      });

      await chatInput.fill(prompt);
      await chatInput.press("Enter");
      await expect(chatInput).toHaveValue("", { timeout: 20_000 });

      // Verify this test really runs through the default Setta LLM engine path.
      const submitLlmRequest = await submitLlmRequestPromise;
      const requestPayload = parsePayloadObject(submitLlmRequest.postData());
      expect(requestPayload.engineConfigId).toBe(defaultSettaEngine.id);
      await expect(
        overviewPane.getByText("<function_calls>", { exact: false }),
      ).toHaveCount(0);

      const renderedToolCall = overviewPane
        .getByText(/(setta\.)?(create_top_level_section|set_section_name)/)
        .first();
      await expect(renderedToolCall).toBeVisible({ timeout: 240_000 });

      await renderedToolCall.click();
      await expect(overviewPane.getByText("Arguments")).toBeVisible({
        timeout: 30_000,
      });
      await expect(overviewPane.getByText("Result")).toBeVisible({
        timeout: 30_000,
      });
      const leakMonitorResult = await stopToolCallLeakMonitor(page);
      expect(
        leakMonitorResult.sawLeak,
        `Raw tool-call text leaked into chat output: ${leakMonitorResult.samples.join(
          " | ",
        )}`,
      ).toBeFalsy();

      const createdSectionTitle = page
        .locator('section[class*="card-section"] header.section-title p')
        .filter({ hasText: sectionName })
        .first();
      await expect(createdSectionTitle).toBeVisible({ timeout: 240_000 });
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});

function agentIntegrationTestsEnabled(): boolean {
  const value = process.env.SETTA_RUN_AGENT_INTEGRATION_TESTS;
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function parsePayloadObject(
  rawPayload: string | null,
): Record<string, unknown> {
  if (!rawPayload) {
    throw new Error("Missing request payload.");
  }
  const parsed: unknown = JSON.parse(rawPayload);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid request payload.");
  }
  return parsed as Record<string, unknown>;
}

async function getBackend<T>(
  request: APIRequestContext,
  path: string,
): Promise<T | null> {
  const response = await request.get(`${BACKEND_ORIGIN}/api${path}`);
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

async function installToolCallLeakMonitor(page: Page): Promise<void> {
  await page.evaluate(() => {
    const monitor = {
      sawLeak: false,
      samples: [] as string[],
      observer: null as MutationObserver | null,
    };
    const sanitize = (text: string): string =>
      text.replace(/\s+/gu, " ").trim().slice(0, 200);
    const hasToolMarkup = (text: string): boolean =>
      /<\s*\/?\s*(function_calls|invoke|parameter)\b/iu.test(text) ||
      /&lt;\s*\/?\s*(function_calls|invoke|parameter)\b/iu.test(text);
    const checkForLeaks = (): void => {
      const pane = document.querySelector("#OverviewPane");
      if (!pane) {
        return;
      }
      const content = pane.textContent ?? "";
      if (!hasToolMarkup(content)) {
        return;
      }
      monitor.sawLeak = true;
      if (monitor.samples.length < 5) {
        monitor.samples.push(sanitize(content));
      }
    };
    checkForLeaks();
    monitor.observer = new MutationObserver(() => {
      checkForLeaks();
    });
    monitor.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    (
      window as Window & {
        __settaToolCallLeakMonitor?: typeof monitor;
      }
    ).__settaToolCallLeakMonitor = monitor;
  });
}

async function stopToolCallLeakMonitor(
  page: Page,
): Promise<ToolCallLeakMonitorResult> {
  return page.evaluate(() => {
    const windowWithMonitor = window as Window & {
      __settaToolCallLeakMonitor?: {
        sawLeak: boolean;
        samples: string[];
        observer: MutationObserver | null;
      };
    };
    const monitor = windowWithMonitor.__settaToolCallLeakMonitor;
    if (!monitor) {
      return { sawLeak: false, samples: [] };
    }
    monitor.observer?.disconnect();
    delete windowWithMonitor.__settaToolCallLeakMonitor;
    return {
      sawLeak: monitor.sawLeak,
      samples: Array.isArray(monitor.samples) ? monitor.samples : [],
    };
  });
}
