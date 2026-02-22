import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createCallableSection,
  openIsolatedProject,
  postBackend,
  setOverviewTab,
} from "../../helpers";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const RIGHT_PANE_SETTING_ID = "core.project.show_param_display_names";

type ToolError = {
  code: string;
  message: string;
};

type RevealUISettingResult = {
  projectConfigId: string;
  emittedRevealCount: number;
  statuses: Array<{
    status: "revealed" | "failed";
    error: ToolError | null;
  }>;
};

type ProjectStateSummarySection = {
  sectionId?: string;
  coreName?: string;
};

type ProjectStateSummaryResult = {
  sections?: ProjectStateSummarySection[];
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

async function resolveTemporarySectionIdFromSummary(
  page: Page,
  projectConfigId: string,
  temporaryProjectConfigId: string,
  sectionName: string,
): Promise<string> {
  const summary = await callMcpTool<ProjectStateSummaryResult>(
    page,
    projectConfigId,
    "get_latest_project_state_summary",
    {
      projectConfigId: temporaryProjectConfigId,
    },
  );
  const sections = Array.isArray(summary.sections) ? summary.sections : [];
  const matchedSection = sections.find(
    (section) =>
      typeof section.coreName === "string" && section.coreName === sectionName,
  );
  if (!matchedSection || typeof matchedSection.sectionId !== "string") {
    const sectionNames = sections
      .map((section) => section.coreName)
      .filter((name): name is string => typeof name === "string");
    throw new Error(
      `Unable to resolve temporary section id for ${sectionName}. Available section names: ${JSON.stringify(sectionNames)}`,
    );
  }
  return matchedSection.sectionId;
}

test("right-pane reveal_ui_setting returns failure when no section is active", async ({
  page,
}) => {
  await setOverviewTab(page, "Overview");
  const projectContext = await openIsolatedProject(page);
  const sectionId = await createCallableSection(
    page,
    projectContext.projectConfigId,
  );

  try {
    await postBackend(page, "/setActiveIds", {
      projectConfigId: projectContext.projectConfigId,
      activeIds: [],
    });

    const revealResult = await callMcpTool<RevealUISettingResult>(
      page,
      projectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: RIGHT_PANE_SETTING_ID,
      },
    );
    expect(revealResult.emittedRevealCount).toBe(0);
    expect(revealResult.statuses[0]?.status).toBe("failed");
    expect(revealResult.statuses[0]?.error?.code).toBe("mutation_failed");
    expect(revealResult.statuses[0]?.error?.message).toContain(
      "sectionIdToActivate",
    );

    await expect(page.getByTestId("ui-editor-tab-content-shell")).toHaveCount(
      0,
    );
    await expect(
      page.locator(
        '[data-setting-anchor="core.project.show_param_display_names"]',
      ),
    ).toHaveCount(0);

    // Keep the created section referenced so test intent is explicit.
    expect(sectionId).toBeTruthy();
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("right-pane reveal_ui_setting activates section from sectionIdToActivate", async ({
  page,
}) => {
  await setOverviewTab(page, "Overview");
  const projectContext = await openIsolatedProject(page);
  const sectionId = await createCallableSection(
    page,
    projectContext.projectConfigId,
  );
  const sectionName = `right-pane-target-${Date.now()}`;

  try {
    await postBackend(page, "/setSectionName", {
      projectConfigId: projectContext.projectConfigId,
      sectionId,
      name: sectionName,
    });
    await postBackend(page, "/setActiveIds", {
      projectConfigId: projectContext.projectConfigId,
      activeIds: [],
    });
    const seedResult = await callMcpTool<RevealUISettingResult>(
      page,
      projectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: RIGHT_PANE_SETTING_ID,
      },
    );
    if (typeof seedResult.projectConfigId !== "string") {
      throw new Error(
        `Expected temporary projectConfigId in seed result: ${JSON.stringify(seedResult)}`,
      );
    }
    const temporarySectionId = await resolveTemporarySectionIdFromSummary(
      page,
      projectContext.projectConfigId,
      seedResult.projectConfigId,
      sectionName,
    );

    const revealResult = await callMcpTool<RevealUISettingResult>(
      page,
      projectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: RIGHT_PANE_SETTING_ID,
        sectionIdToActivate: temporarySectionId,
        durationMs: 8000,
      },
    );
    expect(
      revealResult.emittedRevealCount,
      `Unexpected reveal result: ${JSON.stringify(revealResult)}`,
    ).toBe(1);
    expect(revealResult.statuses[0]?.status).toBe("revealed");
    expect(revealResult.statuses[0]?.error).toBeNull();

    const rightPaneShell = page.getByTestId("ui-editor-tab-content-shell");
    await expect(rightPaneShell).toBeVisible();
    await expect(rightPaneShell.locator("h2")).toContainText("Quick Info");

    const settingAnchor = page.locator(
      '[data-setting-anchor="core.project.show_param_display_names"]',
    );
    await expect(settingAnchor).toBeVisible();
    await expect(settingAnchor).toHaveClass(
      /setta-ui-setting-reveal-highlight/,
    );

    const latestProjectState = await postBackend<{
      projectState?: {
        projectConfig?: { activeIds?: string[] };
      };
    }>(page, "/getLatestProjectState", {
      projectConfigId: projectContext.projectConfigId,
    });
    expect(latestProjectState?.projectState?.projectConfig?.activeIds).toEqual([
      sectionId,
    ]);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
