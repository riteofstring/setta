import { expect, type Locator, type Page } from "@playwright/test";
import type { AcceptanceStep } from "./types";
import type { StepDefinition } from "./runner";
import {
  createCodeSection,
  createNewProjectConfig,
  deleteProjectConfigByName,
  ensureAppReady,
  findSectionByName,
  postBackend,
} from "../helpers";

type AcceptanceContext = {
  page: Page;
  projectConfigId?: string;
  projectConfigName?: string;
  sectionId?: string;
  sectionName?: string;
  cleanups: Array<() => Promise<void>>;
};

type StepHandler = (
  context: AcceptanceContext,
  step: AcceptanceStep,
  match: RegExpMatchArray,
) => Promise<void>;

function requireDocString(step: AcceptanceStep): string {
  if (!step.docString) {
    throw new Error(`Missing doc string for step: ${step.keyword} ${step.text}`);
  }
  return step.docString;
}

function requireProjectConfigId(context: AcceptanceContext): string {
  if (!context.projectConfigId) {
    throw new Error("Missing projectConfigId. Did you create a project config?");
  }
  return context.projectConfigId;
}

function requireSectionId(context: AcceptanceContext): string {
  if (!context.sectionId) {
    throw new Error("Missing sectionId. Did you create a section?");
  }
  return context.sectionId;
}

async function resolveSectionByName(
  context: AcceptanceContext,
  name: string,
): Promise<Locator> {
  const section = findSectionByName(context.page, name).first();
  await expect(section).toBeVisible();
  return section;
}

const stepDefs: Array<{ pattern: RegExp; handler: StepHandler }> = [
  {
    pattern: /^the app is ready$/i,
    handler: async (context) => {
      await ensureAppReady(context.page);
    },
  },
  {
    pattern: /^a new project config exists$/i,
    handler: async (context) => {
      const { projectConfigId, projectConfigName } =
        await createNewProjectConfig(context.page);
      context.projectConfigId = projectConfigId;
      context.projectConfigName = projectConfigName;
      context.cleanups.push(async () => {
        await deleteProjectConfigByName(context.page, projectConfigName);
      });
    },
  },
  {
    pattern: /^I create a code section named "([^"]+)"$/i,
    handler: async (context, _step, match) => {
      const name = match[1] ?? "";
      const projectConfigId = requireProjectConfigId(context);
      const sectionId = await createCodeSection(
        context.page,
        projectConfigId,
      );
      await postBackend(context.page, "/setSectionName", {
        projectConfigId,
        sectionId,
        name,
      });
      context.sectionId = sectionId;
      context.sectionName = name;
      await resolveSectionByName(context, name);
    },
  },
  {
    pattern: /^I focus the code area for "([^"]+)"$/i,
    handler: async (context, _step, match) => {
      const name = match[1] ?? "";
      const section = await resolveSectionByName(context, name);
      const codeArea = section.locator("article.section-full-no-title").first();
      await expect(codeArea).toBeVisible();
      await codeArea.click();
    },
  },
  {
    pattern: /^I set the code to$/i,
    handler: async (context, step) => {
      const code = requireDocString(step);
      const projectConfigId = requireProjectConfigId(context);
      const sectionId = requireSectionId(context);
      await postBackend(context.page, "/setCode", {
        projectConfigId,
        sectionId,
        code,
      });
    },
  },
  {
    pattern: /^I press "([^"]+)"$/i,
    handler: async (context, _step, match) => {
      const key = match[1] ?? "";
      await context.page.keyboard.press(key);
    },
  },
  {
    pattern: /^I should see "([^"]+)"$/i,
    handler: async (context, _step, match) => {
      const text = match[1] ?? "";
      await expect(context.page.getByText(text).first()).toBeVisible();
    },
  },
  {
    pattern: /^I open the Issues panel for "([^"]+)"$/i,
    handler: async (context, _step, match) => {
      const name = match[1] ?? "";
      const section = await resolveSectionByName(context, name);
      const issuesButton = section
        .locator("header.section-title")
        .getByRole("button", { name: /Issues/ })
        .first();
      await expect(issuesButton).toBeVisible();
      await issuesButton.click();
    },
  },
];

export const stepDefinitions: StepDefinition[] = stepDefs.map((def) => ({
  pattern: def.pattern,
  handler: def.handler,
}));
