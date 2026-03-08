import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  openIsolatedProject,
} from "../../helpers";

async function seedReadOnlyProjectChatLayout(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { useLocalStorage, useProjectState, useShareSession } = await import(
      "/src/state/definitions.ts"
    );
    const { createProjectChatWindowingState } = await import(
      "/src/utils/generatedTypes.ts"
    );

    useLocalStorage.setState({
      overviewTab: "ProjectAIChat",
      overviewVis: true,
    });
    useProjectState.setState((state) => {
      state.projectChatWindowing = createProjectChatWindowingState();
    });
    useShareSession.setState({
      isDeploymentMode: true,
      shareSessionId: "share-session-test",
      sessionRunCount: 0,
      sharePolicy: {
        allowLLM: true,
        allowLayoutChanges: false,
        allowParamChanges: false,
        allowVariantChanges: false,
        allowRun: false,
        allowMultipleRuns: false,
      },
      shareDeploymentName: "deployment",
      shareDeploymentVersion: "v1",
      deploymentMode: "share",
    });
  });
}

test("read-only deployments do not auto-create project chat windows or expose layout controls", async ({
  page,
}) => {
  const projectContext = await openIsolatedProject(page);

  try {
    await seedReadOnlyProjectChatLayout(page);

    await expect(page.getByTestId("project-chat-window-surface")).toHaveCount(0);
    await expect(page.getByTestId("project-chat-bottom-dock-create")).toHaveCount(
      0,
    );
    await expect(page.getByRole("button", { name: /new chat/i })).toHaveCount(0);
    await expect(
      page.evaluate(async () => {
        const { useProjectState } = await import("/src/state/definitions.ts");
        return useProjectState.getState().projectChatWindowing.order.length;
      }),
    ).resolves.toBe(0);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
