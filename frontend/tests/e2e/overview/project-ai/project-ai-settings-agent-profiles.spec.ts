import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import {
  allowExpectedApiError,
  cleanupIsolatedProject,
  openIsolatedProject,
  openProjectAiSettingsPopover,
  postBackend,
  setOverviewTab,
} from "../../helpers";

function getVisibleProjectAiSettings(page: Page): Locator {
  return page.locator('[data-testid="project-ai-settings-scroll-region"]:visible').first();
}

test.describe.serial("project ai settings accordion layout", () => {
  test("llm api keys supports adding custom key/value entries", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    const projectContext = await openIsolatedProject(page);
    await openProjectAiSettingsPopover(page);
    const customKey = "E2E_CUSTOM_LLM_API_KEY";
    const customValue = "e2e-custom-secret-value";
    const backendOrigin = process.env.SETTA_BACKEND_ORIGIN;
    if (!backendOrigin) {
      throw new Error("SETTA_BACKEND_ORIGIN is required for this test.");
    }

    try {
      const settingsPanel = getVisibleProjectAiSettings(page);
      const llmKeysTrigger = settingsPanel.getByTestId(
        "project-ai-settings-accordion-llm-api-keys",
      );
      if ((await llmKeysTrigger.getAttribute("aria-expanded")) !== "true") {
        await llmKeysTrigger.click();
      }

      await settingsPanel
        .getByTestId("project-llm-settings-new-api-key-name")
        .fill(customKey);
      await settingsPanel
        .locator("#project-llm-settings-new-api-key-value")
        .fill(customValue);
      await settingsPanel.getByTestId("project-llm-settings-add-api-key").click();

      await expect(
        settingsPanel.getByTestId("project-ai-settings-accordion-llm-api-keys-content"),
      ).toContainText(customKey);

      // The backend should persist arbitrary key/value entries.
      await expect
        .poll(async () => {
          const res = await page.request.get(
            `${backendOrigin}/api/llm/apiKeys`,
          );
          if (!res.ok()) {
            return null;
          }
          const payload = (await res.json()) as {
            apiKeys?: Record<string, string>;
          };
          return payload.apiKeys?.[customKey] ?? null;
        })
        .toBe(customValue);

      await page.reload({ waitUntil: "domcontentloaded" });
      await openProjectAiSettingsPopover(page);
      const reloadedSettingsPanel = getVisibleProjectAiSettings(page);
      await expect(
        reloadedSettingsPanel.getByTestId(
          "project-ai-settings-accordion-llm-api-keys-content",
        ),
      ).toContainText(customKey);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("llm api key save retries on revision conflict and preserves concurrent keys", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    const projectContext = await openIsolatedProject(page);
    await openProjectAiSettingsPopover(page);
    const customKey = "E2E_RETRY_CUSTOM_KEY";
    const customValue = "retry-custom-secret";
    const concurrentKey = "E2E_CONCURRENT_KEY";
    const concurrentValue = "concurrent-secret";
    const postPayloads: Array<{
      apiKeys: Record<string, string>;
      expectedRevision: number;
    }> = [];
    let firstPost = true;
    let persistedSnapshot: {
      apiKeys: Record<string, string>;
      revision: number;
    } = {
      apiKeys: {},
      revision: 0,
    };
    allowExpectedApiError(page, {
      path: "/api/llm/apiKeys",
      statuses: [409],
    });
    await page.route("**/api/llm/apiKeys", async (route) => {
      const method = route.request().method();
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(persistedSnapshot),
        });
        return;
      }
      if (method !== "POST") {
        await route.continue();
        return;
      }
      const payload = route.request().postDataJSON() as {
        apiKeys: Record<string, string>;
        expectedRevision: number;
      };
      postPayloads.push(payload);
      if (firstPost) {
        firstPost = false;
        persistedSnapshot = {
          apiKeys: {
            [concurrentKey]: concurrentValue,
          },
          revision: 1,
        };
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            detail: {
              errorCode: "managed_api_keys_revision_conflict",
              message: "revision mismatch",
              revision: 1,
            },
          }),
        });
        return;
      }
      persistedSnapshot = {
        apiKeys: payload.apiKeys,
        revision: persistedSnapshot.revision + 1,
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(persistedSnapshot),
      });
    });

    try {
      const settingsPanel = getVisibleProjectAiSettings(page);
      const llmKeysTrigger = settingsPanel.getByTestId(
        "project-ai-settings-accordion-llm-api-keys",
      );
      if ((await llmKeysTrigger.getAttribute("aria-expanded")) !== "true") {
        await llmKeysTrigger.click();
      }

      await settingsPanel
        .getByTestId("project-llm-settings-new-api-key-name")
        .fill(customKey);
      await settingsPanel
        .locator("#project-llm-settings-new-api-key-value")
        .fill(customValue);
      await settingsPanel.getByTestId("project-llm-settings-add-api-key").click();

      await expect.poll(() => postPayloads.length).toBeGreaterThanOrEqual(2);
      await expect(
        settingsPanel.getByTestId("project-ai-settings-accordion-llm-api-keys-content"),
      ).toContainText(customKey);
      await expect(
        settingsPanel.getByTestId("project-ai-settings-accordion-llm-api-keys-content"),
      ).toContainText(concurrentKey);
      const relevantPayloads = postPayloads.filter((payload) => {
        return payload.apiKeys[customKey] === customValue;
      });
      expect(relevantPayloads.length).toBeGreaterThanOrEqual(2);
      expect(relevantPayloads[0]).toMatchObject({
        apiKeys: {
          [customKey]: customValue,
        },
      });
      expect(relevantPayloads[1]).toMatchObject({
        apiKeys: {
          [concurrentKey]: concurrentValue,
          [customKey]: customValue,
        },
        expectedRevision: 1,
      });
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("defaults to essentials open and persists accordion state", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    const projectContext = await openIsolatedProject(page);
    await openProjectAiSettingsPopover(page);
    try {
      const settingsPanel = getVisibleProjectAiSettings(page);
      const llmKeysTrigger = settingsPanel.getByTestId(
        "project-ai-settings-accordion-llm-api-keys",
      );
      const guardrailsTrigger = settingsPanel.getByTestId(
        "project-ai-settings-accordion-guardrails",
      );
      const agentProfilesTrigger = settingsPanel.getByTestId(
        "project-ai-settings-accordion-agent-profiles",
      );
      const promptTemplatesTrigger = settingsPanel.getByTestId(
        "project-ai-settings-accordion-prompt-templates",
      );
      const externalAgentsTrigger = settingsPanel.getByTestId(
        "project-ai-settings-accordion-external-agents",
      );

      // Create a concrete API-key row so clipping checks cover real LLM-key content.
      await postBackend(page, "/llm/config", {
        configs: {
          "e2e-anthropic-config": {
            model: "claude-3-5-sonnet-latest",
            provider: "anthropic",
            api_key_env: "ANTHROPIC_API_KEY",
          },
        },
        default_config_id: "e2e-anthropic-config",
      });
      await page.reload({ waitUntil: "domcontentloaded" });
      await openProjectAiSettingsPopover(page);

      // Verify the default essential sections are open, with advanced sections minimized.
      await expect(llmKeysTrigger).toHaveAttribute("aria-expanded", "true");
      await expect(agentProfilesTrigger).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await expect(guardrailsTrigger).toHaveAttribute("aria-expanded", "false");
      await expect(promptTemplatesTrigger).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      await expect(externalAgentsTrigger).toHaveAttribute(
        "aria-expanded",
        "false",
      );

      await promptTemplatesTrigger.click();
      await agentProfilesTrigger.click();
      await expect(promptTemplatesTrigger).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await expect(agentProfilesTrigger).toHaveAttribute(
        "aria-expanded",
        "false",
      );

      // Expanding subsequent sections must not clip the content of open sections above.
      await externalAgentsTrigger.click();
      await expect(externalAgentsTrigger).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      const llmApiKeyLabel = settingsPanel
        .getByTestId("project-ai-settings-accordion-llm-api-keys-content")
        .getByText("ANTHROPIC_API_KEY");
      await expect(llmApiKeyLabel).toBeVisible();
      const clippingMetrics = await settingsPanel.evaluate((panel) => {
        const itemIds = [
          "project-ai-settings-accordion-llm-api-keys-item",
          "project-ai-settings-accordion-guardrails-item",
          "project-ai-settings-accordion-agent-profiles-item",
          "project-ai-settings-accordion-prompt-templates-item",
          "project-ai-settings-accordion-external-agents-item",
        ];
        return itemIds.map((id) => {
          const element = panel.querySelector(`[data-testid='${id}']`);
          if (!(element instanceof HTMLElement)) {
            return { id, missing: true, clientHeight: 0, scrollHeight: 0 };
          }
          return {
            id,
            missing: false,
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight,
          };
        });
      });
      for (const metric of clippingMetrics) {
        expect(metric.missing).toBe(false);
        expect(metric.scrollHeight - metric.clientHeight).toBeLessThanOrEqual(
          1,
        );
      }

      await page.reload({ waitUntil: "domcontentloaded" });
      await openProjectAiSettingsPopover(page);
      const reloadedSettingsPanel = getVisibleProjectAiSettings(page);

      await expect(
        reloadedSettingsPanel.getByTestId(
          "project-ai-settings-accordion-prompt-templates",
        ),
      ).toHaveAttribute("aria-expanded", "true");
      await expect(
        reloadedSettingsPanel.getByTestId("project-ai-settings-accordion-guardrails"),
      ).toHaveAttribute("aria-expanded", "false");
      await expect(
        reloadedSettingsPanel.getByTestId(
          "project-ai-settings-accordion-agent-profiles",
        ),
      ).toHaveAttribute("aria-expanded", "false");
      await expect(
        reloadedSettingsPanel.getByTestId("project-ai-settings-accordion-llm-api-keys"),
      ).toHaveAttribute("aria-expanded", "true");

      // Form controls in open sections should preserve right inset from card edges.
      const externalAgentsAccordionTrigger = reloadedSettingsPanel.getByTestId(
        "project-ai-settings-accordion-external-agents",
      );
      if (
        (await externalAgentsAccordionTrigger.getAttribute("aria-expanded")) !==
        "true"
      ) {
        await externalAgentsAccordionTrigger.click();
      }
      const externalAgentsContent = reloadedSettingsPanel.getByTestId(
        "project-ai-settings-accordion-external-agents-content",
      );
      const visibleInput = externalAgentsContent.locator("input").first();
      await expect(visibleInput).toBeVisible();
      const insetMetrics = await reloadedSettingsPanel.evaluate((panel) => {
        const input = panel.querySelector<HTMLElement>(
          '[data-testid="project-ai-settings-accordion-external-agents-content"] input',
        );
        const item = panel.querySelector<HTMLElement>(
          '[data-testid="project-ai-settings-accordion-external-agents-item"]',
        );
        if (!(input instanceof HTMLElement) || !(item instanceof HTMLElement)) {
          return null;
        }
        const inputRect = input.getBoundingClientRect();
        const itemRect = item.getBoundingClientRect();
        return {
          rightInset: itemRect.right - inputRect.right,
        };
      });
      if (!insetMetrics) {
        throw new Error(
          "Unable to compute external-agent input inset metrics.",
        );
      }
      expect(insetMetrics.rightInset).toBeGreaterThanOrEqual(6);

      // The internal manager list should keep item content clear of its scrollbar.
      const listInsetMetrics = await reloadedSettingsPanel.evaluate((panel) => {
        const content = panel.querySelector<HTMLElement>(
          '[data-testid="project-ai-settings-accordion-external-agents-content"]',
        );
        if (!(content instanceof HTMLElement)) {
          return null;
        }
        const list = Array.from(content.querySelectorAll("div")).find(
          (candidate) => {
            const element = candidate as HTMLElement;
            const style = window.getComputedStyle(element);
            return (
              style.overflowY === "scroll" &&
              element.querySelector("button") instanceof HTMLElement
            );
          },
        ) as HTMLElement | undefined;
        if (!(list instanceof HTMLElement)) {
          return null;
        }
        const firstButton = list.querySelector<HTMLElement>("button");
        if (!(firstButton instanceof HTMLElement)) {
          return null;
        }
        const listRect = list.getBoundingClientRect();
        const buttonRect = firstButton.getBoundingClientRect();
        const style = window.getComputedStyle(list);
        return {
          rightInset: listRect.right - buttonRect.right,
          paddingRight: Number.parseFloat(style.paddingRight),
        };
      });
      if (!listInsetMetrics) {
        throw new Error(
          "Unable to compute external-agent list scrollbar inset metrics.",
        );
      }
      expect(listInsetMetrics.rightInset).toBeGreaterThanOrEqual(6);
      expect(listInsetMetrics.paddingRight).toBeGreaterThanOrEqual(10);

      // Inputs and selects should align to the same control width.
      const controlWidths = await reloadedSettingsPanel.evaluate((panel) => {
        const content = panel.querySelector<HTMLElement>(
          '[data-testid="project-ai-settings-accordion-external-agents-content"]',
        );
        if (!(content instanceof HTMLElement)) {
          return null;
        }
        const input = content.querySelector<HTMLInputElement>("input");
        const select = content.querySelector<HTMLSelectElement>("select");
        if (
          !(input instanceof HTMLElement) ||
          !(select instanceof HTMLElement)
        ) {
          return null;
        }
        return {
          inputWidth: input.getBoundingClientRect().width,
          selectWidth: select.getBoundingClientRect().width,
        };
      });
      if (!controlWidths) {
        throw new Error("Unable to compute input/select width metrics.");
      }
      expect(
        Math.abs(controlWidths.inputWidth - controlWidths.selectWidth),
      ).toBeLessThanOrEqual(2);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("agent profile toggles are visible and default off", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    const projectContext = await openIsolatedProject(page);
    await openProjectAiSettingsPopover(page);
    try {
      const settingsPanel = getVisibleProjectAiSettings(page);
      const agentProfilesTrigger = settingsPanel.getByTestId(
        "project-ai-settings-accordion-agent-profiles",
      );
      if (
        (await agentProfilesTrigger.getAttribute("aria-expanded")) !== "true"
      ) {
        await agentProfilesTrigger.click();
      }

      await settingsPanel.getByRole("button", { name: "New Profile" }).click();

      const backgroundFillToggle = settingsPanel.getByRole("checkbox", {
        name: "Enable Background Summary Fill",
      });
      await backgroundFillToggle.scrollIntoViewIfNeeded();
      await expect(backgroundFillToggle).toBeVisible();
      await expect(backgroundFillToggle).not.toBeChecked();

      const llmTitlesToggle = settingsPanel.getByRole("checkbox", {
        name: "Enable LLM Chat Titles",
      });
      await llmTitlesToggle.scrollIntoViewIfNeeded();
      await expect(llmTitlesToggle).toBeVisible();
      await expect(llmTitlesToggle).not.toBeChecked();
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("guardrails completion toggle persists", async ({ page }) => {
    await setOverviewTab(page, "ProjectAIChat");
    const projectContext = await openIsolatedProject(page);
    await openProjectAiSettingsPopover(page);
    try {
      const settingsPanel = getVisibleProjectAiSettings(page);
      const guardrailsTrigger = settingsPanel.getByTestId(
        "project-ai-settings-accordion-guardrails",
      );
      if ((await guardrailsTrigger.getAttribute("aria-expanded")) !== "true") {
        await guardrailsTrigger.click();
      }

      const completionGuardToggle = settingsPanel.getByTestId(
        "project-ai-settings-completion-guard-toggle",
      );
      await expect(completionGuardToggle).toBeVisible();
      await expect(completionGuardToggle).not.toBeChecked();
      const initiallyChecked = await completionGuardToggle.isChecked();
      const expectedChecked = !initiallyChecked;
      const saveResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes("/api/saveSettings") &&
          response.request().method() === "POST",
      );
      await completionGuardToggle.click();
      const saveResponse = await saveResponsePromise;
      expect(saveResponse.ok()).toBe(true);
      if (expectedChecked) {
        await expect(completionGuardToggle).toBeChecked();
      } else {
        await expect(completionGuardToggle).not.toBeChecked();
      }

      await page.reload({ waitUntil: "domcontentloaded" });
      await openProjectAiSettingsPopover(page);
      const reloadedSettingsPanel = getVisibleProjectAiSettings(page);
      const reloadedGuardrailsTrigger = reloadedSettingsPanel.getByTestId(
        "project-ai-settings-accordion-guardrails",
      );
      if (
        (await reloadedGuardrailsTrigger.getAttribute("aria-expanded")) !==
        "true"
      ) {
        await reloadedGuardrailsTrigger.click();
      }
      const reloadedToggle = reloadedSettingsPanel.getByTestId(
        "project-ai-settings-completion-guard-toggle",
      );
      if (expectedChecked) {
        await expect(reloadedToggle).toBeChecked();
      } else {
        await expect(reloadedToggle).not.toBeChecked();
      }
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("guardrails completion toggle is disabled while save is in flight", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    const projectContext = await openIsolatedProject(page);
    await openProjectAiSettingsPopover(page);
    try {
      const settingsPanel = getVisibleProjectAiSettings(page);
      const guardrailsTrigger = settingsPanel.getByTestId(
        "project-ai-settings-accordion-guardrails",
      );
      if ((await guardrailsTrigger.getAttribute("aria-expanded")) !== "true") {
        await guardrailsTrigger.click();
      }

      const completionGuardToggle = settingsPanel.getByTestId(
        "project-ai-settings-completion-guard-toggle",
      );
      await expect(completionGuardToggle).toBeVisible();

      let releaseSave: (() => void) | null = null;
      const saveBlocked = new Promise<void>((resolve) => {
        releaseSave = resolve;
      });
      let saveRequestCount = 0;
      const delayedSaveSettings = async (route: Route) => {
        saveRequestCount += 1;
        await saveBlocked;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({}),
        });
      };
      await page.route("**/api/saveSettings", delayedSaveSettings);

      const saveResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes("/api/saveSettings") &&
          response.request().method() === "POST",
      );
      await completionGuardToggle.click();
      await expect(completionGuardToggle).toBeDisabled();
      await expect
        .poll(() => saveRequestCount, { timeout: 5_000 })
        .toBeGreaterThanOrEqual(1);

      if (!releaseSave) {
        throw new Error("Save gate was not initialized.");
      }
      releaseSave();
      const saveResponse = await saveResponsePromise;
      expect(saveResponse.ok()).toBe(true);
      await expect(completionGuardToggle).toBeEnabled();
      await page.unroute("**/api/saveSettings", delayedSaveSettings);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("guardrails completion toggle rolls back when save fails", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    const projectContext = await openIsolatedProject(page);
    await openProjectAiSettingsPopover(page);
    try {
      const settingsPanel = getVisibleProjectAiSettings(page);
      const guardrailsTrigger = settingsPanel.getByTestId(
        "project-ai-settings-accordion-guardrails",
      );
      if ((await guardrailsTrigger.getAttribute("aria-expanded")) !== "true") {
        await guardrailsTrigger.click();
      }

      const completionGuardToggle = settingsPanel.getByTestId(
        "project-ai-settings-completion-guard-toggle",
      );
      await expect(completionGuardToggle).toBeVisible();
      const initiallyChecked = await completionGuardToggle.isChecked();

      allowExpectedApiError(page, {
        path: "/api/saveSettings",
        statuses: [500],
        method: "POST",
      });
      let shouldFailSave = true;
      const failSaveSettings = async (route: Route) => {
        if (!shouldFailSave) {
          await route.continue();
          return;
        }
        shouldFailSave = false;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ detail: "saveSettings failed in test" }),
        });
      };
      await page.route("**/api/saveSettings", failSaveSettings);
      const saveResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes("/api/saveSettings") &&
          response.request().method() === "POST",
      );
      await completionGuardToggle.click();
      const saveResponse = await saveResponsePromise;
      expect(saveResponse.status()).toBe(500);
      if (initiallyChecked) {
        await expect(completionGuardToggle).toBeChecked();
      } else {
        await expect(completionGuardToggle).not.toBeChecked();
      }
      await page.unroute("**/api/saveSettings", failSaveSettings);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
