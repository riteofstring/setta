import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  openIsolatedProject,
  postBackend,
} from "../../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

test("root redirect resolves the default project through Go metadata", async ({
  page,
}) => {
  const apiUrls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/")) {
      apiUrls.push(request.url());
    }
  });

  const projectContext = await openIsolatedProject(page);

  try {
    const metadata = await postBackend<{
      defaultProjectConfigId: string | null;
      projectMetadata: Array<{ id: string; name: string }>;
    }>(page, "/loadAllProjectMetadata", {});
    const projectName =
      metadata?.projectMetadata.find(
        (project) => project.id === projectContext.projectConfigId,
      )?.name ?? null;
    expect(projectName).not.toBeNull();

    await postBackend(page, "/setAsDefaultProject", {
      projectConfigId: projectContext.projectConfigId,
    });
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

    // The live root redirect should hydrate through the Go metadata route and
    // land on the configured project name.
    await expect(page).toHaveURL(
      new RegExp(`/${encodeURIComponent(projectName ?? "")}$`),
    );
    await expect
      .poll(() => {
        return (
          apiUrls.find((url) => url.includes("/api/loadAllProjectMetadata")) ??
          null
        );
      })
      .not.toBeNull();
    // The Python-era helper route must stay unused once the redirect caller is
    // migrated.
    expect(
      apiUrls.some((url) => url.includes("/api/getDefaultConfigName")),
    ).toBe(false);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
