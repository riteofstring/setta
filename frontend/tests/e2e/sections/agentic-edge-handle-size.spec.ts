import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createTopLevelSectionFromFrontend,
  ensureAppReady,
  getViewportBoundsForPlacement,
  hoverGpuFlowNode,
  openIsolatedProject,
} from "../helpers";

async function createTopLevelSection(
  page: Page,
  projectConfigId: string,
  implType: string,
): Promise<string> {
  const viewportBounds = await getViewportBoundsForPlacement(page);
  if (!viewportBounds) {
    throw new Error("Unable to resolve viewport bounds for section placement.");
  }
  const response = await createTopLevelSectionFromFrontend(page, {
    projectConfigId,
    implType,
    viewportBounds,
  });
  const sectionId = response?.sectionId ?? null;
  if (!sectionId) {
    throw new Error(
      `Missing sectionId when creating section type ${implType}.`,
    );
  }
  return sectionId;
}

test.describe.serial("agentic handles", () => {
  test("renders agentic target + source handles at the same size", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const sectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "Code",
      );

      const node = page.getByTestId(`rf__node-${sectionId}`);
      await expect(node).toBeVisible();

      // Ensure the node is fully in view so hover reliably reveals the handles.
      await page
        .getByRole("button", { name: "fit view" })
        .click({ force: true });
      await hoverGpuFlowNode(page, node);

      const targetHandle = page.locator(
        `.setta-gpu-flow__handle[data-nodeid="${sectionId}"][data-handleid="agentic-edge-target"]`,
      );
      const sourceHandle = page.locator(
        `.setta-gpu-flow__handle[data-nodeid="${sectionId}"][data-handleid="agentic-edge-source"]`,
      );

      await expect(targetHandle).toBeVisible();
      await expect(sourceHandle).toBeVisible();

      const [targetBox, sourceBox] = await Promise.all([
        targetHandle.boundingBox(),
        sourceHandle.boundingBox(),
      ]);
      if (!targetBox || !sourceBox) {
        throw new Error("Missing agentic handle bounding boxes.");
      }

      // The visual connector circles should match so the input/output handles
      // feel symmetric when wiring sections together.
      expect(Math.abs(targetBox.width - sourceBox.width)).toBeLessThanOrEqual(
        0.5,
      );
      expect(Math.abs(targetBox.height - sourceBox.height)).toBeLessThanOrEqual(
        0.5,
      );
      expect(Math.abs(targetBox.width - targetBox.height)).toBeLessThanOrEqual(
        0.5,
      );
      expect(Math.abs(sourceBox.width - sourceBox.height)).toBeLessThanOrEqual(
        0.5,
      );
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
