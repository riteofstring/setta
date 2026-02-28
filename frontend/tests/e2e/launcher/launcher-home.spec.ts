import { expect, test, type Page } from "@playwright/test";

const FRONTEND_BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const HOME_URL = new URL("/home", FRONTEND_BASE_URL).toString();

type OpenWorkspaceRequest = {
  workspaceRoot: string;
  createIfMissing: boolean;
  settaHome: string | null;
};

type PinWorkspaceRequest = {
  workspaceRoot: string;
  pinned: boolean;
  settaHome: string | null;
};

type RemoveWorkspaceRequest = {
  workspaceRoot: string;
  settaHome: string | null;
};

type ListDirectoryRequest = {
  path: string | null;
  cursor: string | null;
  pageSize: number | null;
};

type LauncherHomeMockOptions = {
  delayedLoadMoreGate?: Promise<void>;
  projectsListingTruncated?: boolean;
};

function createRouteGate(): { wait: Promise<void>; release: () => void } {
  let gateRelease: (() => void) | null = null;
  const wait = new Promise<void>((resolve) => {
    gateRelease = resolve;
  });
  return {
    wait,
    release: () => {
      if (gateRelease) {
        gateRelease();
      }
    },
  };
}

const LAUNCHER_MANAGEMENT_ENDPOINT_PATTERNS = [
  `${BACKEND_ORIGIN}/api/launcherStatus*`,
  `${BACKEND_ORIGIN}/api/setupLauncher`,
  `${BACKEND_ORIGIN}/api/repairLauncher`,
  `${BACKEND_ORIGIN}/api/removeLauncher`,
  `${BACKEND_ORIGIN}/api/updateLauncher`,
];

async function installLauncherHomeMocks(
  page: Page,
  options?: LauncherHomeMockOptions,
): Promise<{
  getLastOpenRequest: () => OpenWorkspaceRequest | null;
  getLastPinRequest: () => PinWorkspaceRequest | null;
  getLastRemoveRecentRequest: () => RemoveWorkspaceRequest | null;
  getLastRecentWorkspacesRequestUrl: () => string | null;
  getListDirectoryRequests: () => Array<ListDirectoryRequest>;
  getLauncherManagementRequestCount: () => number;
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
  let lastPinRequest: PinWorkspaceRequest | null = null;
  let lastRemoveRecentRequest: RemoveWorkspaceRequest | null = null;
  let lastRecentWorkspacesRequestUrl: string | null = null;
  const listDirectoryRequests: Array<ListDirectoryRequest> = [];
  let launcherManagementRequestCount = 0;

  await page.route(`${BACKEND_ORIGIN}/api/serverMode`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ mode: "launcher" }),
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
        settaHome?: string | null;
      };
      lastPinRequest = {
        workspaceRoot: payload.workspaceRoot,
        pinned: payload.pinned,
        settaHome: payload.settaHome ?? null,
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
        settaHome?: string | null;
      };
      lastRemoveRecentRequest = {
        workspaceRoot: payload.workspaceRoot,
        settaHome: payload.settaHome ?? null,
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
      const payload = route.request().postDataJSON() as {
        path?: string | null;
        cursor?: string | null;
        pageSize?: number | null;
      };
      const currentPath = payload.path ?? null;
      const cursor = payload.cursor ?? null;
      const pageSize = payload.pageSize ?? null;
      listDirectoryRequests.push({ path: currentPath, cursor, pageSize });

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
            hasMore: false,
            nextCursor: null,
            truncated: false,
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
            hasMore: false,
            nextCursor: null,
            truncated: false,
          }),
        });
        return;
      }

      if (currentPath === "/Users/demo/projects") {
        if (options?.projectsListingTruncated === true) {
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
                  path: "/Users/demo/projects/alpha",
                  isDirectory: true,
                  isSymlink: false,
                },
                {
                  name: "beta",
                  path: "/Users/demo/projects/beta",
                  isDirectory: true,
                  isSymlink: false,
                },
              ],
              hasMore: false,
              nextCursor: null,
              truncated: true,
            }),
          });
          return;
        }
        if (cursor === "2") {
          if (options?.delayedLoadMoreGate) {
            await options.delayedLoadMoreGate;
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
                  name: "gamma",
                  path: "/Users/demo/projects/gamma",
                  isDirectory: true,
                  isSymlink: false,
                },
              ],
              hasMore: false,
              nextCursor: null,
              truncated: false,
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
                path: "/Users/demo/projects/alpha",
                isDirectory: true,
                isSymlink: false,
              },
              {
                name: "beta",
                path: "/Users/demo/projects/beta",
                isDirectory: true,
                isSymlink: false,
              },
            ],
            hasMore: true,
            nextCursor: "2",
            truncated: false,
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
          hasMore: false,
          nextCursor: null,
          truncated: false,
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
        settaHome?: string | null;
      };
      lastOpenRequest = {
        workspaceRoot: payload.workspaceRoot,
        createIfMissing: payload.createIfMissing === true,
        settaHome: payload.settaHome ?? null,
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

  for (const endpointPattern of LAUNCHER_MANAGEMENT_ENDPOINT_PATTERNS) {
    await page.route(endpointPattern, async (route) => {
      launcherManagementRequestCount += 1;
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          detail: "Launcher mode does not allow this endpoint.",
        }),
      });
    });
  }

  return {
    getLastOpenRequest: () => lastOpenRequest,
    getLastPinRequest: () => lastPinRequest,
    getLastRemoveRecentRequest: () => lastRemoveRecentRequest,
    getLastRecentWorkspacesRequestUrl: () => lastRecentWorkspacesRequestUrl,
    getListDirectoryRequests: () => [...listDirectoryRequests],
    getLauncherManagementRequestCount: () => launcherManagementRequestCount,
  };
}

test("launcher home hides desktop launcher management controls", async ({
  page,
}) => {
  const mocks = await installLauncherHomeMocks(page);

  await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });

  await expect(page.getByText("Launcher Home")).toBeVisible();
  await expect(
    page.getByTestId("desktop-launcher-settings-section"),
  ).toHaveCount(0);
  expect(mocks.getLauncherManagementRequestCount()).toBe(0);
});

test("launcher directory picker loads continuation pages via cursor", async ({
  page,
}) => {
  const mocks = await installLauncherHomeMocks(page);

  await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });

  await page
    .getByTestId("launcher-directory-list")
    .getByRole("button", { name: "Browse" })
    .first()
    .click();
  await page
    .getByTestId("launcher-directory-list")
    .getByRole("button", { name: "Browse" })
    .first()
    .click();

  await expect(
    page.getByTestId("launcher-directory-list").getByRole("button", {
      name: "alpha",
    }),
  ).toBeVisible();
  await expect(
    page.getByTestId("launcher-directory-list").getByRole("button", {
      name: "gamma",
    }),
  ).toHaveCount(0);
  await page.getByTestId("launcher-directory-load-more").click();
  await expect(
    page.getByTestId("launcher-directory-list").getByRole("button", {
      name: "gamma",
    }),
  ).toBeVisible();

  const projectDirectoryRequests = mocks
    .getListDirectoryRequests()
    .filter((request) => request.path === "/Users/demo/projects");
  expect(projectDirectoryRequests).toEqual([
    {
      path: "/Users/demo/projects",
      cursor: null,
      pageSize: 250,
    },
    {
      path: "/Users/demo/projects",
      cursor: "2",
      pageSize: 250,
    },
  ]);
});

test("launcher directory picker blocks conflicting actions while loading more", async ({
  page,
}) => {
  const gate = createRouteGate();
  await installLauncherHomeMocks(page, { delayedLoadMoreGate: gate.wait });

  await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });

  await page
    .getByTestId("launcher-directory-list")
    .getByRole("button", { name: "Browse" })
    .first()
    .click();
  await page
    .getByTestId("launcher-directory-list")
    .getByRole("button", { name: "Browse" })
    .first()
    .click();

  const loadMore = page.getByTestId("launcher-directory-load-more");
  await loadMore.click();
  await expect(loadMore).toHaveText("Loading...");
  await expect(page.getByRole("button", { name: "Up" })).toBeDisabled();
  const browseButtons = page
    .getByTestId("launcher-directory-list")
    .getByRole("button", {
      name: "Browse",
    });
  await expect(browseButtons).toHaveCount(2);
  await expect(browseButtons.nth(0)).toBeDisabled();
  await expect(browseButtons.nth(1)).toBeDisabled();

  gate.release();

  await expect(
    page.getByTestId("launcher-directory-list").getByRole("button", {
      name: "gamma",
    }),
  ).toBeVisible();
});

test("launcher directory picker shows explicit truncation when backend caps scan", async ({
  page,
}) => {
  await installLauncherHomeMocks(page, { projectsListingTruncated: true });

  await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });

  await page
    .getByTestId("launcher-directory-list")
    .getByRole("button", { name: "Browse" })
    .first()
    .click();
  await page
    .getByTestId("launcher-directory-list")
    .getByRole("button", { name: "Browse" })
    .first()
    .click();

  await expect(
    page.getByTestId("launcher-directory-truncated"),
  ).toContainText("Directory results are truncated");
  await expect(page.getByTestId("launcher-directory-load-more")).toHaveCount(0);
});

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
    settaHome: null,
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
    settaHome: null,
  });
});

test("launcher home rejects dot-segment project names", async ({ page }) => {
  const mocks = await installLauncherHomeMocks(page);

  await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });

  await expect(page.getByText("Launcher Home")).toBeVisible();
  await page
    .getByTestId("launcher-directory-list")
    .getByRole("button", { name: "Browse" })
    .first()
    .click();
  await page.getByTestId("launcher-new-project-name-input").fill("..");
  await page.getByTestId("launcher-create-project-button").click();

  await expect(
    page.getByText("Project name cannot be '.' or '..'."),
  ).toBeVisible();
  expect(mocks.getLastOpenRequest()).toBeNull();
});

test("launcher mode resolves /launching intent-token handoffs", async ({
  page,
}) => {
  await installLauncherHomeMocks(page);

  const capturedLaunchRequests: Array<Record<string, unknown>> = [];
  let loadSettingsRequests = 0;
  await page.route(`${BACKEND_ORIGIN}/api/loadSettings`, async (route) => {
    loadSettingsRequests += 1;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        detail: "loadSettings should not run during launcher handoff.",
      }),
    });
  });
  await page.route(`${BACKEND_ORIGIN}/api/launch`, async (route, request) => {
    const body = request.postDataJSON();
    if (body && typeof body === "object" && !Array.isArray(body)) {
      capturedLaunchRequests.push(body as Record<string, unknown>);
    } else {
      capturedLaunchRequests.push({});
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: { message: "Intentional launcher handoff failure." },
      }),
    });
  });

  const handoffHash = await page.evaluate((launchIntentToken: string) => {
    const bytes = new TextEncoder().encode(window.location.href);
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.slice(offset, offset + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    const encodedReturnUrl = btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    const params = new URLSearchParams();
    params.set("plt", launchIntentToken);
    params.set("plr", encodedReturnUrl);
    params.set("pla", String(Date.now()));
    return params.toString();
  }, "launcher-intent-token");
  if (!handoffHash) {
    throw new Error("Failed to encode launcher handoff hash.");
  }

  await page.goto(
    `${new URL("/launching", FRONTEND_BASE_URL).toString()}#${handoffHash}`,
    { waitUntil: "domcontentloaded" },
  );
  await expect.poll(() => capturedLaunchRequests.length).toBe(1);
  expect(capturedLaunchRequests[0].launchIntentToken).toBe(
    "launcher-intent-token",
  );
  await expect(
    page.getByText("Intentional launcher handoff failure."),
  ).toBeVisible();
  expect(loadSettingsRequests).toBe(0);
  expect(page.url()).not.toContain("plt=");
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

test("launcher home propagates scoped setta_home through launcher actions", async ({
  page,
}) => {
  const mocks = await installLauncherHomeMocks(page);
  const scopedSettaHome = "/tmp/launcher-home-scope";

  await page.goto(
    `${HOME_URL}?setta_home=${encodeURIComponent(scopedSettaHome)}`,
    {
      waitUntil: "domcontentloaded",
    },
  );
  await expect(page.getByText("Launcher Home")).toBeVisible();

  await page
    .getByTestId("launcher-recent-list")
    .getByRole("button", { name: /^Pin$/ })
    .first()
    .click();
  await expect
    .poll(() => mocks.getLastPinRequest(), {
      message: "Expected pin request to be captured before remove.",
    })
    .not.toBeNull();
  const removeButton = page
    .getByTestId("launcher-recent-list")
    .getByRole("button", { name: "Remove" })
    .first();
  await expect(removeButton).toBeEnabled();
  await removeButton.click();
  await expect
    .poll(() => mocks.getLastRemoveRecentRequest(), {
      message: "Expected remove request to be captured before opening.",
    })
    .not.toBeNull();
  await page
    .getByTestId("launcher-recent-list")
    .getByRole("button", { name: "Open" })
    .first()
    .click();

  await expect(page).toHaveURL(/launcherMock=opened/);
  expect(mocks.getLastRecentWorkspacesRequestUrl()).toContain(
    `setta_home=${encodeURIComponent(scopedSettaHome)}`,
  );
  expect(mocks.getLastPinRequest()).toEqual({
    workspaceRoot: "/Users/demo/projects/beta",
    pinned: true,
    settaHome: scopedSettaHome,
  });
  expect(mocks.getLastRemoveRecentRequest()).toEqual({
    workspaceRoot: "/Users/demo/projects/alpha",
    settaHome: scopedSettaHome,
  });
  expect(mocks.getLastOpenRequest()).toEqual({
    workspaceRoot: "/Users/demo/projects/beta",
    createIfMissing: false,
    settaHome: scopedSettaHome,
  });
  expect(mocks.getLauncherManagementRequestCount()).toBe(0);
});
