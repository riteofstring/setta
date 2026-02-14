import { expect, test } from "@playwright/test";
import { openIsolatedProject, postBackend, setOverviewTab } from "../helpers";

type CreateTopLevelSectionResponse = {
  sectionId?: string;
};

type CodeMirrorCompletion = {
  label: string;
  type: string;
};

test("plugin language server fixture supports settings, diagnostics, and completion", async ({
  page,
}) => {
  await setOverviewTab(page, "Plugins");
  const projectContext = await openIsolatedProject(page);

  const pluginCard = page
    .locator("article")
    .filter({
      has: page.getByRole("heading", {
        name: "setta-fixture-backend-language-server-e2e@0.1.0",
        exact: true,
      }),
    })
    .first();

  await expect(pluginCard).toBeVisible();
  await expect(
    pluginCard.getByText("Registered Language Servers", { exact: true }),
  ).toBeVisible();
  await expect(
    pluginCard.getByText("fixturedsl", { exact: true }),
  ).toBeVisible();
  await expect(
    pluginCard.getByText("settings.fixtureDslLanguageServer", {
      exact: true,
    }),
  ).toBeVisible();

  const settingsTextarea = pluginCard.getByRole("textbox", {
    name: "settings.fixtureDslLanguageServer",
    exact: true,
  });
  await expect(settingsTextarea).toBeVisible();
  await settingsTextarea.fill(`{
  "analysis": {
    "emitDiagnostics": true
  }
}`);
  await pluginCard
    .getByRole("button", { name: "Save Settings", exact: true })
    .click();
  await expect(
    pluginCard.getByText("Language server settings saved.", {
      exact: true,
    }),
  ).toBeVisible();

  const sectionName = "Fixture TS LSP";
  const createdSection = await postBackend<CreateTopLevelSectionResponse>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId: projectContext.projectConfigId,
      implType: "Code",
      implOverrides: {
        type: "Code",
        codeLanguage: "fixturedsl",
      },
    },
  );
  const sectionId = createdSection?.sectionId;
  expect(sectionId).toBeTruthy();
  if (!sectionId) {
    throw new Error("Missing created section id.");
  }

  await postBackend(page, "/setSectionName", {
    projectConfigId: projectContext.projectConfigId,
    sectionId,
    name: sectionName,
  });
  await postBackend(page, "/setCode", {
    projectConfigId: projectContext.projectConfigId,
    sectionId,
    code: "const value = __fixture_error__;\n",
  });

  const completions = await postBackend<Array<CodeMirrorCompletion>>(
    page,
    "/codeAreaCompletion",
    {
      projectConfigId: projectContext.projectConfigId,
      sectionId,
      fullText: "fixture.",
      position: 8,
    },
  );
  expect(
    completions?.some((entry) => entry.label === "fixtureCompletion"),
  ).toBe(true);

  const section = page
    .locator("section")
    .filter({
      has: page.locator("header.section-title").getByText(sectionName, {
        exact: true,
      }),
    })
    .first();
  await expect(section).toBeVisible();
  const issuesButton = section
    .locator("header.section-title")
    .getByRole("button", { name: /Issues/ })
    .first();
  await expect.poll(async () => (await issuesButton.count()) > 0).toBe(true);
  await issuesButton.click();
  await expect(
    page.getByText("Fixture TypeScript diagnostic").first(),
  ).toBeVisible();
});
