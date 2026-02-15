import { expect, Locator, test } from "@playwright/test";
import {
  ensureAppReady,
  getCurrentProjectConfigId,
  postBackend,
  seedLocalStorage,
  setOverviewTab,
} from "../helpers";

type CreateTopLevelSectionResponse = {
  sectionId?: string;
};

async function focusCallableSection(page: import("@playwright/test").Page) {
  const projectConfigId = await getCurrentProjectConfigId(page);
  const created = await postBackend<CreateTopLevelSectionResponse>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType: "Callable",
    },
  );
  const sectionId = created?.sectionId;
  if (!sectionId) {
    throw new Error("Failed to create callable section for pane-scroll test.");
  }

  await page.evaluate(async (targetSectionId: string) => {
    const { applyActiveSectionChange } = await import(
      "/src/state/actions/activeSectionController"
    );
    applyActiveSectionChange({
      interaction: "go-to",
      sectionId: targetSectionId,
    });
  }, sectionId);
}

async function assertScrollRegionUsesStableGutter(
  locator: Locator,
): Promise<void> {
  await expect(locator).toBeVisible();
  const style = await locator.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      overflowY: computed.overflowY,
      overflowX: computed.overflowX,
      paddingRight: Number.parseFloat(computed.paddingRight),
      marginRight: Number.parseFloat(computed.marginRight),
    };
  });

  expect(style.overflowY).toBe("scroll");
  expect(style.overflowX).toBe("hidden");
  expect(style.paddingRight).toBeGreaterThanOrEqual(0);
  expect(style.paddingRight).toBeLessThanOrEqual(1);
  expect(style.marginRight).toBeGreaterThanOrEqual(0);
  expect(style.marginRight).toBeLessThanOrEqual(1);
}

async function seedManyLlmApiKeys(
  page: import("@playwright/test").Page,
): Promise<void> {
  const configs: Record<string, { model: string; provider: string; api_key_env: string }> =
    {};
  for (let i = 0; i < 28; i += 1) {
    configs[`e2e-key-${i}`] = {
      model: "claude-3-5-sonnet-latest",
      provider: "anthropic",
      api_key_env: `ANTHROPIC_API_KEY_${i}`,
    };
  }
  await postBackend(page, "/llm/config", {
    configs,
    default_config_id: "e2e-key-0",
  });
}

test("pane scroll regions reserve gutter and prevent horizontal content shift", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewVis: true,
    overviewTab: "RunInstructions",
    uiEditorVis: true,
  });
  await ensureAppReady(page);

  await focusCallableSection(page);

  await setOverviewTab(page, "RunInstructions");
  await page.reload({ waitUntil: "domcontentloaded" });
  await ensureAppReady(page);
  await assertScrollRegionUsesStableGutter(
    page.getByTestId("run-instructions-scroll-region"),
  );

  await setOverviewTab(page, "ProjectAISettings");
  await page.reload({ waitUntil: "domcontentloaded" });
  await ensureAppReady(page);

  const llmKeysTrigger = page.getByTestId(
    "project-ai-settings-accordion-llm-api-keys",
  );
  await expect(llmKeysTrigger).toBeVisible();
  const baselineTriggerLeft = (
    await llmKeysTrigger.boundingBox()
  )?.x;
  if (baselineTriggerLeft === undefined) {
    throw new Error("Unable to resolve LLM keys trigger geometry before key seed.");
  }

  await seedManyLlmApiKeys(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await ensureAppReady(page);
  await assertScrollRegionUsesStableGutter(
    page.getByTestId("project-ai-settings-scroll-region"),
  );

  const nextTriggerLeft = (
    await page
      .getByTestId("project-ai-settings-accordion-llm-api-keys")
      .boundingBox()
  )?.x;
  if (nextTriggerLeft === undefined) {
    throw new Error("Unable to resolve LLM keys trigger geometry after key seed.");
  }
  expect(Math.abs(nextTriggerLeft - baselineTriggerLeft)).toBeLessThanOrEqual(1);

});
