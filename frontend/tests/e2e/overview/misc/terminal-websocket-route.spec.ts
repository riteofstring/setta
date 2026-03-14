import { expect, test } from "@playwright/test";
import { cleanupIsolatedProject, openIsolatedProject } from "../../helpers";

test("IDE terminals connect through the Go websocket route", async ({
  page,
}) => {
  const websocketUrls: string[] = [];
  page.on("websocket", (websocket) => {
    websocketUrls.push(websocket.url());
  });

  const projectContext = await openIsolatedProject(page);

  try {
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
      page.locator(`.react-flow__node[data-id="${terminalId}"]`),
    ).toBeVisible();

    await expect
      .poll(() => {
        return (
          websocketUrls.find((url) => url.includes("/ws/terminals/")) ?? null
        );
      })
      .not.toBeNull();

    expect(
      websocketUrls.some((url) =>
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
  const websocketUrls: string[] = [];
  page.on("websocket", (websocket) => {
    websocketUrls.push(websocket.url());
  });

  const projectContext = await openIsolatedProject(page);

  try {
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
      page.locator(`.react-flow__node[data-id="${terminalId}"]`),
    ).toBeVisible();

    await page.evaluate(async () => {
      const { useShareSession } = await import("/src/state/definitions.ts");
      useShareSession.setState({
        isDeploymentMode: true,
        shareSessionId: "share-session-e2e",
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

    await expect
      .poll(() => {
        return (
          websocketUrls.find((url) =>
            url.includes(
              `/api/ws/terminals/${projectContext.projectConfigId}/${terminalId}?shareSessionId=share-session-e2e`,
            ),
          ) ?? null
        );
      })
      .not.toBeNull();

    expect(
      websocketUrls.some((url) =>
        url.includes(`/api/${projectContext.projectConfigId}/`),
      ),
    ).toBe(false);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
