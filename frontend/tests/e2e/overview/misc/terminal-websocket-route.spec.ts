import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  openIsolatedProject,
  postBackend,
} from "../../helpers";

test("IDE terminals connect through the Go websocket route", async ({
  page,
}) => {
  const projectContext = await openIsolatedProject(page);

  try {
    await installWebSocketCapture(page);
    // Create a real terminal section so the mounted terminal view opens its
    // websocket through the active caller path.
    const terminalId = await page.evaluate(async () => {
      const { createTopLevelSection } = await import(
        "/src/state/actions/sections/createSections"
      );
      const { SectionTypeEnum } = await import("/src/utils/generatedTypes");
      return await createTopLevelSection({
        implType: SectionTypeEnum.Terminal,
        implOverrides: null,
        position: null,
      });
    });

    expect(terminalId).toBeTruthy();
    await expect(
      page.locator(`.setta-gpu-flow__node[data-id="${terminalId}"]`),
    ).toBeVisible();

    await expect
      .poll(async () => {
        const websocketUrls = await getCapturedWebSocketUrls(page);
        return (
          websocketUrls.find((url) => url.includes("/ws/terminals/")) ?? null
        );
      })
      .not.toBeNull();

    expect(
      (await getCapturedWebSocketUrls(page)).some((url) =>
        url.includes(`/api/${projectContext.projectConfigId}/`),
      ),
    ).toBe(false);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("deployment terminals still use the Go websocket route shape", async ({
  page,
}) => {
  const sharePolicy = {
    allowParamChanges: true,
    allowVariantChanges: true,
    allowLayoutChanges: true,
    allowRun: true,
    allowLLM: false,
    allowMultipleRuns: true,
  };

  const projectContext = await openIsolatedProject(page);

  try {
    await installWebSocketCapture(page);
    const projectConfigName = await page.evaluate(async () => {
      const { useProjectState } = await import("/src/state/definitions.ts");
      return useProjectState.getState().projectConfig.name;
    });
    const createdTerminal = await postBackend<{ sectionId?: string }>(
      page,
      "/createTopLevelSection",
      {
        projectConfigId: projectContext.projectConfigId,
        implType: "Terminal",
      },
    );
    const terminalId = createdTerminal?.sectionId ?? null;

    expect(terminalId).toBeTruthy();

    const latestProjectState = await page.evaluate(async (projectConfigId) => {
      const { getLatestProjectState } = await import("/src/openapi/http");
      const { callOpenAPI } = await import(
        "/tests/e2e/browserAppSubsystemSdk.ts"
      );
      const response = await callOpenAPI(
        getLatestProjectState({
          body: {
            projectConfigId,
          },
        } as Parameters<typeof getLatestProjectState>[0]),
      );
      if (response.status !== 200 || !response.data) {
        throw new Error(
          `Failed to load latest project state for ${projectConfigId}: ${response.status}`,
        );
      }
      return response.data;
    }, projectContext.projectConfigId);

    await page.route("**/share/deployments/current/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          deploymentName: "deployment",
          deploymentVersion: "v1",
          shareSessionId: "share-session-e2e",
          sessionRunCount: 0,
          defaultProjectConfigId: projectContext.projectConfigId,
          projectMetadata: [
            {
              id: projectContext.projectConfigId,
              name: projectConfigName,
            },
          ],
          sharePolicy,
          manifest: null,
        }),
      });
    });
    await page.route(
      "**/share/deployments/deployment/v1/project_config",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            projectState: latestProjectState.projectState,
          }),
        });
      },
    );
    await page.route("**/api/getListenerCoverage", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          projectConfigId: projectContext.projectConfigId,
          dependencies: [],
          hasRealtimeWildcard: false,
        }),
      });
    });

    await page.evaluate(async () => {
      const { useServerMode } = await import("/src/state/definitions.ts");
      useServerMode.setState({
        mode: "share",
        modeResolved: true,
        modeError: null,
      });
    });

    await expect
      .poll(async () => {
        return await page.evaluate(async () => {
          const { useShareSession } = await import("/src/state/definitions.ts");
          return useShareSession.getState().shareSessionId;
        });
      })
      .toBe("share-session-e2e");

    await expect(
      page.locator(`.setta-gpu-flow__node[data-id="${terminalId}"]`),
    ).toBeVisible();

    await expect
      .poll(
        async () => {
          const websocketUrls = await getCapturedWebSocketUrls(page);
          const terminalUrls = websocketUrls.filter((url) =>
            url.includes(
              `/ws/terminals/${projectContext.projectConfigId}/${terminalId}`,
            ),
          );
          return terminalUrls.length > 0 ? terminalUrls.join("\n") : null;
        },
        { timeout: 20000 },
      )
      .toContain("shareSessionId=share-session-e2e");

    expect(
      (await getCapturedWebSocketUrls(page)).some((url) =>
        url.includes(`/api/${projectContext.projectConfigId}/`),
      ),
    ).toBe(false);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

async function installWebSocketCapture(page: Page) {
  await page.evaluate(() => {
    const captureWindow = window as Window & {
      __capturedWebSocketUrls?: string[];
      __originalWebSocket?: typeof WebSocket;
    };
    if (captureWindow.__capturedWebSocketUrls) {
      captureWindow.__capturedWebSocketUrls.length = 0;
      return;
    }
    captureWindow.__capturedWebSocketUrls = [];
    captureWindow.__originalWebSocket = window.WebSocket;
    const OriginalWebSocket = window.WebSocket;
    class CapturingWebSocket extends OriginalWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        captureWindow.__capturedWebSocketUrls?.push(String(url));
        super(url, protocols);
      }
    }
    CapturingWebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
    CapturingWebSocket.OPEN = OriginalWebSocket.OPEN;
    CapturingWebSocket.CLOSING = OriginalWebSocket.CLOSING;
    CapturingWebSocket.CLOSED = OriginalWebSocket.CLOSED;
    window.WebSocket = CapturingWebSocket;
  });
}

async function getCapturedWebSocketUrls(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const captureWindow = window as Window & {
      __capturedWebSocketUrls?: string[];
    };
    return [...(captureWindow.__capturedWebSocketUrls ?? [])];
  });
}
