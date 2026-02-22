import { expect, test, type Page } from "@playwright/test";

const FRONTEND_BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const HOME_URL = new URL("/home", FRONTEND_BASE_URL).toString();

type OpenWorkspaceRequest = {
  workspaceRoot: string;
  createIfMissing: boolean;
};

async function installLauncherHomeMocks(page: Page): Promise<{
  getLastOpenRequest: () => OpenWorkspaceRequest | null;
  getLastRecentWorkspacesRequestUrl: () => string | null;
}> {
  let recentWorkspaces = [
    {
      workspaceRoot: "/Users/demo/projects/alpha",
      pinned: true,
      lastUsedAt: 1735689600,
    },
    {
      workspaceRoot: "/Users/demo/projects/beta",
      pinned: false,
      lastUsedAt: 1735603200,
    },
  ];

  let lastOpenRequest: OpenWorkspaceRequest | null = null;
  let lastRecentWorkspacesRequestUrl: string | null = null;

  await page.route(`${BACKEND_ORIGIN}/api/serverMode`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ mode: "launcher" }),
    });
  });

  await page.route(`${BACKEND_ORIGIN}/api/launcherAppMode`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ launcherMode: true }),
    });
  });

  await page.route(
    `${BACKEND_ORIGIN}/api/launcherRecentWorkspaces*`,
    async (route) => {
      lastRecentWorkspacesRequestUrl = route.request().url();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, workspaces: recentWorkspaces }),
      });
    },
  );

  await page.route(
    `${BACKEND_ORIGIN}/api/pinLauncherRecentWorkspace`,
    async (route) => {
      const payload = route.request().postDataJSON() as {
        workspaceRoot: string;
        pinned: boolean;
      };
      recentWorkspaces = recentWorkspaces.map((entry) => {
        if (entry.workspaceRoot !== payload.workspaceRoot) {
          return entry;
        }
        return { ...entry, pinned: payload.pinned };
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, workspaces: recentWorkspaces }),
      });
    },
  );

  await page.route(
    `${BACKEND_ORIGIN}/api/removeLauncherRecentWorkspace`,
    async (route) => {
      const payload = route.request().postDataJSON() as {
        workspaceRoot: string;
      };
      recentWorkspaces = recentWorkspaces.filter(
        (entry) => entry.workspaceRoot !== payload.workspaceRoot,
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, workspaces: recentWorkspaces }),
      });
    },
  );

  await page.route(
    `${BACKEND_ORIGIN}/api/launcherFilesystemRoots`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, roots: ["/Users/demo"] }),
      });
    },
  );

  await page.route(
    `${BACKEND_ORIGIN}/api/listLauncherDirectory`,
    async (route) => {
      const payload = route.request().postDataJSON() as { path: string | null };
      const currentPath = payload.path;

      if (!currentPath) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            currentPath: null,
            parentPath: null,
            entries: [
              {
                name: "/Users/demo",
                path: "/Users/demo",
                isDirectory: true,
                isSymlink: false,
              },
            ],
          }),
        });
        return;
      }

      if (currentPath === "/Users/demo") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            currentPath: "/Users/demo",
            parentPath: "/Users",
            entries: [
              {
                name: "projects",
                path: "/Users/demo/projects",
                isDirectory: true,
                isSymlink: false,
              },
              {
                name: "sandbox",
                path: "/Users/demo/sandbox",
                isDirectory: true,
                isSymlink: false,
              },
            ],
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          currentPath,
          parentPath: "/Users/demo",
          entries: [
            {
              name: "alpha",
              path: `${currentPath}/alpha`,
              isDirectory: true,
              isSymlink: false,
            },
          ],
        }),
      });
    },
  );

  await page.route(
    `${BACKEND_ORIGIN}/api/openLauncherWorkspace`,
    async (route) => {
      const payload = route.request().postDataJSON() as {
        workspaceRoot: string;
        createIfMissing?: boolean;
      };
      lastOpenRequest = {
        workspaceRoot: payload.workspaceRoot,
        createIfMissing: payload.createIfMissing === true,
      };

      const queryValue = payload.createIfMissing ? "created" : "opened";
      const bootstrapUrl = `${FRONTEND_BASE_URL}/home?launcherMock=${queryValue}`;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          workspaceRoot: payload.workspaceRoot,
          bootstrapUrlFragment: bootstrapUrl,
          startedNew: true,
        }),
      });
    },
  );

  await page.route(`${BACKEND_ORIGIN}/api/launcherStatus`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, installed: false }),
    });
  });

  return {
    getLastOpenRequest: () => lastOpenRequest,
    getLastRecentWorkspacesRequestUrl: () => lastRecentWorkspacesRequestUrl,
  };
}

test("launcher home opens a selected directory workspace", async ({ page }) => {
  const mocks = await installLauncherHomeMocks(page);

  await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });

  await expect(page.getByText("Launcher Home")).toBeVisible();
  await page
    .getByTestId("launcher-directory-list")
    .getByRole("button", { name: "Browse" })
    .first()
    .click();
  await page
    .getByTestId("launcher-directory-list")
    .getByRole("button", { name: "projects" })
    .click();
  await page.getByTestId("launcher-open-selected-button").click();

  await expect(page).toHaveURL(/launcherMock=opened/);
  expect(mocks.getLastOpenRequest()).toEqual({
    workspaceRoot: "/Users/demo/projects",
    createIfMissing: false,
  });
});

test("launcher home creates and opens a new project folder", async ({
  page,
}) => {
  const mocks = await installLauncherHomeMocks(page);

  await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });

  await expect(page.getByText("Launcher Home")).toBeVisible();
  await page
    .getByTestId("launcher-directory-list")
    .getByRole("button", { name: "Browse" })
    .first()
    .click();
  await page.getByTestId("launcher-new-project-name-input").fill("fresh-app");
  await page.getByTestId("launcher-create-project-button").click();

  await expect(page).toHaveURL(/launcherMock=created/);
  expect(mocks.getLastOpenRequest()).toEqual({
    workspaceRoot: "/Users/demo/fresh-app",
    createIfMissing: true,
  });
});

test("launcher home forwards setta_home query to recent-workspaces request", async ({
  page,
}) => {
  const mocks = await installLauncherHomeMocks(page);

  await page.goto(`${HOME_URL}?setta_home=%2Ftmp%2Flauncher-home`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByText("Launcher Home")).toBeVisible();

  await expect
    .poll(() => mocks.getLastRecentWorkspacesRequestUrl(), {
      message:
        "Expected launcher recent-workspaces request URL to be captured.",
    })
    .not.toBeNull();
  expect(mocks.getLastRecentWorkspacesRequestUrl()).toContain(
    "setta_home=%2Ftmp%2Flauncher-home",
  );
});
