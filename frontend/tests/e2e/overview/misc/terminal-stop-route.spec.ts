import { expect, test } from "@playwright/test";
import { cleanupIsolatedProject, openIsolatedProject } from "../../helpers";

type InterceptedStopRequest = {
  body: unknown;
  shareSessionId: string | null;
};

test("IDE stop-code uses the canonical interrupt terminal route", async ({
  page,
}) => {
  const interruptedRequests: InterceptedStopRequest[] = [];
  let legacyKillSubprocessRequests = 0;

  await page.route("**/api/interruptTerminalProcesses", async (route) => {
    interruptedRequests.push({
      body: JSON.parse(route.request().postData() ?? "null"),
      shareSessionId:
        route.request().headers()["x-share-session-id"]?.trim() || null,
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ interruptedSessionCount: 0 }),
    });
  });
  await page.route("**/api/killSubprocesses", async (route) => {
    legacyKillSubprocessRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "null",
    });
  });

  const projectContext = await openIsolatedProject(page);

  try {
    await page.evaluate(async () => {
      const { stopCode } = await import("/src/state/actions/runOrImportCode");
      await stopCode();
    });

    await expect.poll(() => interruptedRequests.length).toBe(1);
    expect(legacyKillSubprocessRequests).toBe(0);
    expect(interruptedRequests[0]).toEqual({
      body: { projectId: projectContext.projectConfigId },
      shareSessionId: null,
    });
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("deployment stop-code keeps using interruptTerminalProcesses with the share session header", async ({
  page,
}) => {
  const interruptedRequests: InterceptedStopRequest[] = [];
  let legacyKillSubprocessRequests = 0;

  await page.route("**/api/interruptTerminalProcesses", async (route) => {
    interruptedRequests.push({
      body: JSON.parse(route.request().postData() ?? "null"),
      shareSessionId:
        route.request().headers()["x-share-session-id"]?.trim() || null,
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ interruptedSessionCount: 0 }),
    });
  });
  await page.route("**/api/killSubprocesses", async (route) => {
    legacyKillSubprocessRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "null",
    });
  });

  const projectContext = await openIsolatedProject(page);

  try {
    await page.evaluate(async () => {
      const { useShareSession } = await import("/src/state/definitions.ts");
      useShareSession.setState({
        isDeploymentMode: true,
        shareSessionId: "share-session-stop-e2e",
        sessionRunCount: 0,
        sharePolicy: {
          allowParamChanges: true,
          allowVariantChanges: true,
          allowLayoutChanges: true,
          allowRun: true,
          allowLLM: false,
          allowMultipleRuns: true,
        },
        shareDeploymentName: "deployment",
        shareDeploymentVersion: "v1",
        deploymentMode: "share",
      });
    });

    await page.evaluate(async () => {
      const { stopCode } = await import("/src/state/actions/runOrImportCode");
      await stopCode();
    });

    await expect.poll(() => interruptedRequests.length).toBe(1);
    expect(legacyKillSubprocessRequests).toBe(0);
    expect(interruptedRequests[0]).toEqual({
      body: { projectId: projectContext.projectConfigId },
      shareSessionId: "share-session-stop-e2e",
    });
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
