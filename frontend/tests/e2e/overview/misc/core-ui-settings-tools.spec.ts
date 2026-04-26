import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  openIsolatedProject,
  setOverviewTab,
} from "../../helpers";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const WATCH_CODE_FILES_SETTING_ID = "plugin::setta-watch-code::files";
const PROJECT_AI_LLM_API_KEYS_SETTING_ID =
  "core.project_ai_settings.llm_api_keys";
const PROJECT_AI_AGENT_PROFILES_SETTING_ID =
  "core.project_ai_settings.agent_profiles";
const PROJECT_AI_PROMPT_TEMPLATES_SETTING_ID =
  "core.project_ai_settings.prompt_templates";
const PROJECT_AI_EXTERNAL_AGENTS_SETTING_ID =
  "core.project_ai_settings.external_agents";
const PROJECT_NAME_SETTING_ID = "core.project.name";
const PYTHON_CODEGEN_SETTING_ID =
  "core.run_instructions.python_codegen_enabled";

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
  error?: ToolError | null;
};

type SetUISettingValueResult = {
  newValue: unknown;
  changed: boolean;
  error?: ToolError | null;
};

type RevealUISettingResult = {
  emittedRevealCount: number;
  statuses: Array<{
    status: "revealed" | "failed";
    error?: ToolError | null;
  }>;
};

type ProjectMetadataResponse = {
  projectMetadata: Array<{
    id: string;
    name: string;
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

function expectNoToolError(error: ToolError | null | undefined): void {
  expect(error ?? null).toBeNull();
}

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

async function disableProjectChatWindows(page: Page): Promise<void> {
  await page.route("**/api/loadSettings", async (route) => {
    const response = await route.fetch();
    const settings = (await response.json()) as {
      chatWindowing?: Record<string, unknown>;
    };
    await route.fulfill({
      response,
      contentType: "application/json",
      body: JSON.stringify({
        ...settings,
        chatWindowing: {
          ...(settings.chatWindowing ?? {}),
          autoCreateInitialChat: false,
        },
      }),
    });
  });
  await page.route("**/api/loadProjectConfig", async (route) => {
    const response = await route.fetch();
    const projectState = (await response.json()) as {
      projectChatWindowing?: Record<string, unknown>;
    };
    await route.fulfill({
      response,
      contentType: "application/json",
      body: JSON.stringify({
        ...projectState,
        projectChatWindowing: {
          order: [],
          instancesById: {},
        },
      }),
    });
  });
}

test("core project-name UI setting persists metadata after rename", async ({
  page,
}) => {
  await setOverviewTab(page, "Overview");
  const projectContext = await openIsolatedProject(page);

  try {
    const initialValueResult = await callMcpTool<GetUISettingValueResult>(
      page,
      projectContext.projectConfigId,
      "get_ui_setting_value",
      {
        settingId: PROJECT_NAME_SETTING_ID,
      },
    );
    expectNoToolError(initialValueResult.error);
    if (typeof initialValueResult.value !== "string") {
      throw new Error(
        `Expected string value for ${PROJECT_NAME_SETTING_ID}, got: ${JSON.stringify(initialValueResult)}`,
      );
    }
    const renamedProjectName = `${initialValueResult.value}-mcp`;

    const renameResult = await callMcpTool<SetUISettingValueResult>(
      page,
      projectContext.projectConfigId,
      "set_ui_setting_value",
      {
        settingId: PROJECT_NAME_SETTING_ID,
        value: renamedProjectName,
      },
    );
    expectNoToolError(renameResult.error);
    expect(renameResult.newValue).toBe(renamedProjectName);

    const metadataAfterRenameResponse = await page.request.post(
      `${BACKEND_ORIGIN}/api/loadAllProjectMetadata`,
      {
        data: {},
        timeout: 15000,
      },
    );
    expect(metadataAfterRenameResponse.ok()).toBeTruthy();
    const metadataAfterRename =
      (await metadataAfterRenameResponse.json()) as ProjectMetadataResponse;
    const renamedEntry = metadataAfterRename.projectMetadata.find(
      (entry) => entry.id === projectContext.projectConfigId,
    );
    expect(renamedEntry?.name).toBe(renamedProjectName);

    const renamedProjectUrl = new URL(page.url());
    renamedProjectUrl.pathname = `/${encodeURIComponent(renamedProjectName)}`;
    await page.goto(renamedProjectUrl.toString(), {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector(".canvas-flow__canvas");

    const metadataAfterReloadResponse = await page.request.post(
      `${BACKEND_ORIGIN}/api/loadAllProjectMetadata`,
      {
        data: {},
        timeout: 15000,
      },
    );
    expect(metadataAfterReloadResponse.ok()).toBeTruthy();
    const metadataAfterReload =
      (await metadataAfterReloadResponse.json()) as ProjectMetadataResponse;
    const reloadedEntry = metadataAfterReload.projectMetadata.find(
      (entry) => entry.id === projectContext.projectConfigId,
    );
    expect(reloadedEntry?.name).toBe(renamedProjectName);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("core UI-setting tools support search/get/set/reveal and validation errors", async ({
  page,
}) => {
  await disableProjectChatWindows(page);
  await setOverviewTab(page, "Overview");
  const projectContext = await openIsolatedProject(page);

  try {
    const searchResult = await callMcpTool<SearchUISettingsResult>(
      page,
      projectContext.projectConfigId,
      "search_ui_settings",
      {
        query: "watch code enabled",
        sourceFilter: "plugin",
        limit: 5,
      },
    );
    const matchedSettingIds = searchResult.results
      .map((entry) => entry.settingId)
      .filter(
        (settingId): settingId is string => typeof settingId === "string",
      );
    expect(matchedSettingIds).toContain(WATCH_CODE_FILES_SETTING_ID);

    const initialValueResult = await callMcpTool<GetUISettingValueResult>(
      page,
      projectContext.projectConfigId,
      "get_ui_setting_value",
      {
        settingId: WATCH_CODE_FILES_SETTING_ID,
      },
    );
    expectNoToolError(initialValueResult.error);
    if (typeof initialValueResult.value !== "boolean") {
      throw new Error(
        `Expected boolean value for ${WATCH_CODE_FILES_SETTING_ID}, got: ${JSON.stringify(initialValueResult)}`,
      );
    }
    const nextValue = !initialValueResult.value;

    const setResult = await callMcpTool<SetUISettingValueResult>(
      page,
      projectContext.projectConfigId,
      "set_ui_setting_value",
      {
        settingId: WATCH_CODE_FILES_SETTING_ID,
        value: nextValue,
      },
    );
    expectNoToolError(setResult.error);
    expect(setResult.changed).toBe(true);
    expect(setResult.newValue).toBe(nextValue);

    const updatedValueResult = await callMcpTool<GetUISettingValueResult>(
      page,
      projectContext.projectConfigId,
      "get_ui_setting_value",
      {
        settingId: WATCH_CODE_FILES_SETTING_ID,
      },
    );
    expectNoToolError(updatedValueResult.error);
    expect(updatedValueResult.value).toBe(nextValue);

    const revealResult = await callMcpTool<RevealUISettingResult>(
      page,
      projectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: WATCH_CODE_FILES_SETTING_ID,
        durationMs: 8000,
      },
    );
    expect(revealResult.emittedRevealCount).toBe(1);
    expect(revealResult.statuses[0]?.status).toBe("revealed");
    expectNoToolError(revealResult.statuses[0]?.error);

    const watchCodeHeading = page.getByRole("heading", { name: "Watch Code" });
    await expect(watchCodeHeading).toBeVisible();

    const toggleButton = page.locator(
      '[data-setting-anchor="plugin::setta-watch-code::files"]',
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
        settingId: WATCH_CODE_FILES_SETTING_ID,
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
    expectNoToolError(projectAiGetResult.error);
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

    const projectAiPromptTemplatesContent = page.getByTestId(
      "project-ai-settings-accordion-prompt-templates-content",
    );
    const projectAiLlmApiKeysContent = page.getByTestId(
      "project-ai-settings-accordion-llm-api-keys-content",
    );
    const projectAiAgentProfilesContent = page.getByTestId(
      "project-ai-settings-accordion-agent-profiles-content",
    );
    const projectAiExternalAgentsContent = page.getByTestId(
      "project-ai-settings-accordion-external-agents-content",
    );
    const runInstructionsCodegenTargetsContent = page.getByTestId(
      "run-instructions-accordion-codegen-targets-content",
    );
    const llmApiKeysAccordionTrigger = page.getByTestId(
      "project-ai-settings-accordion-llm-api-keys",
    );
    const agentProfilesAccordionTrigger = page.getByTestId(
      "project-ai-settings-accordion-agent-profiles",
    );
    await expect(projectAiPromptTemplatesContent).toHaveCount(0);
    await expect(projectAiExternalAgentsContent).toHaveCount(0);
    await expect(runInstructionsCodegenTargetsContent).toHaveCount(0);

    const llmApiKeysInitialReveal = await callMcpTool<RevealUISettingResult>(
      page,
      projectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: PROJECT_AI_LLM_API_KEYS_SETTING_ID,
        durationMs: 8000,
      },
    );
    expect(llmApiKeysInitialReveal.emittedRevealCount).toBe(1);
    expect(llmApiKeysInitialReveal.statuses[0]?.status).toBe("revealed");
    await expect(projectAiLlmApiKeysContent).toBeVisible();
    await llmApiKeysAccordionTrigger.click();
    await expect(projectAiLlmApiKeysContent).toHaveCount(0);
    const llmApiKeysReveal = await callMcpTool<RevealUISettingResult>(
      page,
      projectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: PROJECT_AI_LLM_API_KEYS_SETTING_ID,
        durationMs: 8000,
      },
    );
    expect(llmApiKeysReveal.emittedRevealCount).toBe(1);
    expect(llmApiKeysReveal.statuses[0]?.status).toBe("revealed");
    await expect(projectAiLlmApiKeysContent).toBeVisible();
    await expect(
      page.locator(
        '[data-setting-anchor="core.project_ai_settings.llm_api_keys"]',
      ),
    ).toBeVisible();

    const agentProfilesInitialReveal = await callMcpTool<RevealUISettingResult>(
      page,
      projectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: PROJECT_AI_AGENT_PROFILES_SETTING_ID,
        durationMs: 8000,
      },
    );
    expect(agentProfilesInitialReveal.emittedRevealCount).toBe(1);
    expect(agentProfilesInitialReveal.statuses[0]?.status).toBe("revealed");
    await expect(projectAiAgentProfilesContent).toBeVisible();
    await agentProfilesAccordionTrigger.click();
    await expect(projectAiAgentProfilesContent).toHaveCount(0);
    const agentProfilesReveal = await callMcpTool<RevealUISettingResult>(
      page,
      projectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: PROJECT_AI_AGENT_PROFILES_SETTING_ID,
        durationMs: 8000,
      },
    );
    expect(agentProfilesReveal.emittedRevealCount).toBe(1);
    expect(agentProfilesReveal.statuses[0]?.status).toBe("revealed");
    await expect(projectAiAgentProfilesContent).toBeVisible();
    await expect(
      page.locator(
        '[data-setting-anchor="core.project_ai_settings.agent_profiles"]',
      ),
    ).toBeVisible();

    const promptTemplatesReveal = await callMcpTool<RevealUISettingResult>(
      page,
      projectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: PROJECT_AI_PROMPT_TEMPLATES_SETTING_ID,
        durationMs: 8000,
      },
    );
    expect(promptTemplatesReveal.emittedRevealCount).toBe(1);
    expect(promptTemplatesReveal.statuses[0]?.status).toBe("revealed");
    await expect(projectAiPromptTemplatesContent).toBeVisible();
    await expect(
      page.locator(
        '[data-setting-anchor="core.project_ai_settings.prompt_templates"]',
      ),
    ).toBeVisible();

    const externalAgentsReveal = await callMcpTool<RevealUISettingResult>(
      page,
      projectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: PROJECT_AI_EXTERNAL_AGENTS_SETTING_ID,
        durationMs: 8000,
      },
    );
    expect(externalAgentsReveal.emittedRevealCount).toBe(1);
    expect(externalAgentsReveal.statuses[0]?.status).toBe("revealed");
    await expect(projectAiExternalAgentsContent).toBeVisible();
    await expect(
      page.locator(
        '[data-setting-anchor="core.project_ai_settings.external_agents"]',
      ),
    ).toBeVisible();

    const pythonCodegenReveal = await callMcpTool<RevealUISettingResult>(
      page,
      projectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: PYTHON_CODEGEN_SETTING_ID,
        durationMs: 8000,
      },
    );
    expect(pythonCodegenReveal.emittedRevealCount).toBe(1);
    expect(pythonCodegenReveal.statuses[0]?.status).toBe("revealed");
    await expect(runInstructionsCodegenTargetsContent).toBeVisible();
    await expect(
      page.locator(
        '[data-setting-anchor="core.run_instructions.python_codegen_enabled"]',
      ),
    ).toBeVisible();
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("core reveal_ui_setting fails when requested project does not match active project", async ({
  page,
}) => {
  await setOverviewTab(page, "Overview");
  let firstProjectContext: Awaited<
    ReturnType<typeof openIsolatedProject>
  > | null = null;
  let secondProjectContext: Awaited<
    ReturnType<typeof openIsolatedProject>
  > | null = null;

  try {
    firstProjectContext = await openIsolatedProject(page);
    secondProjectContext = await openIsolatedProject(page);

    const revealResult = await callMcpTool<RevealUISettingResult>(
      page,
      firstProjectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: WATCH_CODE_FILES_SETTING_ID,
        durationMs: 5000,
      },
    );
    expect(revealResult.emittedRevealCount).toBe(0);
    expect(revealResult.statuses[0]?.status).toBe("failed");
    expect(revealResult.statuses[0]?.error?.code).toBe("mutation_failed");
    expect(revealResult.statuses[0]?.error?.message).toContain(
      `requested project ${firstProjectContext.projectConfigId} but active project is ${secondProjectContext.projectConfigId}`,
    );
    await expect(
      page.locator(".setta-ui-setting-reveal-highlight"),
    ).toHaveCount(0);
  } finally {
    await cleanupIsolatedProject(page, secondProjectContext);
    await cleanupIsolatedProject(page, firstProjectContext);
  }
});

test("core UI-setting tools reject explicit projectConfigId mismatches against agentic context", async ({
  page,
}) => {
  await setOverviewTab(page, "Overview");
  let firstProjectContext: Awaited<
    ReturnType<typeof openIsolatedProject>
  > | null = null;
  let secondProjectContext: Awaited<
    ReturnType<typeof openIsolatedProject>
  > | null = null;

  try {
    firstProjectContext = await openIsolatedProject(page);
    secondProjectContext = await openIsolatedProject(page);

    const mismatchMessage = "does not match agentic context projectConfigId";
    const mismatchResponse = await page.request.post(
      `${BACKEND_ORIGIN}/__setta__/tools/call`,
      {
        data: {
          tool: "get_ui_setting_value",
          arguments: {
            settingId: WATCH_CODE_FILES_SETTING_ID,
            projectConfigId: firstProjectContext.projectConfigId,
          },
          agenticContext: {
            projectConfigId: secondProjectContext.projectConfigId,
            allowUnscoped: true,
          },
        },
        timeout: 15000,
      },
    );
    expect(mismatchResponse.status()).toBe(200);
    const mismatchPayload =
      (await mismatchResponse.json()) as CallToolResponse<{
        code?: string;
        message?: string;
      }>;
    expect(mismatchPayload.isError).toBe(true);
    expect(mismatchPayload.structuredContent?.code).toBe("invalid_arguments");
    expect(mismatchPayload.structuredContent?.message ?? "").toContain(
      "projectConfigId argument",
    );
    expect(mismatchPayload.structuredContent?.message ?? "").toContain(
      mismatchMessage,
    );
  } finally {
    await cleanupIsolatedProject(page, secondProjectContext);
    await cleanupIsolatedProject(page, firstProjectContext);
  }
});

test("core UI-setting tools normalize whitespace-padded setting ids", async ({
  page,
}) => {
  await setOverviewTab(page, "Overview");
  const projectContext = await openIsolatedProject(page);
  const paddedSettingId = `  ${WATCH_CODE_FILES_SETTING_ID}\t`;

  try {
    const initialGetResult = await callMcpTool<GetUISettingValueResult>(
      page,
      projectContext.projectConfigId,
      "get_ui_setting_value",
      {
        settingId: paddedSettingId,
      },
    );
    expectNoToolError(initialGetResult.error);
    if (typeof initialGetResult.value !== "boolean") {
      throw new Error(
        `Expected boolean value for ${WATCH_CODE_FILES_SETTING_ID}, got: ${JSON.stringify(initialGetResult)}`,
      );
    }
    const nextValue = !initialGetResult.value;

    const setResult = await callMcpTool<SetUISettingValueResult>(
      page,
      projectContext.projectConfigId,
      "set_ui_setting_value",
      {
        settingId: paddedSettingId,
        value: nextValue,
      },
    );
    expectNoToolError(setResult.error);
    expect(setResult.newValue).toBe(nextValue);

    const revealResult = await callMcpTool<RevealUISettingResult>(
      page,
      projectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: paddedSettingId,
        durationMs: 8000,
      },
    );
    expect(revealResult.emittedRevealCount).toBe(1);
    expect(revealResult.statuses[0]?.status).toBe("revealed");
    expectNoToolError(revealResult.statuses[0]?.error);

    const settingAnchor = page.locator(
      '[data-setting-anchor="plugin::setta-watch-code::files"]',
    );
    await expect(settingAnchor).toBeVisible();
    await expect(settingAnchor).toHaveClass(
      /setta-ui-setting-reveal-highlight/,
    );
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
