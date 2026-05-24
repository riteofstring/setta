import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createCallableSection,
  disableCanvasSidePanePointerInterception,
  ensureAppReady,
  getGpuFlowNodeScreenRect,
  hoverGpuFlowNode,
  openIsolatedProject,
} from "../helpers";

test.describe.serial("agentic handles", () => {
  test("fades out cleanly when hover ends before fade-in completes", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    await disableCanvasSidePanePointerInterception(page);

    try {
      const sectionId = await createCallableSection(
        page,
        projectContext.projectConfigId,
      );

      const node = page.getByTestId(`rf__node-${sectionId}`);
      await expect(node).toBeVisible();

      await page
        .getByRole("button", { name: "fit view" })
        .click({ force: true });

      const sourceHandle = page.locator(
        `.setta-gpu-flow__handle[data-nodeid="${sectionId}"][data-handleid="agentic-edge-source"]`,
      );
      const targetHandle = page.locator(
        `.setta-gpu-flow__handle[data-nodeid="${sectionId}"][data-handleid="agentic-edge-target"]`,
      );

      // Hover briefly (less than the fade-in duration) then leave. Previously the
      // handles could get stuck at a partial opacity until a second hover.
      await hoverGpuFlowNode(page, node);
      await page.waitForTimeout(30);
      await page
        .getByRole("button", { name: "fit view" })
        .hover({ force: true });

      await expect
        .poll(
          async () => {
            const [sourceOpacity, targetOpacity] = await Promise.all([
              sourceHandle.evaluate((el) =>
                Number.parseFloat(getComputedStyle(el).opacity),
              ),
              targetHandle.evaluate((el) =>
                Number.parseFloat(getComputedStyle(el).opacity),
              ),
            ]);
            return Math.max(sourceOpacity, targetOpacity);
          },
          { timeout: 1500 },
        )
        .toBeLessThanOrEqual(0.01);

      await expect(sourceHandle).toHaveCSS("visibility", "hidden");
      await expect(targetHandle).toHaveCSS("visibility", "hidden");

      // A second hover should still fade the handles back in.
      await hoverGpuFlowNode(page, node);
      await expect
        .poll(
          async () => {
            const [sourceOpacity, targetOpacity] = await Promise.all([
              sourceHandle.evaluate((el) =>
                Number.parseFloat(getComputedStyle(el).opacity),
              ),
              targetHandle.evaluate((el) =>
                Number.parseFloat(getComputedStyle(el).opacity),
              ),
            ]);
            return Math.min(sourceOpacity, targetOpacity);
          },
          { timeout: 1500 },
        )
        .toBeGreaterThanOrEqual(0.95);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("stays visible while moving across the projected node", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    await disableCanvasSidePanePointerInterception(page);

    try {
      const sectionId = await createCallableSection(
        page,
        projectContext.projectConfigId,
      );

      const node = page.getByTestId(`rf__node-${sectionId}`);
      await expect(node).toBeVisible();

      await page
        .getByRole("button", { name: "fit view" })
        .click({ force: true });

      const sourceHandle = page.locator(
        `.setta-gpu-flow__handle[data-nodeid="${sectionId}"][data-handleid="agentic-edge-source"]`,
      );
      const targetHandle = page.locator(
        `.setta-gpu-flow__handle[data-nodeid="${sectionId}"][data-handleid="agentic-edge-target"]`,
      );

      await hoverGpuFlowNode(page, node);

      await expect
        .poll(
          async () => {
            const [sourceOpacity, targetOpacity] = await Promise.all([
              sourceHandle.evaluate((el) =>
                Number.parseFloat(getComputedStyle(el).opacity),
              ),
              targetHandle.evaluate((el) =>
                Number.parseFloat(getComputedStyle(el).opacity),
              ),
            ]);
            return Math.min(sourceOpacity, targetOpacity);
          },
          { timeout: 1500 },
        )
        .toBeGreaterThanOrEqual(0.95);

      const nodeBox = await getGpuFlowNodeScreenRect(node);
      if (!nodeBox) {
        throw new Error(
          "Unable to resolve bounding box for projected agentic node.",
        );
      }

      const nodeCenterX = nodeBox.x + nodeBox.width / 2;
      const nodeCenterY = nodeBox.y + nodeBox.height / 2;
      // Move within the visual node. The projected source hover should keep
      // both handles visible while canvas hit testing owns the pointer path.
      await page.mouse.move(
        nodeBox.x + Math.max(8, nodeBox.width * 0.25),
        nodeBox.y + Math.max(8, nodeBox.height * 0.35),
        { steps: 8 },
      );
      await page.waitForTimeout(80);

      await expect
        .poll(
          async () => {
            const [sourceOpacity, targetOpacity] = await Promise.all([
              sourceHandle.evaluate((el) =>
                Number.parseFloat(getComputedStyle(el).opacity),
              ),
              targetHandle.evaluate((el) =>
                Number.parseFloat(getComputedStyle(el).opacity),
              ),
            ]);
            return Math.min(sourceOpacity, targetOpacity);
          },
          { timeout: 1000 },
        )
        .toBeGreaterThanOrEqual(0.9);

      await page.mouse.move(nodeCenterX, nodeCenterY);
      await page.waitForTimeout(30);

      await page.mouse.move(
        nodeBox.x + Math.max(8, nodeBox.width * 0.75),
        nodeBox.y + Math.max(8, nodeBox.height * 0.65),
        { steps: 8 },
      );
      await page.waitForTimeout(80);

      await expect
        .poll(
          async () => {
            const [sourceOpacity, targetOpacity] = await Promise.all([
              sourceHandle.evaluate((el) =>
                Number.parseFloat(getComputedStyle(el).opacity),
              ),
              targetHandle.evaluate((el) =>
                Number.parseFloat(getComputedStyle(el).opacity),
              ),
            ]);
            return Math.min(sourceOpacity, targetOpacity);
          },
          { timeout: 1000 },
        )
        .toBeGreaterThanOrEqual(0.9);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
