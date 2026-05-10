import { expect, type Locator, type Page } from "@playwright/test";

import { getVisibleProjectChatSurface } from "../../helpers";

export const SELECT_ALL_SHORTCUT =
  process.platform === "darwin" ? "Meta+A" : "Control+A";

export async function seedAIStore(
  page: Page,
  patch: Record<string, unknown>,
): Promise<void> {
  await page.evaluate((nextState) => {
    const key = "setta_ai_data";
    let payload: { state: Record<string, unknown>; version: number } = {
      state: {},
      version: 0,
    };
    const raw = window.localStorage.getItem(key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as {
          state?: unknown;
          version?: unknown;
        };
        payload = {
          state:
            parsed && typeof parsed.state === "object" && parsed.state !== null
              ? (parsed.state as Record<string, unknown>)
              : {},
          version: typeof parsed?.version === "number" ? parsed.version : 0,
        };
      } catch {
        payload = { state: {}, version: 0 };
      }
    }
    payload.state = { ...payload.state, ...nextState };
    window.localStorage.setItem(key, JSON.stringify(payload));
  }, patch);
}

export function buildAppGenSkillsResponse(
  skills: Array<Record<string, unknown>>,
  overrides: {
    customSkillCreateRootPath?: string | null;
    customSkillCreateRootActionable?: boolean;
  } = {},
) {
  return {
    skills,
    customSkillCreateRootPath: overrides.customSkillCreateRootPath ?? null,
    customSkillCreateRootActionable:
      overrides.customSkillCreateRootActionable ?? false,
  };
}

export function buildUpsertAppGenCustomSkillResponse({
  skillId,
  created,
  rootPath,
  rootLabel,
  relativePath,
  content,
  description = "",
  isEditable = true,
  editabilityReason = null,
}: {
  skillId: string;
  created: boolean;
  rootPath: string;
  rootLabel: string;
  relativePath: string;
  content: string;
  description?: string;
  isEditable?: boolean;
  editabilityReason?: string | null;
}) {
  const name =
    relativePath === "." ? rootPath.split("/").pop() ?? "skills" : relativePath;
  const skillDocPath =
    relativePath === "."
      ? `${rootPath}/SKILL.md`
      : `${rootPath}/${relativePath}/SKILL.md`;
  return {
    skillId,
    created,
    rootPath,
    skillDocPath,
    skill: {
      skillId,
      name,
      rootLabel,
      rootPath,
      relativePath,
      isEditable,
      editabilityReason,
      description,
    },
    skillContent: {
      skillId,
      content,
      truncated: false,
      originalSizeBytes: Buffer.byteLength(content, "utf8"),
    },
  };
}

export function buildGetLLMResponseResponse(chatId: string) {
  return chatId;
}

export function buildMixedSlashCommandEngineFixture() {
  const llmEngine = {
    id: "engine-setta-e2e",
    name: "Setta LLM",
    engineType: "setta_llm",
    settaLlmConfigId: "e2e-llm",
    externalAgentConfigId: null,
    defaults: {},
  };
  const externalEngine = {
    id: "engine-external-e2e",
    name: "Codex",
    engineType: "external_agent",
    settaLlmConfigId: null,
    externalAgentConfigId: "external-codex",
    defaults: {},
  };
  return {
    llmEngine,
    externalEngine,
    engineConfigs: [llmEngine, externalEngine],
  };
}

export async function mockMixedSlashCommandEngines(
  page: Page,
): Promise<ReturnType<typeof buildMixedSlashCommandEngineFixture>> {
  const fixture = buildMixedSlashCommandEngineFixture();
  await page.route("**/api/getEngineConfigs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(fixture.engineConfigs),
    });
  });
  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {
          "e2e-llm": {
            id: "e2e-llm",
            model: "gpt-4o-mini",
            provider: "openai",
            api_key_env: null,
            base_url: null,
            other_params: null,
            mcpServerIds: [],
            temporary: false,
          },
        },
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: "e2e-llm",
        codexMcpImportedAt: null,
      }),
    });
  });
  return fixture;
}

export async function expectHasEllipsisTruncation(
  locator: Locator,
): Promise<void> {
  await expect(locator).toBeVisible();
  const styleInfo = await locator.evaluate((node) => {
    const element = node as HTMLElement;
    const style = window.getComputedStyle(element);
    return {
      overflowX: style.overflowX,
      textOverflow: style.textOverflow,
      whiteSpace: style.whiteSpace,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    };
  });

  expect(styleInfo.textOverflow).toBe("ellipsis");
  expect(styleInfo.whiteSpace).toBe("nowrap");
  expect(["hidden", "clip"]).toContain(styleInfo.overflowX);
  expect(styleInfo.scrollWidth).toBeGreaterThanOrEqual(styleInfo.clientWidth);
}

export async function openSkillsViewer(page: Page): Promise<Locator> {
  const projectChatSurface = await getVisibleProjectChatSurface(page);
  const settingsButton = projectChatSurface.getByRole("button", {
    name: "Project AI Settings",
  });
  await expect(settingsButton).toBeVisible();
  await settingsButton.evaluate((element: HTMLElement) => {
    element.click();
  });
  await getVisibleProjectChatAuxTestId(
    page,
    "project-chat-settings-open-skills",
  ).click();
  return projectChatSurface;
}

export async function openMcpViewer(page: Page): Promise<Locator> {
  const projectChatSurface = await getVisibleProjectChatSurface(page);
  const settingsButton = projectChatSurface.getByRole("button", {
    name: "Project AI Settings",
  });
  await expect(settingsButton).toBeVisible();
  await settingsButton.evaluate((element: HTMLElement) => {
    element.click();
  });
  await getVisibleProjectChatAuxTestId(
    page,
    "project-chat-settings-open-mcp",
  ).click();
  return projectChatSurface;
}

export async function openSlashCommandsViewer(page: Page): Promise<Locator> {
  const projectChatSurface = await getVisibleProjectChatSurface(page);
  const settingsButton = projectChatSurface.getByRole("button", {
    name: "Project AI Settings",
  });
  await expect(settingsButton).toBeVisible();
  await settingsButton.evaluate((element: HTMLElement) => {
    element.click();
  });
  await getVisibleProjectChatAuxTestId(
    page,
    "project-chat-settings-open-slash-commands",
  ).click();
  return projectChatSurface;
}

export async function closeSkillsMcpViewer(page: Page): Promise<void> {
  const projectChatSurface = await getVisibleProjectChatSurface(page);
  const returnToChatButton = projectChatSurface.getByRole("button", {
    name: "Return to chat",
  });
  await expect(returnToChatButton).toBeVisible();
  await returnToChatButton.evaluate((element: HTMLElement) => {
    element.click();
  });
}

export async function openRawSkillMarkdown(page: Page): Promise<Locator> {
  const projectChatSurface = await getVisibleProjectChatSurface(page);
  await projectChatSurface
    .getByRole("button", { name: "Skill Markdown Viewer" })
    .click();
  await projectChatSurface
    .getByTestId("project-chat-skill-markdown-view-raw")
    .click();
  return projectChatSurface;
}

export async function clickSkillMarkdownViewToggle(
  page: Page,
  testId:
    | "project-chat-skill-markdown-view-raw"
    | "project-chat-skill-markdown-view-rendered",
): Promise<void> {
  const toggle = getVisibleProjectChatAuxTestId(page, testId);
  await expect(toggle).toBeVisible();
  await toggle.evaluate((element: HTMLElement) => {
    element.click();
  });
}

export function getVisibleProjectChatAuxTestId(
  page: Page,
  testId: string,
): Locator {
  return page.locator(`[data-testid="${testId}"]:visible`).first();
}
