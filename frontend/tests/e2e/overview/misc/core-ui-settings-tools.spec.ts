import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  openIsolatedProject,
  setOverviewTab,
} from "../../helpers";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const WATCH_CODE_ENABLED_SETTING_ID = "core.watch_code.enabled";
const PROJECT_AI_PROMPT_TEMPLATES_SETTING_ID =
  "core.project_ai_settings.prompt_templates";

type ToolError = {
  code: string;
  message: string;
};

type SearchUISettingsResult = {
  results: Array<{
    settingId?: string;
  }>;
};

type GetUISettingValueResult = {
  value: unknown;
  error: ToolError | null;
};

type SetUISettingValueResult = {
  newValue: unknown;
  changed: boolean;
  error: ToolError | null;
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

test("core UI-setting tools support search/get/set/reveal and validation errors", async ({
  page,
}) => {
  await setOverviewTab(page, "Overview");
  const projectContext = await openIsolatedProject(page);

  try {
    const searchResult = await callMcpTool<SearchUISettingsResult>(
      page,
      projectContext.projectConfigId,
      "search_ui_settings",
      {
        query: "watch code enabled",
        sourceFilter: "core",
        limit: 5,
      },
    );
    const matchedSettingIds = searchResult.results
      .map((entry) => entry.settingId)
      .filter(
        (settingId): settingId is string => typeof settingId === "string",
      );
    expect(matchedSettingIds).toContain(WATCH_CODE_ENABLED_SETTING_ID);

    const initialValueResult = await callMcpTool<GetUISettingValueResult>(
      page,
      projectContext.projectConfigId,
      "get_ui_setting_value",
      {
        settingId: WATCH_CODE_ENABLED_SETTING_ID,
      },
    );
    expect(initialValueResult.error).toBeNull();
    if (typeof initialValueResult.value !== "boolean") {
      throw new Error(
        `Expected boolean value for ${WATCH_CODE_ENABLED_SETTING_ID}, got: ${JSON.stringify(initialValueResult)}`,
      );
    }
    const nextValue = !initialValueResult.value;

    const setResult = await callMcpTool<SetUISettingValueResult>(
      page,
      projectContext.projectConfigId,
      "set_ui_setting_value",
      {
        settingId: WATCH_CODE_ENABLED_SETTING_ID,
        value: nextValue,
      },
    );
    expect(setResult.error).toBeNull();
    expect(setResult.changed).toBe(true);
    expect(setResult.newValue).toBe(nextValue);

    const updatedValueResult = await callMcpTool<GetUISettingValueResult>(
      page,
      projectContext.projectConfigId,
      "get_ui_setting_value",
      {
        settingId: WATCH_CODE_ENABLED_SETTING_ID,
      },
    );
    expect(updatedValueResult.error).toBeNull();
    expect(updatedValueResult.value).toBe(nextValue);

    const revealResult = await callMcpTool<RevealUISettingResult>(
      page,
      projectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: WATCH_CODE_ENABLED_SETTING_ID,
        durationMs: 8000,
      },
    );
    expect(revealResult.emittedRevealCount).toBe(1);
    expect(revealResult.statuses[0]?.status).toBe("revealed");
    expect(revealResult.statuses[0]?.error).toBeNull();

    const watchCodeHeading = page.getByRole("heading", { name: "Watch Code" });
    await expect(watchCodeHeading).toBeVisible();

    const toggleButton = page.locator(
      '[data-setting-anchor="core.watch_code.enabled"]',
    );
    await expect(toggleButton).toBeVisible();
    await expect(toggleButton).toHaveAttribute(
      "aria-pressed",
      String(nextValue),
    );
    await expect(toggleButton).toHaveClass(/setta-ui-setting-reveal-highlight/);

    const invalidSetResult = await callMcpTool<SetUISettingValueResult>(
      page,
      projectContext.projectConfigId,
      "set_ui_setting_value",
      {
        settingId: WATCH_CODE_ENABLED_SETTING_ID,
        value: "invalid-boolean-value",
      },
    );
    expect(invalidSetResult.error?.code).toBe("invalid_value_type");

    const projectAiGetResult = await callMcpTool<GetUISettingValueResult>(
      page,
      projectContext.projectConfigId,
      "get_ui_setting_value",
      {
        settingId: PROJECT_AI_PROMPT_TEMPLATES_SETTING_ID,
      },
    );
    expect(projectAiGetResult.error).toBeNull();
    expect(typeof projectAiGetResult.value).toBe("number");

    const projectAiSetResult = await callMcpTool<SetUISettingValueResult>(
      page,
      projectContext.projectConfigId,
      "set_ui_setting_value",
      {
        settingId: PROJECT_AI_PROMPT_TEMPLATES_SETTING_ID,
        value: 0,
      },
    );
    expect(projectAiSetResult.error?.code).toBe("setting_read_only");

  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
