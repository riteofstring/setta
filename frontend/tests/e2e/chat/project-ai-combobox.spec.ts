import { expect, test } from "@playwright/test";
import { ensureAppReady, seedLocalStorage } from "../helpers";

test("project ai combobox chevron sizing", async ({ page }) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });
  await ensureAppReady(page);

  const overviewPane = page.locator("#OverviewPane");
  await expect(
    overviewPane.getByRole("heading", { name: "Project AI Chat" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Project AI Settings" }).click();

  const engineInput = page.getByPlaceholder("Select an engine");
  await expect(engineInput).toBeVisible();

  const searchWrapper = engineInput.locator("..");
  const toggleButton = searchWrapper.locator("button").first();
  await expect(toggleButton).toBeVisible();

  const inputBox = await engineInput.boundingBox();
  const buttonBox = await toggleButton.boundingBox();
  expect(inputBox).not.toBeNull();
  expect(buttonBox).not.toBeNull();
  if (!inputBox || !buttonBox) {
    return;
  }

  expect(buttonBox.height).toBeGreaterThanOrEqual(inputBox.height * 0.9);
  expect(buttonBox.height).toBeLessThanOrEqual(inputBox.height + 1);
  const inputCenter = inputBox.y + inputBox.height / 2;
  const buttonCenter = buttonBox.y + buttonBox.height / 2;
  expect(Math.abs(buttonCenter - inputCenter)).toBeLessThanOrEqual(2);

  const micInput = page.getByPlaceholder("Microphone source");
  await expect(micInput).toBeVisible();
  await expect(
    page.locator('select[aria-label="Microphone source"]'),
  ).toHaveCount(0);
});

test("project chat does not render inline external engine status text", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
  });
  await ensureAppReady(page);

  const overviewPane = page.locator("#OverviewPane");
  await expect(
    overviewPane.getByRole("heading", { name: "Project AI Chat" }),
  ).toBeVisible();

  // External engine health should be surfaced via notifications, not inline chat labels.
  await expect(overviewPane.getByText("External engine available")).toHaveCount(
    0,
  );
  await expect(
    overviewPane.getByText("Checking external engine status..."),
  ).toHaveCount(0);
  await expect(
    overviewPane.getByText(/External engine unavailable/i),
  ).toHaveCount(0);
});

test("project chat keeps selected Setta LLM engine and shows missing-key warning", async ({
  page,
}) => {
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
          id: "engine-setta-claude-sonnet",
          name: "Setta LLM (Claude Sonnet 4.5)",
          engineType: "setta_llm",
          settaLlmConfigId: null,
          externalAgentConfigId: null,
          defaults: { thinking: true },
        },
        {
          id: "engine-codex",
          name: "Codex (app-server)",
          engineType: "external_agent",
          settaLlmConfigId: null,
          externalAgentConfigId: "external-codex",
          defaults: { thinking: null },
        },
      ]),
    });
  });
  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {
          "claude-sonnet": {
            id: "claude-sonnet",
            model: "claude-sonnet-4-5-20250929",
            provider: "anthropic",
            api_key_env: "ANTHROPIC_API_KEY",
            base_url: null,
            other_params: null,
            mcpServerIds: [],
            temporary: false,
          },
        },
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: "claude-sonnet",
        codexMcpImportedAt: null,
      }),
    });
  });
  await page.route("**/api/llm/apiKeys", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        apiKeys: {},
        revision: 0,
      }),
    });
  });
  await page.route("**/api/getExternalAgentHealth", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          configId: "external-codex",
          name: "Codex (app-server)",
          toolType: "codex",
          runMode: "app_server",
          supported: true,
          available: true,
          issues: [],
          nodePath: null,
          nodeVersion: null,
          sdkVersion: null,
          cliVersion: "0.0.0",
          baseUrl: null,
          workingDir: null,
          envVars: {
            present: [],
            missing: [],
          },
        },
      ]),
    });
  });
  await ensureAppReady(page);

  const overviewPane = page.locator("#OverviewPane");
  await expect(
    overviewPane.getByRole("heading", { name: "Project AI Chat" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Project AI Settings" }).click();
  const engineInput = page.getByPlaceholder("Select an engine");
  await expect(engineInput).toBeVisible();

  // Selecting Setta LLM must remain sticky even when its model lacks a key.
  await engineInput.fill("Setta LLM");
  await engineInput.press("Enter");
  await expect(engineInput).toHaveValue("Setta LLM (Claude Sonnet 4.5)");
  await expect(
    page.getByText(
      "Selected model is unavailable. Missing API key: ANTHROPIC_API_KEY.",
    ),
  ).toBeVisible();
  const llmInput = page
    .locator(
      'input[placeholder="Select an LLM"], input[placeholder="Add an LLM config or API key"]',
    )
    .first();
  await expect(llmInput).toHaveClass(/border-red-500/);
  await page.waitForTimeout(300);
  await expect(engineInput).toHaveValue("Setta LLM (Claude Sonnet 4.5)");
});
