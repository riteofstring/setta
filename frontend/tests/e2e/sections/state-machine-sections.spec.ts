import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
  seedLocalStorage,
} from "../helpers";

type CreateSectionResponse = {
  sectionId?: string;
};

type LatestProjectStateResponse = {
  projectState?: {
    projectConfig?: {
      sectionVariantMap?: Record<string, string>;
    };
    sections?: Record<
      string,
      {
        sharedModifier?: {
          machineGroupId?: string;
          label?: string;
        };
      }
    >;
    sectionVariants?: Record<
      string,
      {
        impl?: string;
        modifier?: {
          machineGroupId?: string;
          label?: string;
        };
      }
    >;
    sectionImpls?: Record<
      string,
      {
        type?: string;
        machineGroupId?: string;
        label?: string;
      }
    >;
  };
};

test.describe.serial("state machine sections", () => {
  test("creates workflow sections and edits gate settings", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
      uiEditorTab: {
        StateMachineStart: "SectionConfig",
        StateMachineGate: "SectionConfig",
        StateMachineEnd: "SectionConfig",
      },
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const startSectionId = await createSectionViaCommandPalette(
        page,
        projectContext.projectConfigId,
        "State Machine Start",
      );
      const gateSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "StateMachineGate",
        { x: 520, y: 80 },
      );
      const endSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "StateMachineEnd",
        { x: 1040, y: 80 },
      );

      const startNode = page.getByTestId(`rf__node-${startSectionId}`);
      const gateNode = page.getByTestId(`rf__node-${gateSectionId}`);
      const endNode = page.getByTestId(`rf__node-${endSectionId}`);

      await expect(startNode).toContainText("Workflow");
      await expect(startNode).toContainText("Start");
      await expect(gateNode).toContainText("Workflow");
      await expect(gateNode).toContainText("AND Gate");
      await expect(endNode).toContainText("Workflow");
      await expect(endNode).toContainText("End");

      await gateNode.click();
      const uiEditorPane = page.locator("#UiEditorPane");
      await expect(uiEditorPane).toBeVisible();
      await expect(uiEditorPane.getByLabel("Machine Group ID")).toBeVisible();
      await expect(uiEditorPane.getByLabel("Label")).toBeVisible();
      await expect(
        uiEditorPane.getByText("Gate Type", { exact: true }),
      ).toBeVisible();

      const machineGroupInput = uiEditorPane.getByLabel("Machine Group ID");
      await machineGroupInput.fill("workflow-main");
      await machineGroupInput.blur();

      const labelInput = uiEditorPane.getByLabel("Label");
      await labelInput.fill("Review Gate");
      await labelInput.blur();

      await expect(gateNode).toContainText("Review Gate");
      await expect(gateNode).toContainText("workflow-main");

      await expect
        .poll(
          async () =>
            await readStateMachineImpl(
              page,
              projectContext.projectConfigId,
              gateSectionId,
            ),
          { timeout: 8000 },
        )
        .toMatchObject({
          type: "StateMachineGate",
          machineGroupId: "workflow-main",
          label: "Review Gate",
        });
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});

async function createSectionViaCommandPalette(
  page: Page,
  projectConfigId: string,
  optionName: string,
): Promise<string> {
  const existingSectionIds = await getSectionIds(page, projectConfigId);
  const shortcut =
    process.platform === "darwin" ? "Meta+Shift+P" : "Control+Shift+P";
  const searchInput = page.locator("#ProjectPageSearchBar");

  await page.keyboard.press(shortcut);
  await expect(searchInput).toBeVisible({ timeout: 3000 });
  await searchInput.fill(optionName);

  const option = page
    .getByRole("option", { name: optionName, exact: true })
    .first();
  if (await option.isVisible({ timeout: 2500 })) {
    await option.click();
  } else {
    await page.keyboard.press("Enter");
  }

  return await waitForNewSectionId(page, projectConfigId, existingSectionIds);
}

async function createTopLevelSection(
  page: Page,
  projectConfigId: string,
  implType: "StateMachineGate" | "StateMachineEnd",
  position: { x: number; y: number },
): Promise<string> {
  const response = await postBackend<CreateSectionResponse>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType,
      position,
    },
  );
  if (!response?.sectionId) {
    throw new Error(`Missing sectionId when creating ${implType}.`);
  }
  return response.sectionId;
}

async function getSectionIds(
  page: Page,
  projectConfigId: string,
): Promise<string[]> {
  const response = await postBackend<LatestProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  return Object.keys(
    response?.projectState?.projectConfig?.sectionVariantMap ?? {},
  );
}

async function waitForNewSectionId(
  page: Page,
  projectConfigId: string,
  existingSectionIds: string[],
): Promise<string> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 8000) {
    const currentSectionIds = await getSectionIds(page, projectConfigId);
    const newSectionIds = currentSectionIds.filter(
      (sectionId) => !existingSectionIds.includes(sectionId),
    );
    if (newSectionIds.length === 1) {
      return newSectionIds[0];
    }
    await page.waitForTimeout(100);
  }
  throw new Error("Timed out waiting for workflow section creation.");
}

async function readStateMachineImpl(
  page: Page,
  projectConfigId: string,
  sectionId: string,
): Promise<{
  type: string | null;
  machineGroupId: string | null;
  label: string | null;
}> {
  const response = await postBackend<LatestProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  const projectState = response?.projectState;
  const sectionVariantId =
    projectState?.projectConfig?.sectionVariantMap?.[sectionId];
  if (!sectionVariantId) {
    return {
      type: null,
      machineGroupId: null,
      label: null,
    };
  }
  const sectionImplId = projectState.sectionVariants?.[sectionVariantId]?.impl;
  if (!sectionImplId) {
    return {
      type: null,
      machineGroupId: null,
      label: null,
    };
  }
  const sectionVariant = projectState.sectionVariants?.[sectionVariantId];
  const sectionCore = projectState.sections?.[sectionId];
  const sectionImpl = projectState.sectionImpls?.[sectionImplId];
  return {
    type: sectionImpl?.type ?? null,
    machineGroupId:
      sectionVariant?.modifier?.machineGroupId ??
      sectionCore?.sharedModifier?.machineGroupId ??
      sectionImpl?.machineGroupId ??
      null,
    label:
      sectionVariant?.modifier?.label ??
      sectionCore?.sharedModifier?.label ??
      sectionImpl?.label ??
      null,
  };
}
