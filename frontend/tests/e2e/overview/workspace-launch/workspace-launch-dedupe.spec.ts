import { expect, test } from "@playwright/test";
import { ensureAppReady } from "../../helpers";

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

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

test("workspace launch does not dedupe in-flight requests that only differ by profile and roots", async ({
  page,
}) => {
  await ensureAppReady(page);

  const responseGate = createRouteGate();
  const capturedLaunchBodies: Array<Record<string, unknown>> = [];
  await page.route("**/api/launch", async (route, request) => {
    const body = request.postDataJSON();
    if (isObjectRecord(body)) {
      capturedLaunchBodies.push(body);
    } else {
      capturedLaunchBodies.push({});
    }
    await responseGate.wait;
    try {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: { message: "Intentional failure for dedupe regression test." },
        }),
      });
    } catch {
      // Ignore requests that were cancelled during navigation churn.
    }
  });

  const firstRequest = {
    workspaceRoot: "/tmp/workspace",
    settaFilesLocation: "auto",
    profile: "dev-a",
    settaHome: "/tmp/setta-home-a",
    settaFilesRoot: "/tmp/state-a",
    runtimeRoot: "/tmp/runtime-a",
  };
  await page.evaluate((request) => {
    sessionStorage.setItem(
      "setta.pendingWorkspaceLaunch",
      JSON.stringify({
        request,
        returnUrl: window.location.href,
        requestedAt: Date.now(),
      }),
    );
  }, firstRequest);
  await page.goto(new URL("/launching", page.url()).toString(), {
    waitUntil: "domcontentloaded",
  });
  await expect.poll(() => capturedLaunchBodies.length).toBe(1);

  const secondRequest = {
    workspaceRoot: "/tmp/workspace",
    settaFilesLocation: "auto",
    profile: "dev-b",
    settaHome: "/tmp/setta-home-b",
    settaFilesRoot: "/tmp/state-b",
    runtimeRoot: "/tmp/runtime-b",
  };
  await page.goto(new URL("/", page.url()).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.evaluate((request) => {
    sessionStorage.setItem(
      "setta.pendingWorkspaceLaunch",
      JSON.stringify({
        request,
        returnUrl: window.location.href,
        requestedAt: Date.now(),
      }),
    );
  }, secondRequest);
  await page.goto(new URL("/launching", page.url()).toString(), {
    waitUntil: "domcontentloaded",
  });

  await expect.poll(() => capturedLaunchBodies.length).toBe(2);
  responseGate.release();
  expect(capturedLaunchBodies[0]).toMatchObject(firstRequest);
  expect(capturedLaunchBodies[1]).toMatchObject(secondRequest);
  await expect(
    page.getByText("Intentional failure for dedupe regression test."),
  ).toBeVisible();
});

test("workspace launch dedupes in-flight requests when optionals differ only by missing vs null", async ({
  page,
}) => {
  await ensureAppReady(page);

  const responseGate = createRouteGate();
  const capturedLaunchBodies: Array<Record<string, unknown>> = [];
  await page.route("**/api/launch", async (route, request) => {
    const body = request.postDataJSON();
    if (isObjectRecord(body)) {
      capturedLaunchBodies.push(body);
    } else {
      capturedLaunchBodies.push({});
    }
    await responseGate.wait;
    try {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: {
            message: "Intentional failure for null-vs-missing dedupe test.",
          },
        }),
      });
    } catch {
      // Ignore requests that were cancelled during navigation churn.
    }
  });

  const firstRequest = {
    workspaceRoot: "/tmp/workspace",
  };
  await page.evaluate((request) => {
    sessionStorage.setItem(
      "setta.pendingWorkspaceLaunch",
      JSON.stringify({
        request,
        returnUrl: window.location.href,
        requestedAt: Date.now(),
      }),
    );
  }, firstRequest);
  await page.goto(new URL("/launching", page.url()).toString(), {
    waitUntil: "domcontentloaded",
  });
  await expect.poll(() => capturedLaunchBodies.length).toBe(1);

  const secondRequest = {
    workspaceRoot: "/tmp/workspace",
    profile: null,
    settaHome: null,
    settaFilesRoot: null,
    settaFilesLocation: null,
    runtimeRoot: null,
    sshTarget: null,
    sshArgs: null,
    remoteCmd: null,
    localPort: null,
  };
  await page.goto(new URL("/", page.url()).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.evaluate((request) => {
    sessionStorage.setItem(
      "setta.pendingWorkspaceLaunch",
      JSON.stringify({
        request,
        returnUrl: window.location.href,
        requestedAt: Date.now(),
      }),
    );
  }, secondRequest);
  await page.goto(new URL("/launching", page.url()).toString(), {
    waitUntil: "domcontentloaded",
  });

  await expect.poll(() => capturedLaunchBodies.length).toBe(1);
  responseGate.release();
  await expect(
    page.getByText("Intentional failure for null-vs-missing dedupe test."),
  ).toBeVisible();
});

test("workspace launch does not dedupe when unknown future request fields differ", async ({
  page,
}) => {
  await ensureAppReady(page);

  const responseGate = createRouteGate();
  const capturedLaunchBodies: Array<Record<string, unknown>> = [];
  await page.route("**/api/launch", async (route, request) => {
    const body = request.postDataJSON();
    if (isObjectRecord(body)) {
      capturedLaunchBodies.push(body);
    } else {
      capturedLaunchBodies.push({});
    }
    await responseGate.wait;
    try {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: {
            message: "Intentional failure for future-field dedupe test.",
          },
        }),
      });
    } catch {
      // Ignore requests that were cancelled during navigation churn.
    }
  });

  const firstRequest = {
    workspaceRoot: "/tmp/workspace",
    futureLaunchMode: "mode-a",
  };
  await page.evaluate((request) => {
    sessionStorage.setItem(
      "setta.pendingWorkspaceLaunch",
      JSON.stringify({
        request,
        returnUrl: window.location.href,
        requestedAt: Date.now(),
      }),
    );
  }, firstRequest);
  await page.goto(new URL("/launching", page.url()).toString(), {
    waitUntil: "domcontentloaded",
  });
  await expect.poll(() => capturedLaunchBodies.length).toBe(1);

  const secondRequest = {
    workspaceRoot: "/tmp/workspace",
    futureLaunchMode: "mode-b",
  };
  await page.goto(new URL("/", page.url()).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.evaluate((request) => {
    sessionStorage.setItem(
      "setta.pendingWorkspaceLaunch",
      JSON.stringify({
        request,
        returnUrl: window.location.href,
        requestedAt: Date.now(),
      }),
    );
  }, secondRequest);
  await page.goto(new URL("/launching", page.url()).toString(), {
    waitUntil: "domcontentloaded",
  });

  await expect.poll(() => capturedLaunchBodies.length).toBe(2);
  responseGate.release();
  expect(capturedLaunchBodies[0]).toMatchObject(firstRequest);
  expect(capturedLaunchBodies[1]).toMatchObject(secondRequest);
  await expect(
    page.getByText("Intentional failure for future-field dedupe test."),
  ).toBeVisible();
});

test("workspace launch dedupes when nested future fields only differ by key order", async ({
  page,
}) => {
  await ensureAppReady(page);

  const responseGate = createRouteGate();
  const capturedLaunchBodies: Array<Record<string, unknown>> = [];
  await page.route("**/api/launch", async (route, request) => {
    const body = request.postDataJSON();
    if (isObjectRecord(body)) {
      capturedLaunchBodies.push(body);
    } else {
      capturedLaunchBodies.push({});
    }
    await responseGate.wait;
    try {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: {
            message: "Intentional failure for nested future-field dedupe test.",
          },
        }),
      });
    } catch {
      // Ignore requests that were cancelled during navigation churn.
    }
  });

  const firstRequest = {
    workspaceRoot: "/tmp/workspace",
    futureLaunchConfig: {
      routing: {
        mode: "isolated",
        retries: 2,
      },
      labels: ["alpha", { left: "L", right: "R" }],
    },
  };
  await page.evaluate((request) => {
    sessionStorage.setItem(
      "setta.pendingWorkspaceLaunch",
      JSON.stringify({
        request,
        returnUrl: window.location.href,
        requestedAt: Date.now(),
      }),
    );
  }, firstRequest);
  await page.goto(new URL("/launching", page.url()).toString(), {
    waitUntil: "domcontentloaded",
  });
  await expect.poll(() => capturedLaunchBodies.length).toBe(1);

  const secondRequest = {
    workspaceRoot: "/tmp/workspace",
    futureLaunchConfig: {
      labels: ["alpha", { right: "R", left: "L" }],
      routing: {
        retries: 2,
        mode: "isolated",
      },
    },
  };
  await page.goto(new URL("/", page.url()).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.evaluate((request) => {
    sessionStorage.setItem(
      "setta.pendingWorkspaceLaunch",
      JSON.stringify({
        request,
        returnUrl: window.location.href,
        requestedAt: Date.now(),
      }),
    );
  }, secondRequest);
  await page.goto(new URL("/launching", page.url()).toString(), {
    waitUntil: "domcontentloaded",
  });

  await expect.poll(() => capturedLaunchBodies.length).toBe(1);
  responseGate.release();
  await expect(
    page.getByText("Intentional failure for nested future-field dedupe test."),
  ).toBeVisible();
});
