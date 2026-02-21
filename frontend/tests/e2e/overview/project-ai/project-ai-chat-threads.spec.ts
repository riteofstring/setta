import { expect, test } from "@playwright/test";
import { ensureAppReady, seedLocalStorage } from "../../helpers";

test("project ai threads render folder groups and support group drag reorder", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1480, height: 920 });
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
    overviewWidth: 980,
    overviewTrueWidth: 980,
  });

  await ensureAppReady(page);

  const overviewPane = page.locator("#OverviewPane");
  await expect(
    overviewPane.getByRole("heading", { name: "Project AI Chat" }),
  ).toBeVisible();

  await overviewPane.getByRole("button", { name: "View Threads" }).click();
  const threadsPanel = overviewPane.getByTestId("project-chat-threads-panel");
  await expect(threadsPanel).toHaveAttribute("data-inline", "true");
  await expect(overviewPane.getByPlaceholder("Type a message...")).toBeVisible();
  await expect(threadsPanel.getByTestId("project-chat-thread-group-select")).toHaveCount(0);
  const attachmentButton = overviewPane.getByRole("button", {
    name: "Attachment options",
  });
  await expect(attachmentButton).toBeVisible();
  await expect
    .poll(async () => {
      const panelBox = await threadsPanel.boundingBox();
      const attachmentBox = await attachmentButton.boundingBox();
      if (!panelBox || !attachmentBox) {
        return null;
      }
      return attachmentBox.x - (panelBox.x + panelBox.width);
    })
    .toBeGreaterThanOrEqual(0);
  const resizeHandle = overviewPane.getByTestId(
    "project-chat-inline-threads-resize-handle",
  );
  await expect(resizeHandle).toBeVisible();

  const beforeThreadsWidth = await threadsPanel.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  const input = overviewPane.getByPlaceholder("Type a message...");
  const beforeInputLeft = await input.evaluate(
    (element) => element.getBoundingClientRect().left,
  );
  const resizeHandleBox = await resizeHandle.boundingBox();
  if (!resizeHandleBox) {
    throw new Error("Threads resize handle box was not available.");
  }
  const handleCenterX = resizeHandleBox.x + resizeHandleBox.width / 2;
  const handleCenterY = resizeHandleBox.y + resizeHandleBox.height / 2;
  await page.mouse.move(handleCenterX, handleCenterY);
  await page.mouse.down();
  await page.mouse.move(handleCenterX + 80, handleCenterY);
  await page.mouse.up();

  await expect
    .poll(async () => {
      return await threadsPanel.evaluate(
        (element) => element.getBoundingClientRect().width,
      );
    })
    .toBeGreaterThan(beforeThreadsWidth + 40);
  await expect
    .poll(async () => {
      return await input.evaluate(
        (element) => element.getBoundingClientRect().left,
      );
    })
    .toBeGreaterThan(beforeInputLeft + 20);

  page.once("dialog", (dialog) => dialog.accept("Backend"));
  await threadsPanel.getByRole("button", { name: "New Group" }).click();
  await expect(
    threadsPanel
      .getByTestId("project-chat-thread-group-row")
      .filter({ hasText: "Backend" }),
  ).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept("Frontend"));
  await threadsPanel.getByRole("button", { name: "New Group" }).click();
  await expect(
    threadsPanel
      .getByTestId("project-chat-thread-group-row")
      .filter({ hasText: "Frontend" }),
  ).toBeVisible();

  const backendHandle = threadsPanel
    .getByTestId("project-chat-thread-group-row")
    .filter({ hasText: "Backend" })
    .getByTestId("project-chat-thread-group-drag-handle");
  const frontendHandle = threadsPanel
    .getByTestId("project-chat-thread-group-row")
    .filter({ hasText: "Frontend" })
    .getByTestId("project-chat-thread-group-drag-handle");

  await frontendHandle.dragTo(backendHandle);

  await expect
    .poll(async () => {
      return await threadsPanel
        .getByTestId("project-chat-thread-group-row")
        .evaluateAll((elements) => {
          return elements
            .map((element) => {
              const titleEl = element.querySelector("span.truncate");
              return titleEl?.textContent?.trim() ?? "";
            })
            .filter((value) => value.length > 0);
        });
    })
    .toEqual(["Frontend", "Backend"]);
});
