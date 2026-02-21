import { expect, test, type Page } from "@playwright/test";

import {
  allowExpectedApiError,
  ensureAppReady,
  seedLocalStorage,
} from "../../helpers";

type McpRuntimeState =
  | "connected"
  | "connecting"
  | "retrying"
  | "error"
  | "disabled"
  | "unknown";

type McpRuntimeServer = {
  serverId: string;
  source: string;
  transport: string;
  endpoint: string;
  state: McpRuntimeState;
  lastAttemptAt: string | null;
  lastConnectedAt: string | null;
  lastFailureAt: string | null;
  consecutiveFailures: number;
  lastError: string | null;
  missingEnvVar: string | null;
  toolCount: number;
};

type McpRuntimeStatusResponse = {
  llmConfigPath: string;
  activeSettaFilesLocation: string | null;
  servers: McpRuntimeServer[];
  externalServers: McpRuntimeServer[];
};

function buildMcpRuntimeServer(
  overrides: Partial<McpRuntimeServer> & { serverId: string },
): McpRuntimeServer {
  return {
    serverId: overrides.serverId,
    source: overrides.source ?? "setta_mcp",
    transport: overrides.transport ?? "sse",
    endpoint: overrides.endpoint ?? "http://127.0.0.1:8000/mcp",
    state: overrides.state ?? "unknown",
    lastAttemptAt: overrides.lastAttemptAt ?? null,
    lastConnectedAt: overrides.lastConnectedAt ?? null,
    lastFailureAt: overrides.lastFailureAt ?? null,
    consecutiveFailures: overrides.consecutiveFailures ?? 0,
    lastError: overrides.lastError ?? null,
    missingEnvVar: overrides.missingEnvVar ?? null,
    toolCount: overrides.toolCount ?? 0,
  };
}

function buildMcpRuntimeStatusResponse(
  overrides: Partial<McpRuntimeStatusResponse> = {},
): McpRuntimeStatusResponse {
  return {
    llmConfigPath: "/workspace/setta_files/llm_config.json",
    activeSettaFilesLocation: "local",
    servers: [],
    externalServers: [],
    ...overrides,
  };
}

async function mockMcpRuntimeStatusRoute(
  page: Page,
  options: {
    status?: number;
    delayMs?: number;
    detail?: string;
    payload?: McpRuntimeStatusResponse;
  } = {},
): Promise<void> {
  const {
    status = 200,
    delayMs = 0,
    detail = "Unavailable",
    payload = buildMcpRuntimeStatusResponse(),
  } = options;
  await page.route("**/api/mcpServerRuntimeStatus", async (route) => {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    if (status !== 200) {
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ detail }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });
}

test("project ai chat can open the skills and mcp viewer side view", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          skillId: "workspace_agents_skills::ui-layout",
          name: "ui-layout",
          rootLabel: "Workspace .agents/skills",
          rootPath: "/workspace/.agents/skills",
          relativePath: "ui-layout",
          description: "Create dense dashboard layouts.",
        },
        {
          skillId: "user_claude_skills::frontend-design",
          name: "frontend-design",
          rootLabel: "User ~/.claude/skills",
          rootPath: "/home/.claude/skills",
          relativePath: "frontend-design",
          description: "Create polished frontend interfaces.",
        },
      ]),
    });
  });

  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {
          setta: {
            transport: "sse",
            url: "http://127.0.0.1:8000/mcp",
          },
          context7: {
            transport: "stdio",
            command: "npx",
            args: ["-y", "@upstash/context7-mcp"],
          },
        },
        defaultMcpServerIds: ["setta", "context7"],
        default_config_id: null,
      }),
    });
  });

  await page.route("**/api/getAppGenSkillContent", async (route) => {
    const payload = route.request().postDataJSON() as { skillId?: string };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillId: payload.skillId ?? "workspace_agents_skills::ui-layout",
        content: "# UI Layout\n\nCreate dense dashboard layouts.",
      }),
    });
  });
  await mockMcpRuntimeStatusRoute(page, {
    payload: buildMcpRuntimeStatusResponse({
      servers: [
        buildMcpRuntimeServer({
          serverId: "setta",
          state: "connected",
          transport: "sse",
          endpoint: "http://127.0.0.1:8000/mcp",
          toolCount: 12,
        }),
      ],
      externalServers: [
        buildMcpRuntimeServer({
          serverId: "context7",
          source: "external_runtime",
          state: "unknown",
          transport: "stdio",
          endpoint: "npx @upstash/context7-mcp",
        }),
      ],
    }),
  });

  await ensureAppReady(page);

  const toggleButton = page.getByRole("button", {
    name: "View Skills and MCP",
  });
  await expect(toggleButton).toBeVisible();
  await toggleButton.click();

  await expect(page.getByText(/^Skills$/)).toBeVisible();
  await expect(page.getByText("/workspace/.agents/skills")).toBeVisible();
  await expect(page.getByText("/home/.claude/skills")).toBeVisible();
  await expect(page.getByRole("button", { name: /ui-layout/i })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /frontend-design/i }),
  ).toBeVisible();
  const skillMarkdownToggle = page.getByRole("button", {
    name: "Skill Markdown Viewer",
  });
  await expect(skillMarkdownToggle).toBeVisible();
  await expect(skillMarkdownToggle).toHaveAttribute("aria-expanded", "false");
  await skillMarkdownToggle.click();
  await expect(skillMarkdownToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByLabel("Skill Markdown Content")).toContainText(
    "Create dense dashboard layouts.",
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.localStorage.getItem(
          "setta.projectChatSkillsMcpViewer.skillMarkdownViewerOpen",
        ),
      ),
    )
    .toBe("true");
  await expect(page.getByText(/setta_files\/llm_config\.json/)).toBeVisible();
  await expect(
    page.getByText(/Active (local|global) setta_files/),
  ).toBeVisible();
  await expect(page.getByText(/setta.*sse/i)).toBeVisible();
  await expect(page.getByText(/context7.*stdio/i)).toBeVisible();
  await expect(page.getByText(/0 disabled/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copy path for Workspace .agents/skills" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Reveal path for Workspace .agents/skills",
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Filter MCP tools")).toHaveCount(0);
  await expect(page.getByText("Viewer only:")).toHaveCount(0);
  await expect(page.getByText("MCP tools discovered:")).toHaveCount(0);
  await expect(page.getByText("MCP servers configured:")).toHaveCount(0);

  await page.getByLabel("View Skills and MCP").click();
  await expect(page.getByText(/^Skills$/)).toHaveCount(0);
});

test("project ai chat does not mark skills active for non-skill tool names", async ({
  page,
}) => {
  const externalEngineConfigId = "engine-codex";
  const externalAgentConfigId = "external-codex";
  const chatId = "chat-skill-false-positive";
  let externalChatRequestCount = 0;

  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  await page.route("**/api/getEngineConfigs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: externalEngineConfigId,
          name: "Codex Engine",
          engineType: "external_agent",
          externalAgentConfigId,
          defaults: {},
        },
      ]),
    });
  });

  await page.route("**/api/getExternalAgentConfigs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: externalAgentConfigId,
          name: "Codex app-server",
          toolType: "codex",
          runMode: "app_server",
        },
      ]),
    });
  });

  await page.route("**/api/getExternalAgentHealth", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          configId: externalAgentConfigId,
          name: "Codex app-server",
          toolType: "codex",
          runMode: "app_server",
          supported: true,
          available: true,
          issues: [],
          envVars: { present: [], missing: [] },
        },
      ]),
    });
  });

  await page.route("**/api/getAgentRuns", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "run-skill-false-positive",
          profileId: null,
          status: "completed",
          startedAt: "2026-01-01T00:00:00Z",
          finishedAt: "2026-01-01T00:00:01Z",
          events: [],
          inputs: {
            runType: "external_agent",
            chatId,
            engineConfigId: externalEngineConfigId,
            messages: [
              {
                id: "user-1",
                role: "user",
                content: [{ type: "text", text: "run with tool calls" }],
                attachments: [],
              },
            ],
          },
          outputs: {
            name: "Skillful Search Run",
            nameSource: "deterministic",
          },
        },
      ]),
    });
  });

  await page.route("**/api/getExternalAgentChat", async (route) => {
    externalChatRequestCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [
          {
            id: "assistant-1",
            role: "assistant",
            content: [],
            attachments: [],
            tool_calls: [
              {
                id: "tool-call-1",
                type: "function",
                function: {
                  name: "mcp__repo__skillful_search",
                  arguments: { name: "readme" },
                },
              },
            ],
          },
        ],
        waitingForResponse: false,
        toolCallArguments: {},
      }),
    });
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          skillId: "workspace_agents_skills::readme",
          name: "readme",
          rootLabel: "Workspace .agents/skills",
          rootPath: "/workspace/.agents/skills",
          relativePath: "readme",
          description: "Reader skill",
        },
      ]),
    });
  });

  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: null,
      }),
    });
  });

  await page.route("**/api/llm/apiKeys", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await mockMcpRuntimeStatusRoute(page);

  await ensureAppReady(page);

  await page.getByRole("button", { name: "View History" }).click();
  await expect(page.getByText("Skillful Search Run")).toBeVisible();
  await page.getByText("Skillful Search Run").click();
  await expect.poll(() => externalChatRequestCount).toBeGreaterThan(0);

  await page.getByRole("button", { name: "View Skills and MCP" }).click();

  const readmeSkillButton = page.getByRole("button", { name: /readme/i });
  await expect(readmeSkillButton).toBeVisible();
  await expect(readmeSkillButton.getByText("Applicable")).toBeVisible();
  await expect(readmeSkillButton.getByText("Active")).toHaveCount(0);
});

test("project ai chat marks codex skills active from $skill tokens", async ({
  page,
}) => {
  const externalEngineConfigId = "engine-codex-token";
  const externalAgentConfigId = "external-codex-token";
  const chatId = "chat-codex-token-active";
  let externalChatRequestCount = 0;

  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  await page.route("**/api/getEngineConfigs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: externalEngineConfigId,
          name: "Codex Engine",
          engineType: "external_agent",
          externalAgentConfigId,
          defaults: {},
        },
      ]),
    });
  });

  await page.route("**/api/getExternalAgentConfigs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: externalAgentConfigId,
          name: "Codex app-server",
          toolType: "codex",
          runMode: "app_server",
        },
      ]),
    });
  });

  await page.route("**/api/getExternalAgentHealth", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          configId: externalAgentConfigId,
          name: "Codex app-server",
          toolType: "codex",
          runMode: "app_server",
          supported: true,
          available: true,
          issues: [],
          envVars: { present: [], missing: [] },
        },
      ]),
    });
  });

  await page.route("**/api/getAgentRuns", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "run-codex-token-active",
          profileId: null,
          status: "completed",
          startedAt: "2026-01-01T00:00:00Z",
          finishedAt: "2026-01-01T00:00:01Z",
          events: [],
          inputs: {
            runType: "external_agent",
            chatId,
            engineConfigId: externalEngineConfigId,
            messages: [
              {
                id: "user-1",
                role: "user",
                content: [{ type: "text", text: "please use $readme" }],
                attachments: [],
              },
            ],
          },
          outputs: {
            name: "Codex Token Run",
            nameSource: "deterministic",
          },
        },
      ]),
    });
  });

  await page.route("**/api/getExternalAgentChat", async (route) => {
    externalChatRequestCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [
          {
            id: "user-1",
            role: "user",
            content: [{ type: "text", text: "please use $readme" }],
            attachments: [],
          },
          {
            id: "assistant-1",
            role: "assistant",
            content: [],
            attachments: [],
            tool_calls: [],
          },
        ],
        waitingForResponse: false,
        toolCallArguments: {},
      }),
    });
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          skillId: "workspace_agents_skills::readme",
          name: "readme",
          rootLabel: "Workspace .agents/skills",
          rootPath: "/workspace/.agents/skills",
          relativePath: "readme",
          description: "Reader skill",
        },
      ]),
    });
  });

  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: null,
      }),
    });
  });

  await page.route("**/api/llm/apiKeys", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await mockMcpRuntimeStatusRoute(page);

  await ensureAppReady(page);

  await page.getByRole("button", { name: "View History" }).click();
  await expect(page.getByText("Codex Token Run")).toBeVisible();
  await page.getByText("Codex Token Run").click();
  await expect.poll(() => externalChatRequestCount).toBeGreaterThan(0);

  await page.getByRole("button", { name: "View Skills and MCP" }).click();

  const readmeSkillButton = page.getByRole("button", { name: /readme/i });
  await expect(readmeSkillButton).toBeVisible();
  await expect(readmeSkillButton.getByText("Applicable")).toBeVisible();
  await expect(readmeSkillButton.getByText("Active")).toBeVisible();
});

test("project ai chat does not mark codex skills active for shell-style $variables", async ({
  page,
}) => {
  const externalEngineConfigId = "engine-codex-shell-var";
  const externalAgentConfigId = "external-codex-shell-var";
  const chatId = "chat-codex-shell-var";
  let externalChatRequestCount = 0;

  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  await page.route("**/api/getEngineConfigs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: externalEngineConfigId,
          name: "Codex Engine",
          engineType: "external_agent",
          externalAgentConfigId,
          defaults: {},
        },
      ]),
    });
  });

  await page.route("**/api/getExternalAgentConfigs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: externalAgentConfigId,
          name: "Codex app-server",
          toolType: "codex",
          runMode: "app_server",
        },
      ]),
    });
  });

  await page.route("**/api/getExternalAgentHealth", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          configId: externalAgentConfigId,
          name: "Codex app-server",
          toolType: "codex",
          runMode: "app_server",
          supported: true,
          available: true,
          issues: [],
          envVars: { present: [], missing: [] },
        },
      ]),
    });
  });

  await page.route("**/api/getAgentRuns", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "run-codex-shell-var",
          profileId: null,
          status: "completed",
          startedAt: "2026-01-01T00:00:00Z",
          finishedAt: "2026-01-01T00:00:01Z",
          events: [],
          inputs: {
            runType: "external_agent",
            chatId,
            engineConfigId: externalEngineConfigId,
            messages: [
              {
                id: "user-1",
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "Set env first: export $readme && echo $readme",
                  },
                ],
                attachments: [],
              },
            ],
          },
          outputs: {
            name: "Codex Shell Variable Run",
            nameSource: "deterministic",
          },
        },
      ]),
    });
  });

  await page.route("**/api/getExternalAgentChat", async (route) => {
    externalChatRequestCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [
          {
            id: "user-1",
            role: "user",
            content: [
              {
                type: "text",
                text: "Set env first: export $readme && echo $readme",
              },
            ],
            attachments: [],
          },
          {
            id: "assistant-1",
            role: "assistant",
            content: [],
            attachments: [],
            tool_calls: [],
          },
        ],
        waitingForResponse: false,
        toolCallArguments: {},
      }),
    });
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          skillId: "workspace_agents_skills::readme",
          name: "readme",
          rootLabel: "Workspace .agents/skills",
          rootPath: "/workspace/.agents/skills",
          relativePath: "readme",
          description: "Reader skill",
        },
      ]),
    });
  });

  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: null,
      }),
    });
  });

  await page.route("**/api/llm/apiKeys", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await mockMcpRuntimeStatusRoute(page);

  await ensureAppReady(page);

  await page.getByRole("button", { name: "View History" }).click();
  await expect(page.getByText("Codex Shell Variable Run")).toBeVisible();
  await page.getByText("Codex Shell Variable Run").click();
  await expect.poll(() => externalChatRequestCount).toBeGreaterThan(0);

  await page.getByRole("button", { name: "View Skills and MCP" }).click();

  const readmeSkillButton = page.getByRole("button", { name: /readme/i });
  await expect(readmeSkillButton).toBeVisible();
  await expect(readmeSkillButton.getByText("Applicable")).toBeVisible();
  await expect(readmeSkillButton.getByText("Active")).toHaveCount(0);
});

test("project ai chat surfaces disabled MCP runtime servers in the summary", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          skillId: "workspace_agents_skills::ui-layout",
          name: "ui-layout",
          rootLabel: "Workspace .agents/skills",
          rootPath: "/workspace/.agents/skills",
          relativePath: "ui-layout",
          description: "Create dense dashboard layouts.",
        },
      ]),
    });
  });

  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {
          setta: {
            transport: "sse",
            url: "http://127.0.0.1:8000/mcp",
          },
        },
        defaultMcpServerIds: ["setta"],
        default_config_id: null,
      }),
    });
  });

  await mockMcpRuntimeStatusRoute(page, {
    payload: buildMcpRuntimeStatusResponse({
      servers: [
        buildMcpRuntimeServer({
          serverId: "setta",
          state: "connected",
          transport: "sse",
          endpoint: "http://127.0.0.1:8000/mcp",
        }),
      ],
      externalServers: [
        buildMcpRuntimeServer({
          serverId: "context7",
          source: "external_runtime",
          state: "disabled",
          transport: "stdio",
          endpoint: "npx @upstash/context7-mcp",
        }),
      ],
    }),
  });

  await ensureAppReady(page);
  await page.getByRole("button", { name: "View Skills and MCP" }).click();

  await expect(page.getByText(/1 disabled/)).toBeVisible();
  await expect(page.getByText(/context7.*disabled/i)).toBeVisible();
});

test("project ai chat shows inline skills endpoint error when routes are missing", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Not Found" }),
    });
  });
  allowExpectedApiError(page, {
    path: "/api/getAppGenSkills",
    statuses: [404],
  });

  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {
          setta: {
            transport: "sse",
            url: "http://127.0.0.1:8000/mcp",
          },
        },
        defaultMcpServerIds: ["setta"],
        default_config_id: null,
      }),
    });
  });
  await mockMcpRuntimeStatusRoute(page);

  await ensureAppReady(page);

  await page.getByRole("button", { name: "View Skills and MCP" }).click();
  await expect(page.getByText("Skills unavailable (Not Found).")).toBeVisible();
});

test("project ai chat shows loading states before skills and mcp data arrive", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          skillId: "workspace_agents_skills::ui-layout",
          name: "ui-layout",
          rootLabel: "Workspace .agents/skills",
          rootPath: "/workspace/.agents/skills",
          relativePath: "ui-layout",
          description: "Create dense dashboard layouts.",
        },
      ]),
    });
  });

  await page.route("**/api/llm/config", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {
          setta: {
            transport: "sse",
            url: "http://127.0.0.1:8000/mcp",
          },
        },
        defaultMcpServerIds: ["setta"],
        default_config_id: null,
      }),
    });
  });

  await mockMcpRuntimeStatusRoute(page, {
    delayMs: 1000,
    payload: buildMcpRuntimeStatusResponse({
      servers: [
        buildMcpRuntimeServer({
          serverId: "setta",
          state: "connected",
          transport: "sse",
          endpoint: "http://127.0.0.1:8000/mcp",
        }),
      ],
    }),
  });

  await page.route("**/api/getAppGenSkillContent", async (route) => {
    const payload = route.request().postDataJSON() as { skillId?: string };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillId: payload.skillId ?? "workspace_agents_skills::ui-layout",
        content: "# UI Layout\n\nCreate dense dashboard layouts.",
      }),
    });
  });

  await ensureAppReady(page);
  await page.getByRole("button", { name: "View Skills and MCP" }).click();

  await expect(page.getByText("Loading skills...")).toBeVisible();
  await expect(page.getByText("No skills found.")).toHaveCount(0);
  await expect(page.getByText("Loading MCP servers...")).toBeVisible();
  await expect(page.getByText("No MCP runtime status available.")).toHaveCount(0);

  await expect(page.getByRole("button", { name: /ui-layout/i })).toBeVisible();
  await expect(page.getByText("Loading skills...")).toHaveCount(0);
  await expect(page.getByText("Loading MCP servers...")).toHaveCount(0);
});

test("project ai chat keeps skills list stable during selection and ignores stale markdown responses", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  let skillsFetchCount = 0;
  await page.route("**/api/getAppGenSkills", async (route) => {
    skillsFetchCount += 1;
    const skills = [
      {
        skillId: "workspace_agents_skills::alpha-skill",
        name: "alpha-skill",
        rootLabel: "Workspace .agents/skills",
        rootPath: "/workspace/.agents/skills",
        relativePath: "alpha-skill",
        description: "Alpha skill",
      },
      {
        skillId: "workspace_agents_skills::beta-skill",
        name: "beta-skill",
        rootLabel: "Workspace .agents/skills",
        rootPath: "/workspace/.agents/skills",
        relativePath: "beta-skill",
        description: "Beta skill",
      },
      ...Array.from({ length: 203 }, (_, index) => {
        return {
          skillId: `workspace_agents_skills::skill-${index}`,
          name: `skill-${index}`,
          rootLabel: "Workspace .agents/skills",
          rootPath: "/workspace/.agents/skills",
          relativePath: `skill-${index}`,
          description: `Skill ${index}`,
        };
      }),
    ];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(skills),
    });
  });

  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {
          setta: {
            transport: "sse",
            url: "http://127.0.0.1:8000/mcp",
          },
        },
        defaultMcpServerIds: ["setta"],
        default_config_id: null,
      }),
    });
  });
  await mockMcpRuntimeStatusRoute(page);

  let skillContentRequestCount = 0;
  await page.route("**/api/getAppGenSkillContent", async (route) => {
    skillContentRequestCount += 1;
    const payload = route.request().postDataJSON() as { skillId?: string };
    const skillId = payload.skillId ?? "";
    if (skillId.endsWith("alpha-skill")) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillId,
        content: `# ${skillId}`,
      }),
    });
  });

  await ensureAppReady(page);
  await page.getByRole("button", { name: "View Skills and MCP" }).click();

  await expect(page.getByRole("button", { name: /beta-skill/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /skill-202/i })).toHaveCount(1);
  await page.waitForTimeout(200);
  const fetchCountAfterInitialLoad = skillsFetchCount;
  expect(fetchCountAfterInitialLoad).toBeGreaterThan(0);
  expect(skillContentRequestCount).toBe(0);

  await page.getByRole("button", { name: /beta-skill/i }).click();
  await expect.poll(() => skillsFetchCount).toBe(fetchCountAfterInitialLoad);
  expect(skillContentRequestCount).toBe(0);

  await page.getByRole("button", { name: "Skill Markdown Viewer" }).click();
  await expect.poll(() => skillContentRequestCount).toBe(1);
  const markdown = page.getByLabel("Skill Markdown Content");
  await expect(markdown).toContainText("workspace_agents_skills::beta-skill");
  await page.waitForTimeout(700);
  await expect(markdown).toContainText("workspace_agents_skills::beta-skill");
  await expect(markdown).not.toContainText("workspace_agents_skills::alpha-skill");
});

test("project ai chat clears stale markdown when viewer is collapsed during an in-flight request", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          skillId: "workspace_agents_skills::alpha-skill",
          name: "alpha-skill",
          rootLabel: "Workspace .agents/skills",
          rootPath: "/workspace/.agents/skills",
          relativePath: "alpha-skill",
          description: "Alpha skill",
        },
        {
          skillId: "workspace_agents_skills::beta-skill",
          name: "beta-skill",
          rootLabel: "Workspace .agents/skills",
          rootPath: "/workspace/.agents/skills",
          relativePath: "beta-skill",
          description: "Beta skill",
        },
      ]),
    });
  });

  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: null,
      }),
    });
  });
  await mockMcpRuntimeStatusRoute(page);

  await page.route("**/api/getAppGenSkillContent", async (route) => {
    const payload = route.request().postDataJSON() as { skillId?: string };
    const skillId = payload.skillId ?? "";
    if (skillId.endsWith("alpha-skill")) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillId,
        content: `# ${skillId}`,
      }),
    });
  });

  await ensureAppReady(page);
  await page.getByRole("button", { name: "View Skills and MCP" }).click();
  await expect(page.getByRole("button", { name: /beta-skill/i })).toBeVisible();

  const viewerToggle = page.getByRole("button", {
    name: "Skill Markdown Viewer",
  });
  await viewerToggle.click();
  await expect(viewerToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByLabel("Skill Markdown Content")).toBeVisible();
  await viewerToggle.click();
  await expect(viewerToggle).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: /beta-skill/i }).click();

  // Allow the stale alpha response to resolve while the viewer is closed.
  await page.waitForTimeout(700);

  await viewerToggle.click();
  await expect(viewerToggle).toHaveAttribute("aria-expanded", "true");
  const markdown = page.getByLabel("Skill Markdown Content");
  await expect(markdown).toBeVisible();
  const immediateText = (await markdown.textContent()) ?? "";
  expect(immediateText).not.toContain("workspace_agents_skills::alpha-skill");
  await expect(markdown).toContainText("workspace_agents_skills::beta-skill");
  await expect(markdown).not.toContainText("workspace_agents_skills::alpha-skill");
});

test("project ai chat refresh updates selected markdown content without requiring reselection", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          skillId: "workspace_agents_skills::ui-layout",
          name: "ui-layout",
          rootLabel: "Workspace .agents/skills",
          rootPath: "/workspace/.agents/skills",
          relativePath: "ui-layout",
          description: "Create dense dashboard layouts.",
        },
      ]),
    });
  });

  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: null,
      }),
    });
  });
  await mockMcpRuntimeStatusRoute(page);

  let skillContentVersion = 0;
  await page.route("**/api/getAppGenSkillContent", async (route) => {
    skillContentVersion += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillId: "workspace_agents_skills::ui-layout",
        content: `# UI Layout\n\nRevision ${skillContentVersion}`,
      }),
    });
  });

  await ensureAppReady(page);
  await page.getByRole("button", { name: "View Skills and MCP" }).click();
  await page.getByRole("button", { name: "Skill Markdown Viewer" }).click();

  const markdown = page.getByLabel("Skill Markdown Content");
  await expect(markdown).toContainText("Revision 1");

  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(markdown).toContainText("Revision 2");
});

test("project ai chat keeps existing skills and markdown preview on refresh failure", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  let skillsRequestCount = 0;
  await page.route("**/api/getAppGenSkills", async (route) => {
    skillsRequestCount += 1;
    if (skillsRequestCount === 1) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            skillId: "workspace_agents_skills::ui-layout",
            name: "ui-layout",
            rootLabel: "Workspace .agents/skills",
            rootPath: "/workspace/.agents/skills",
            relativePath: "ui-layout",
            description: "Create dense dashboard layouts.",
          },
        ]),
      });
      return;
    }
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Filesystem scan failed." }),
    });
  });
  allowExpectedApiError(page, {
    path: "/api/getAppGenSkills",
    statuses: [500],
  });

  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: null,
      }),
    });
  });
  await mockMcpRuntimeStatusRoute(page);

  await page.route("**/api/getAppGenSkillContent", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillId: "workspace_agents_skills::ui-layout",
        content: "# UI Layout\n\nStable preview",
      }),
    });
  });

  await ensureAppReady(page);
  await page.getByRole("button", { name: "View Skills and MCP" }).click();
  await page.getByRole("button", { name: "Skill Markdown Viewer" }).click();

  await expect(page.getByRole("button", { name: /ui-layout/i })).toBeVisible();
  await expect(page.getByLabel("Skill Markdown Content")).toContainText(
    "Stable preview",
  );

  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(
    page.getByText("Skills unavailable (Filesystem scan failed.)."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /ui-layout/i })).toBeVisible();
  await expect(page.getByLabel("Skill Markdown Content")).toContainText(
    "Stable preview",
  );
});

test("project ai chat refresh is disabled while loading to prevent redundant scans", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  let skillsRequestCount = 0;
  await page.route("**/api/getAppGenSkills", async (route) => {
    skillsRequestCount += 1;
    if (skillsRequestCount === 1) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            skillId: "workspace_agents_skills::baseline",
            name: "baseline",
            rootLabel: "Workspace .agents/skills",
            rootPath: "/workspace/.agents/skills",
            relativePath: "baseline",
            description: "Baseline skill",
          },
        ]),
      });
      return;
    }
    if (skillsRequestCount === 2) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            skillId: "workspace_agents_skills::fresh-skill",
            name: "fresh-skill",
            rootLabel: "Workspace .agents/skills",
            rootPath: "/workspace/.agents/skills",
            relativePath: "fresh-skill",
            description: "Fresh result",
          },
        ]),
      });
      return;
    }
    throw new Error("Unexpected extra getAppGenSkills request.");
  });

  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: null,
      }),
    });
  });
  await mockMcpRuntimeStatusRoute(page);

  await page.route("**/api/getAppGenSkillContent", async (route) => {
    const payload = route.request().postDataJSON() as { skillId?: string };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillId: payload.skillId ?? "workspace_agents_skills::baseline",
        content: `# ${(payload.skillId ?? "workspace_agents_skills::baseline").trim()}`,
      }),
    });
  });

  await ensureAppReady(page);
  await page.getByRole("button", { name: "View Skills and MCP" }).click();
  await expect(page.getByRole("button", { name: /baseline/i })).toBeVisible();

  const refreshButton = page.getByRole("button", { name: "Refresh" });
  await refreshButton.click();
  await expect(refreshButton).toBeDisabled();
  await page.waitForTimeout(100);
  expect(skillsRequestCount).toBe(2);
  await expect(
    page.getByRole("button", { name: /fresh-skill/i }),
  ).toBeVisible();
  await expect(refreshButton).toBeEnabled();
  expect(skillsRequestCount).toBe(2);
});

test("project ai chat shows reveal-path failures instead of silently swallowing them", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          skillId: "workspace_agents_skills::ui-layout",
          name: "ui-layout",
          rootLabel: "Workspace .agents/skills",
          rootPath: "/workspace/.agents/skills",
          relativePath: "ui-layout",
          description: "Create dense dashboard layouts.",
        },
      ]),
    });
  });

  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: null,
      }),
    });
  });
  await mockMcpRuntimeStatusRoute(page);

  await page.route("**/api/getAppGenSkillContent", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillId: "workspace_agents_skills::ui-layout",
        content: "# UI Layout",
      }),
    });
  });

  await page.route("**/api/revealPathInOsFileExplorer", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Reveal is disabled for this path." }),
    });
  });
  allowExpectedApiError(page, {
    path: "/api/revealPathInOsFileExplorer",
    statuses: [400],
  });

  await ensureAppReady(page);
  await page.getByRole("button", { name: "View Skills and MCP" }).click();

  await page
    .getByRole("button", { name: "Reveal path for Workspace .agents/skills" })
    .click();
  await expect(
    page.getByText("Failed to reveal path: Reveal is disabled for this path."),
  ).toBeVisible();
});

test("project ai chat mounts markdown viewer lazily and shows truncation metadata", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });

  await page.route("**/api/getAppGenSkills", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          skillId: "workspace_agents_skills::ui-layout",
          name: "ui-layout",
          rootLabel: "Workspace .agents/skills",
          rootPath: "/workspace/.agents/skills",
          relativePath: "ui-layout",
          description: "Create dense dashboard layouts.",
        },
      ]),
    });
  });

  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {},
        mcpServers: {
          setta: {
            transport: "sse",
            url: "http://127.0.0.1:8000/mcp",
          },
        },
        defaultMcpServerIds: ["setta"],
        default_config_id: null,
      }),
    });
  });

  await mockMcpRuntimeStatusRoute(page, {
    status: 500,
    detail: "Unavailable",
  });
  allowExpectedApiError(page, {
    path: "/api/mcpServerRuntimeStatus",
    statuses: [500],
    method: "POST",
    count: 3,
  });

  await page.route("**/api/getAppGenSkillContent", async (route) => {
    const payload = route.request().postDataJSON() as { skillId?: string };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skillId: payload.skillId ?? "workspace_agents_skills::ui-layout",
        content: "# UI Layout\n\nPreview body",
        truncated: true,
        originalSizeBytes: 900000,
      }),
    });
  });

  await ensureAppReady(page);
  await page.getByRole("button", { name: "View Skills and MCP" }).click();

  await expect(page.getByText("Unavailable")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Reveal path for Active setta_files/i }),
  ).toHaveCount(0);

  const skillMarkdownToggle = page.getByRole("button", {
    name: "Skill Markdown Viewer",
  });
  await expect(skillMarkdownToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel("Skill Markdown Content")).toHaveCount(0);

  await skillMarkdownToggle.click();

  await expect(page.getByLabel("Skill Markdown Content")).toContainText(
    "Preview body",
  );
  await expect(
    page.getByText("Preview truncated from 900,000 bytes."),
  ).toBeVisible();
});
