import { expect, test } from "@playwright/test";

import { ensureAppReady, postBackend, seedLocalStorage } from "../helpers";

type AppSpecPayload = {
  root: Record<string, unknown>;
  elements: Record<string, unknown>;
};

type AppDefinitionResponse = {
  appSpec: unknown | null;
  appDefinition: unknown | null;
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
  await expect(page.getByText("App Config")).toBeVisible();

  const specEditor = page.getByRole("textbox", { name: "App Spec JSON" });
  await specEditor.fill(JSON.stringify(appSpec, null, 2));
  const saveButton = page.getByRole("button", { name: "Save" });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();

  await expect
    .poll(
      async () => {
        const response = await postBackend<AppDefinitionResponse>(
          page,
          "/getAppDefinition",
          {},
        );
        return JSON.stringify(response?.appSpec ?? null);
      },
      {
        timeout: 30_000,
      },
    )
    .toContain("Download Report");

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
});
