import { expect, test } from "@playwright/test";
import { ensureAppReady, postBackend, setOverviewTab } from "../helpers";

test("backend logs pane supports column resize handles and copy feedback", async ({
  page,
}) => {
  await setOverviewTab(page, "BackendLogs");
  await ensureAppReady(page);

  await postBackend(page, "/llm/apiKeys", {
    apiKeys: { SETTA_E2E_LOG_KEY: "one" },
  });
  await postBackend(page, "/llm/apiKeys", {
    apiKeys: { SETTA_E2E_LOG_KEY: "two" },
  });

  const rows = page.getByTestId("backend-log-row");
  await expect(rows.first()).toBeVisible();

  const projectColumnHeader = page.getByTestId("backend-log-col-header-project");
  const projectWidthBefore = await projectColumnHeader.evaluate(
    (element) => element.getBoundingClientRect().width,
  );

  await page.evaluate(() => {
    const handle = document.querySelector('[data-testid="backend-log-resize-project"]');
    if (!(handle instanceof HTMLElement)) {
      throw new Error("Missing backend log project resize handle.");
    }

    const rect = handle.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;

    handle.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        clientX: startX,
        clientY: startY,
        button: 0,
      }),
    );

    window.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        clientX: startX + 60,
        clientY: startY,
        buttons: 1,
      }),
    );

    window.dispatchEvent(
      new MouseEvent("mouseup", {
        bubbles: true,
        clientX: startX + 60,
        clientY: startY,
        button: 0,
      }),
    );
  });

  const projectWidthAfter = await projectColumnHeader.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  expect(projectWidthAfter).toBeGreaterThan(projectWidthBefore + 30);

  const firstRow = rows.first();
  const copyButton = firstRow.getByTestId("backend-log-copy-message");
  const copyButtonClassName = await copyButton.getAttribute("class");
  expect(copyButtonClassName).toContain("opacity-0");
  expect(copyButtonClassName).not.toContain("pointer-events-none");
  expect(copyButtonClassName).toContain(
    "group-hover/backend-log-row:opacity-100",
  );
  await expect(copyButton).toHaveAttribute("data-copy-status", "idle");
  await expect(copyButton).toHaveText("");
  const copyIconBox = await copyButton.evaluate((button) => {
    const icon = button.querySelector("svg");
    if (!(icon instanceof SVGElement)) {
      return null;
    }
    const rect = icon.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(copyIconBox).not.toBeNull();
  expect(copyIconBox?.width ?? 0).toBeGreaterThan(8);
  expect(copyIconBox?.height ?? 0).toBeGreaterThan(8);

  await firstRow.click();
  const selectedRowTitle = (await firstRow.getAttribute("title")) ?? "";
  expect(selectedRowTitle.length).toBeGreaterThan(0);
  const selectedPanel = page.getByTestId("backend-log-selected-message-panel");
  await expect(selectedPanel).toBeVisible();
  await expect(
    selectedPanel.getByTestId("backend-log-selected-message"),
  ).toContainText(selectedRowTitle);

  await copyButton.evaluate((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("Missing backend logs copy button.");
    }
    button.click();
  });
  await expect(copyButton).toHaveAttribute("data-copy-status", /copied|failed/);

  const gridScrollShell = page.getByTestId("backend-log-grid-scroll-shell");
  await expect(gridScrollShell).toBeVisible();
  const overflowState = await page.evaluate(() => {
    const shell = document.querySelector('[data-testid="backend-log-grid-scroll-shell"]');
    const virtualList = document.querySelector('[data-testid="backend-log-virtual-list"]');
    if (!(shell instanceof HTMLElement) || !(virtualList instanceof HTMLElement)) {
      throw new Error("Missing backend logs scroller elements.");
    }
    const shellStyle = getComputedStyle(shell);
    const listStyle = getComputedStyle(virtualList);
    return {
      shellOverflowX: shellStyle.overflowX,
      listOverflowX: listStyle.overflowX,
    };
  });
  expect(overflowState.shellOverflowX).toBe("auto");
  expect(overflowState.listOverflowX).toBe("hidden");
});
