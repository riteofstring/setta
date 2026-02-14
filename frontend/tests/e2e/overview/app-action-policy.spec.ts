import { expect, test } from "@playwright/test";

import {
  cleanupIsolatedProject,
  ensureAppReady,
  openIsolatedProject,
  seedLocalStorage,
} from "../helpers";

type AppSpecPayload = {
  root: Record<string, unknown>;
  elements: Record<string, unknown>;
};

test("app action buttons respect policy gating", async ({ page }) => {
  const appSpec: AppSpecPayload = {
    root: {
      key: "app-root",
      type: "Stack",
      props: { direction: "column", gap: 12 },
      children: [
        {
          key: "download",
          type: "ActionButton",
          props: {
            label: "Download Report",
            action: "downloadArtifact",
          },
        },
        {
          key: "link",
          type: "ActionButton",
          props: {
            label: "Open Docs",
            action: "openExternalLink",
          },
        },
      ],
    },
    elements: {},
  };

  await seedLocalStorage(page, { overviewTab: "App", overviewVis: true });
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await expect(page.getByText("App Config")).toBeVisible();

    const specEditor = page.getByRole("textbox", { name: "App Spec JSON" });
    await specEditor.fill(JSON.stringify(appSpec, null, 2));
    const saveButton = page.getByRole("button", { name: "Save", exact: true });
    await expect(saveButton).toBeEnabled();
    await Promise.all([
      page.waitForResponse((response) => {
        return response.url().includes("/setAppDefinition") && response.ok();
      }),
      saveButton.click(),
    ]);

    const previewToggle = page.getByRole("button", {
      name: /Show Preview|Hide Preview/,
    });
    await expect(previewToggle).toBeVisible();
    const previewLabel = (await previewToggle.textContent())?.trim() ?? "";
    if (previewLabel === "Show Preview") {
      await previewToggle.click();
    }

    await expect(page.getByText("App Preview")).toBeVisible();

    const downloadButton = page.getByRole("button", {
      name: "Download Report",
    });
    await expect(downloadButton).toBeDisabled();
    await expect(downloadButton).toHaveAttribute(
      "title",
      "File downloads are disabled by policy.",
    );

    const linkButton = page.getByRole("button", { name: "Open Docs" });
    await expect(linkButton).toBeDisabled();
    await expect(linkButton).toHaveAttribute(
      "title",
      "External links are disabled by policy.",
    );
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
