import { expect, test } from "@playwright/test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createChatSection,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
  seedLocalStorage,
} from "../helpers";

type CapabilityPolicy = {
  mode: "disabled" | "inherit" | "custom";
  enabledSkillIds: string[];
  enabledMcpServerIds: string[];
};

test.describe.serial("chat capabilities", () => {
  test.setTimeout(300_000);

  test("section + project capabilities persist and surface unavailable skill selections", async ({
    page,
  }) => {
    const skillRoot = mkdtempSync(join(tmpdir(), "setta-capabilities-"));
    const skillDirName = "planner";
    const skillDir = join(skillRoot, skillDirName);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      `---\nname: E2E Planner\ndescription: Planner skill for Playwright\nmetadata:\n  version: 1.0.0\n---\nUse this skill to validate capability plumbing.\n`,
      "utf-8",
    );

    const skillSourceId = "e2e_skill_source";
    const skillId = `${skillSourceId}::${skillDirName}`;

    let projectContext: { projectConfigId: string } | null = null;

    try {
      await postBackend(page, "/setSkillSources", {
        skillSources: [
          {
            id: skillSourceId,
            path: skillRoot,
            label: "Playwright e2e skills",
            builtin: false,
          },
        ],
      });
      await postBackend(page, "/setGlobalCapabilityDefaults", {
        defaultSkillIds: [skillId],
        defaultMcpServerIds: [],
      });

      await seedLocalStorage(page, {
        uiEditorVis: true,
        overviewVis: true,
        overviewTab: "ProjectAIChat",
      });
      await ensureAppReady(page);
      projectContext = await openIsolatedProject(page);

      const { sectionId } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_capabilities_chat__",
      );

      const chatNode = page.locator(
        `.react-flow__node[data-id="${sectionId}"]`,
      );
      await expect(chatNode).toBeVisible();
      await chatNode.click();

      const uiEditorPane = page.locator("#UiEditorPane");
      await expect(uiEditorPane).toBeVisible();
      await expect(uiEditorPane.getByText("AI Capabilities")).toBeVisible();
      await uiEditorPane.getByRole("tab", { name: "MCP" }).first().click();
      await expect(
        uiEditorPane.getByText("MCP Servers", { exact: true }),
      ).toBeVisible();

      await uiEditorPane
        .getByRole("tab", { name: "Skills" })
        .first()
        .click();
      await uiEditorPane
        .getByRole("button", { name: "Custom", exact: true })
        .click();
      const sectionSkillLabel = uiEditorPane.locator(
        `div.max-h-36 label:has-text("${skillId}")`,
      );
      await sectionSkillLabel.first().scrollIntoViewIfNeeded();
      await sectionSkillLabel.first().click({ force: true });

      await expect
        .poll(async () => {
          const policy = await postBackend<CapabilityPolicy>(
            page,
            "/getChatSectionCapabilityPolicy",
            {
              projectConfigId: projectContext?.projectConfigId,
              sectionId,
            },
          );
          return `${policy?.mode}:${policy?.enabledSkillIds?.join(",")}`;
        })
        .toBe(`custom:${skillId}`);

      const overviewPane = page.locator("#OverviewPane");
      await expect(overviewPane).toBeVisible();
      await overviewPane
        .getByRole("button", { name: "View Capabilities" })
        .click();
      await expect(
        overviewPane.getByText("Project Chat Capabilities"),
      ).toBeVisible();
      await overviewPane.getByRole("tab", { name: "MCP" }).first().click();
      await expect(
        overviewPane.getByText("MCP Servers", { exact: true }),
      ).toBeVisible();

      await overviewPane
        .getByRole("tab", { name: "Skills" })
        .first()
        .click();
      await overviewPane.getByRole("button", { name: "Custom" }).click();
      const projectSkillLabel = overviewPane.locator(
        `div.max-h-64 label:has-text("${skillId}")`,
      );
      await projectSkillLabel.first().scrollIntoViewIfNeeded();
      await projectSkillLabel.first().click({ force: true });

      await expect
        .poll(async () => {
          const policy = await postBackend<CapabilityPolicy>(
            page,
            "/getProjectChatCapabilityPolicy",
            {
              projectConfigId: projectContext?.projectConfigId,
              chatId: null,
            },
          );
          return `${policy?.mode}:${policy?.enabledSkillIds?.join(",")}`;
        })
        .toBe(`custom:${skillId}`);
      await overviewPane.getByRole("button", { name: "Inherit" }).click();
      await expect
        .poll(async () => {
          const policy = await postBackend<CapabilityPolicy>(
            page,
            "/getProjectChatCapabilityPolicy",
            {
              projectConfigId: projectContext?.projectConfigId,
              chatId: null,
            },
          );
          return `${policy?.mode}:${policy?.enabledSkillIds?.join(",")}`;
        })
        .toBe(`inherit:${skillId}`);
      await overviewPane.getByRole("button", { name: "Custom" }).click();
      await expect
        .poll(async () => {
          const policy = await postBackend<CapabilityPolicy>(
            page,
            "/getProjectChatCapabilityPolicy",
            {
              projectConfigId: projectContext?.projectConfigId,
              chatId: null,
            },
          );
          return `${policy?.mode}:${policy?.enabledSkillIds?.join(",")}`;
        })
        .toBe(`custom:${skillId}`);

      await postBackend(page, "/setSkillSources", { skillSources: [] });
      await uiEditorPane
        .getByRole("button", { name: "Refresh" })
        .first()
        .click();
      await expect(
        uiEditorPane.getByText(`Unavailable selected skills: ${skillId}`),
      ).toBeVisible();

      await overviewPane
        .getByRole("button", { name: "Refresh" })
        .first()
        .click();
      await expect(
        overviewPane.getByText(`Unavailable selected skills: ${skillId}`),
      ).toBeVisible();
    } finally {
      rmSync(skillRoot, { recursive: true, force: true });
    }
  });
});
