import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  openIsolatedProject,
  postBackend,
  setOverviewTab,
} from "../helpers";

test.describe.serial("project ai settings accordion layout", () => {
  test("defaults to essentials open and persists accordion state", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAISettings");
    const projectContext = await openIsolatedProject(page);
    try {
      const llmKeysTrigger = page.getByTestId(
        "project-ai-settings-accordion-llm-api-keys",
      );
      const agentProfilesTrigger = page.getByTestId(
        "project-ai-settings-accordion-agent-profiles",
      );
      const promptTemplatesTrigger = page.getByTestId(
        "project-ai-settings-accordion-prompt-templates",
      );
      const externalAgentsTrigger = page.getByTestId(
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

      // Verify the default essential sections are open, with advanced sections minimized.
      await expect(llmKeysTrigger).toHaveAttribute("aria-expanded", "true");
      await expect(agentProfilesTrigger).toHaveAttribute(
        "aria-expanded",
        "true",
      );
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
      const llmApiKeyLabel = page
        .getByTestId("project-ai-settings-accordion-llm-api-keys-content")
        .getByText("ANTHROPIC_API_KEY");
      await expect(llmApiKeyLabel).toBeVisible();
      const clippingMetrics = await page.evaluate(() => {
        const itemIds = [
          "project-ai-settings-accordion-llm-api-keys-item",
          "project-ai-settings-accordion-agent-profiles-item",
          "project-ai-settings-accordion-prompt-templates-item",
          "project-ai-settings-accordion-external-agents-item",
        ];
        return itemIds.map((id) => {
          const element = document.querySelector(`[data-testid='${id}']`);
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
        expect(metric.scrollHeight - metric.clientHeight).toBeLessThanOrEqual(1);
      }

      await page.reload({ waitUntil: "domcontentloaded" });

      await expect(
        page.getByTestId("project-ai-settings-accordion-prompt-templates"),
      ).toHaveAttribute("aria-expanded", "true");
      await expect(
        page.getByTestId("project-ai-settings-accordion-agent-profiles"),
      ).toHaveAttribute("aria-expanded", "false");
      await expect(
        page.getByTestId("project-ai-settings-accordion-llm-api-keys"),
      ).toHaveAttribute("aria-expanded", "true");

      // Form controls in open sections should preserve right inset from card edges.
      const externalAgentsAccordionTrigger = page.getByTestId(
        "project-ai-settings-accordion-external-agents",
      );
      if (
        (await externalAgentsAccordionTrigger.getAttribute("aria-expanded")) !==
        "true"
      ) {
        await externalAgentsAccordionTrigger.click();
      }
      const externalAgentsContent = page.getByTestId(
        "project-ai-settings-accordion-external-agents-content",
      );
      const visibleInput = externalAgentsContent.locator("input").first();
      await expect(visibleInput).toBeVisible();
      const insetMetrics = await page.evaluate(() => {
        const input = document.querySelector<HTMLElement>(
          '[data-testid="project-ai-settings-accordion-external-agents-content"] input',
        );
        const item = document.querySelector<HTMLElement>(
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
        throw new Error("Unable to compute external-agent input inset metrics.");
      }
      expect(insetMetrics.rightInset).toBeGreaterThanOrEqual(6);

      // The internal manager list should keep item content clear of its scrollbar.
      const listInsetMetrics = await page.evaluate(() => {
        const content = document.querySelector<HTMLElement>(
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
      const controlWidths = await page.evaluate(() => {
        const content = document.querySelector<HTMLElement>(
          '[data-testid="project-ai-settings-accordion-external-agents-content"]',
        );
        if (!(content instanceof HTMLElement)) {
          return null;
        }
        const input = content.querySelector<HTMLInputElement>("input");
        const select = content.querySelector<HTMLSelectElement>("select");
        if (!(input instanceof HTMLElement) || !(select instanceof HTMLElement)) {
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
      expect(Math.abs(controlWidths.inputWidth - controlWidths.selectWidth)).toBeLessThanOrEqual(2);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("agent profile toggles are visible and default off", async ({ page }) => {
    await setOverviewTab(page, "ProjectAISettings");
    const projectContext = await openIsolatedProject(page);
    try {
      const agentProfilesTrigger = page.getByTestId(
        "project-ai-settings-accordion-agent-profiles",
      );
      if (
        (await agentProfilesTrigger.getAttribute("aria-expanded")) !== "true"
      ) {
        await agentProfilesTrigger.click();
      }

      await page.getByRole("button", { name: "New Profile" }).click();

      const backgroundFillToggle = page.getByRole("checkbox", {
        name: "Enable Background Summary Fill",
      });
      await backgroundFillToggle.scrollIntoViewIfNeeded();
      await expect(backgroundFillToggle).toBeVisible();
      await expect(backgroundFillToggle).not.toBeChecked();

      const llmTitlesToggle = page.getByRole("checkbox", {
        name: "Enable LLM Chat Titles",
      });
      await llmTitlesToggle.scrollIntoViewIfNeeded();
      await expect(llmTitlesToggle).toBeVisible();
      await expect(llmTitlesToggle).not.toBeChecked();
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
