import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createCallableSection,
  ensureAppReady,
  openIsolatedProject,
} from "../helpers";

test.describe.serial("agentic handles", () => {
  test("fades out cleanly when hover ends before fade-in completes", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const sectionId = await createCallableSection(
        page,
        projectContext.projectConfigId,
      );

      const node = page
        .locator(".react-flow__nodes")
        .getByTestId(`rf__node-${sectionId}`);
      await expect(node).toBeVisible();

      await page.getByRole("button", { name: "fit view" }).click();

      const sourceHandle = page.locator(
        `.react-flow__handle[data-nodeid="${sectionId}"][data-handleid="agentic-edge-source"]`,
      );
      const targetHandle = page.locator(
        `.react-flow__handle[data-nodeid="${sectionId}"][data-handleid="agentic-edge-target"]`,
      );

      // Hover briefly (less than the fade-in duration) then leave. Previously the
      // handles could get stuck at a partial opacity until a second hover.
      await node.hover();
      await page.waitForTimeout(30);
      await page.getByRole("button", { name: "fit view" }).hover();

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
      await node.hover();
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

  test("stays visible while moving through the hover bridge towards the handles", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const sectionId = await createCallableSection(
        page,
        projectContext.projectConfigId,
      );

      const node = page
        .locator(".react-flow__nodes")
        .getByTestId(`rf__node-${sectionId}`);
      await expect(node).toBeVisible();

      await page.getByRole("button", { name: "fit view" }).click();

      const sourceHandle = page.locator(
        `.react-flow__handle[data-nodeid="${sectionId}"][data-handleid="agentic-edge-source"]`,
      );
      const targetHandle = page.locator(
        `.react-flow__handle[data-nodeid="${sectionId}"][data-handleid="agentic-edge-target"]`,
      );

      await node.hover();

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

      const [nodeBox, sourceBox, targetBox] = await Promise.all([
        node.boundingBox(),
        sourceHandle.boundingBox(),
        targetHandle.boundingBox(),
      ]);
      if (!nodeBox || !sourceBox || !targetBox) {
        throw new Error("Unable to resolve bounding boxes for agentic handles.");
      }

      const nodeCenterX = nodeBox.x + nodeBox.width / 2;
      const nodeCenterY = nodeBox.y + nodeBox.height / 2;
      const targetCenterY = targetBox.y + targetBox.height / 2;
      const sourceCenterY = sourceBox.y + sourceBox.height / 2;

      // Move into the gap between the node and the handle. The hover bridge
      // (safe zone) should keep the node in :hover so the handles don't fade.
      await page.mouse.move(nodeBox.x - 2, targetCenterY);
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

      await page.mouse.move(nodeBox.x + nodeBox.width + 2, sourceCenterY);
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
