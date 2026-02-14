import { expect, test } from "@playwright/test";
import {
  cleanupGitOverlayFixture,
  getWorkspaceRootOrThrow,
  openGitOverview,
  seedGitOverlayFixture,
} from "./helpers/gitOverlayFixture";

test("git graph panes and columns resize without overlap or geometry drift", async ({
  page,
}) => {
  const workspaceRoot = getWorkspaceRootOrThrow();
  const fixture = await seedGitOverlayFixture(workspaceRoot, {
    historyCommitCount: 40,
  });

  try {
    await openGitOverview(page);

    await page.getByRole("button", { name: "Graph" }).click();
    const graphFilter = page.getByPlaceholder(/Filter commits/);
    await expect(graphFilter).toBeVisible();
    const graphOverlay = graphFilter.locator("xpath=ancestor::section[1]");

    if (!fixture.latestHistoryLabel) {
      throw new Error("Expected latest history label for graph resize test.");
    }
    await expect(
      graphOverlay.getByRole("button", {
        name: new RegExp(fixture.latestHistoryLabel),
      }),
    ).toBeVisible();

    const historyPane = graphOverlay.getByTestId("git-graph-history-pane");
    const diffPane = graphOverlay.getByTestId("git-graph-diff-pane");
    const paneSplitter = graphOverlay.getByTestId("git-graph-pane-splitter");
    const historyBefore = await historyPane.evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    const diffBefore = await diffPane.evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    const paneSplitterBox = await paneSplitter.boundingBox();
    if (!paneSplitterBox) {
      throw new Error(
        "Expected git graph pane splitter to have a bounding box.",
      );
    }
    await page.mouse.move(
      paneSplitterBox.x + paneSplitterBox.width / 2,
      paneSplitterBox.y + paneSplitterBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      paneSplitterBox.x + paneSplitterBox.width / 2 + 120,
      paneSplitterBox.y + paneSplitterBox.height / 2,
      { steps: 8 },
    );
    await page.mouse.up();

    const historyAfter = await historyPane.evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    const diffAfter = await diffPane.evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    expect(historyAfter).toBeGreaterThan(historyBefore + 40);
    expect(diffAfter).toBeLessThan(diffBefore - 40);

    const messageHeader = graphOverlay.getByTestId("git-graph-header-message");
    const authorHeader = graphOverlay.getByTestId("git-graph-header-author");
    const graphMessageResizeHandle = graphOverlay.getByTestId(
      "git-graph-col-resize-graph-message",
    );
    const messageAuthorResizeHandle = graphOverlay.getByTestId(
      "git-graph-col-resize-message-author",
    );
    const authorDateResizeHandle = graphOverlay.getByTestId(
      "git-graph-col-resize-author-date",
    );
    const dateHashResizeHandle = graphOverlay.getByTestId(
      "git-graph-col-resize-date-hash",
    );
    await expect(graphMessageResizeHandle).toBeVisible();
    await expect(messageAuthorResizeHandle).toBeVisible();
    await expect(authorDateResizeHandle).toBeVisible();
    await expect(dateHashResizeHandle).toBeVisible();

    const paneSplitterBoxBeforeNarrowDrag = await paneSplitter.boundingBox();
    if (!paneSplitterBoxBeforeNarrowDrag) {
      throw new Error(
        "Expected git graph pane splitter to have a bounding box before narrow drag.",
      );
    }
    await page.mouse.move(
      paneSplitterBoxBeforeNarrowDrag.x +
        paneSplitterBoxBeforeNarrowDrag.width / 2,
      paneSplitterBoxBeforeNarrowDrag.y +
        paneSplitterBoxBeforeNarrowDrag.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      paneSplitterBoxBeforeNarrowDrag.x +
        paneSplitterBoxBeforeNarrowDrag.width / 2 -
        1200,
      paneSplitterBoxBeforeNarrowDrag.y +
        paneSplitterBoxBeforeNarrowDrag.height / 2,
      { steps: 24 },
    );
    await page.mouse.up();

    const messageHeaderAfterNarrowPane = await messageHeader.boundingBox();
    const authorHeaderAfterNarrowPane = await authorHeader.boundingBox();
    if (!messageHeaderAfterNarrowPane || !authorHeaderAfterNarrowPane) {
      throw new Error(
        "Expected message and author headers to have bounding boxes after narrow pane drag.",
      );
    }
    expect(
      messageHeaderAfterNarrowPane.x + messageHeaderAfterNarrowPane.width,
    ).toBeLessThanOrEqual(authorHeaderAfterNarrowPane.x + 1);

    const paneSplitterBoxAfterNarrowDrag = await paneSplitter.boundingBox();
    if (!paneSplitterBoxAfterNarrowDrag) {
      throw new Error(
        "Expected git graph pane splitter to have a bounding box after narrow drag.",
      );
    }
    await page.mouse.move(
      paneSplitterBoxAfterNarrowDrag.x +
        paneSplitterBoxAfterNarrowDrag.width / 2,
      paneSplitterBoxAfterNarrowDrag.y +
        paneSplitterBoxAfterNarrowDrag.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      paneSplitterBoxAfterNarrowDrag.x +
        paneSplitterBoxAfterNarrowDrag.width / 2 +
        320,
      paneSplitterBoxAfterNarrowDrag.y +
        paneSplitterBoxAfterNarrowDrag.height / 2,
      { steps: 12 },
    );
    await page.mouse.up();

    const historyCommitSvg = graphOverlay
      .getByRole("button", {
        name: new RegExp(fixture.latestHistoryLabel),
      })
      .locator("svg")
      .first();

    const metricsBeforeGraphResize = await historyCommitSvg.evaluate((svg) => {
      const dot = svg.querySelector("circle");
      const laneStroke = svg.querySelector("line");
      if (!dot || !laneStroke) {
        return null;
      }
      const dotRect = dot.getBoundingClientRect();
      const laneStrokeRect = laneStroke.getBoundingClientRect();
      return {
        dotWidth: dotRect.width,
        dotHeight: dotRect.height,
        laneStrokeWidth: laneStrokeRect.width,
      };
    });
    if (!metricsBeforeGraphResize) {
      throw new Error(
        "Expected git graph row to render both a commit dot and lane stroke.",
      );
    }

    const graphMessageHandleBefore =
      await graphMessageResizeHandle.boundingBox();
    if (!graphMessageHandleBefore) {
      throw new Error(
        "Expected git graph graph-message resize handle to have a bounding box.",
      );
    }
    await page.mouse.move(
      graphMessageHandleBefore.x + graphMessageHandleBefore.width / 2,
      graphMessageHandleBefore.y + graphMessageHandleBefore.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      graphMessageHandleBefore.x + graphMessageHandleBefore.width / 2 + 80,
      graphMessageHandleBefore.y + graphMessageHandleBefore.height / 2,
      { steps: 8 },
    );
    const metricsDuringGraphResize = await historyCommitSvg.evaluate((svg) => {
      const dot = svg.querySelector("circle");
      const laneStroke = svg.querySelector("line");
      if (!dot || !laneStroke) {
        return null;
      }
      const dotRect = dot.getBoundingClientRect();
      const laneStrokeRect = laneStroke.getBoundingClientRect();
      return {
        dotWidth: dotRect.width,
        dotHeight: dotRect.height,
        laneStrokeWidth: laneStrokeRect.width,
      };
    });
    if (!metricsDuringGraphResize) {
      throw new Error(
        "Expected git graph row to keep rendering geometry while dragging.",
      );
    }
    expect(
      Math.abs(
        metricsBeforeGraphResize.dotWidth - metricsBeforeGraphResize.dotHeight,
      ),
    ).toBeLessThanOrEqual(1.5);
    expect(
      Math.abs(
        metricsDuringGraphResize.dotWidth - metricsDuringGraphResize.dotHeight,
      ),
    ).toBeLessThanOrEqual(1.5);
    expect(
      Math.abs(
        metricsDuringGraphResize.laneStrokeWidth -
          metricsBeforeGraphResize.laneStrokeWidth,
      ),
    ).toBeLessThanOrEqual(1.25);
    await page.mouse.up();

    const graphMessageHandleAfterGrow =
      await graphMessageResizeHandle.boundingBox();
    if (!graphMessageHandleAfterGrow) {
      throw new Error(
        "Expected git graph graph-message resize handle to remain measurable after drag.",
      );
    }
    await page.mouse.move(
      graphMessageHandleAfterGrow.x + graphMessageHandleAfterGrow.width / 2,
      graphMessageHandleAfterGrow.y + graphMessageHandleAfterGrow.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      graphMessageHandleAfterGrow.x +
        graphMessageHandleAfterGrow.width / 2 -
        160,
      graphMessageHandleAfterGrow.y + graphMessageHandleAfterGrow.height / 2,
      { steps: 8 },
    );
    await page.mouse.up();

    const metricsAfterGraphResize = await historyCommitSvg.evaluate((svg) => {
      const dot = svg.querySelector("circle");
      const laneStroke = svg.querySelector("line");
      if (!dot || !laneStroke) {
        return null;
      }
      const dotRect = dot.getBoundingClientRect();
      const laneStrokeRect = laneStroke.getBoundingClientRect();
      return {
        dotWidth: dotRect.width,
        dotHeight: dotRect.height,
        laneStrokeWidth: laneStrokeRect.width,
      };
    });
    if (!metricsAfterGraphResize) {
      throw new Error(
        "Expected git graph row to render both a commit dot and lane stroke after drag.",
      );
    }
    expect(
      Math.abs(
        metricsAfterGraphResize.dotWidth - metricsAfterGraphResize.dotHeight,
      ),
    ).toBeLessThanOrEqual(1.5);
    expect(
      Math.abs(
        metricsAfterGraphResize.laneStrokeWidth -
          metricsBeforeGraphResize.laneStrokeWidth,
      ),
    ).toBeLessThanOrEqual(1.25);

    const authorBefore = await authorHeader.evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    const messageAuthorHandleBefore =
      await messageAuthorResizeHandle.boundingBox();
    const authorDateHandleBefore = await authorDateResizeHandle.boundingBox();
    const dateHashHandleBefore = await dateHashResizeHandle.boundingBox();
    if (!messageAuthorHandleBefore) {
      throw new Error(
        "Expected git graph message-author resize handle to have a bounding box.",
      );
    }
    if (!authorDateHandleBefore) {
      throw new Error(
        "Expected git graph author-date resize handle to have a bounding box.",
      );
    }
    if (!dateHashHandleBefore) {
      throw new Error(
        "Expected git graph date-hash resize handle to have a bounding box.",
      );
    }

    await page.mouse.move(
      messageAuthorHandleBefore.x + messageAuthorHandleBefore.width / 2,
      messageAuthorHandleBefore.y + messageAuthorHandleBefore.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      messageAuthorHandleBefore.x + messageAuthorHandleBefore.width / 2 + 70,
      messageAuthorHandleBefore.y + messageAuthorHandleBefore.height / 2,
      { steps: 8 },
    );
    await page.mouse.up();

    const messageAuthorHandleAfter =
      await messageAuthorResizeHandle.boundingBox();
    if (!messageAuthorHandleAfter) {
      throw new Error(
        "Expected git graph message-author resize handle to have a bounding box after drag.",
      );
    }
    const authorDateHandleAfterMessageDrag =
      await authorDateResizeHandle.boundingBox();
    const dateHashHandleAfterMessageDrag =
      await dateHashResizeHandle.boundingBox();
    if (!authorDateHandleAfterMessageDrag || !dateHashHandleAfterMessageDrag) {
      throw new Error(
        "Expected git graph non-adjacent resize handles to be measurable after message-author drag.",
      );
    }
    const authorAfter = await authorHeader.evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    expect(messageAuthorHandleAfter.x).toBeGreaterThan(
      messageAuthorHandleBefore.x + 10,
    );
    expect(Math.abs(authorAfter - authorBefore)).toBeGreaterThan(10);
    expect(
      Math.abs(authorDateHandleAfterMessageDrag.x - authorDateHandleBefore.x),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(dateHashHandleAfterMessageDrag.x - dateHashHandleBefore.x),
    ).toBeLessThanOrEqual(2);

    const messageAuthorHandleBeforeAuthorDateDrag =
      await messageAuthorResizeHandle.boundingBox();
    if (!messageAuthorHandleBeforeAuthorDateDrag) {
      throw new Error(
        "Expected git graph message-author resize handle before author-date drag.",
      );
    }
    const authorDateHandleBeforeAuthorDateDrag =
      await authorDateResizeHandle.boundingBox();
    const dateHashHandleBeforeAuthorDateDrag =
      await dateHashResizeHandle.boundingBox();
    if (
      !authorDateHandleBeforeAuthorDateDrag ||
      !dateHashHandleBeforeAuthorDateDrag
    ) {
      throw new Error(
        "Expected git graph author-date/date-hash resize handles before author-date drag.",
      );
    }
    await page.mouse.move(
      authorDateHandleBeforeAuthorDateDrag.x +
        authorDateHandleBeforeAuthorDateDrag.width / 2,
      authorDateHandleBeforeAuthorDateDrag.y +
        authorDateHandleBeforeAuthorDateDrag.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      authorDateHandleBeforeAuthorDateDrag.x +
        authorDateHandleBeforeAuthorDateDrag.width / 2 +
        50,
      authorDateHandleBeforeAuthorDateDrag.y +
        authorDateHandleBeforeAuthorDateDrag.height / 2,
      { steps: 8 },
    );
    await page.mouse.up();

    const authorDateHandleAfter = await authorDateResizeHandle.boundingBox();
    if (!authorDateHandleAfter) {
      throw new Error(
        "Expected git graph author-date resize handle to have a bounding box after drag.",
      );
    }
    const messageAuthorHandleAfterAuthorDateDrag =
      await messageAuthorResizeHandle.boundingBox();
    const dateHashHandleAfterAuthorDateDrag =
      await dateHashResizeHandle.boundingBox();
    if (
      !messageAuthorHandleAfterAuthorDateDrag ||
      !dateHashHandleAfterAuthorDateDrag
    ) {
      throw new Error(
        "Expected git graph adjacent resize handles after author-date drag.",
      );
    }
    expect(authorDateHandleAfter.x).toBeGreaterThan(
      authorDateHandleBeforeAuthorDateDrag.x + 8,
    );
    expect(
      Math.abs(
        messageAuthorHandleAfterAuthorDateDrag.x -
          messageAuthorHandleBeforeAuthorDateDrag.x,
      ),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(
        dateHashHandleAfterAuthorDateDrag.x -
          dateHashHandleBeforeAuthorDateDrag.x,
      ),
    ).toBeLessThanOrEqual(2);

    const messageAuthorHandleBeforeDateHashDrag =
      await messageAuthorResizeHandle.boundingBox();
    const authorDateHandleBeforeDateHashDrag =
      await authorDateResizeHandle.boundingBox();
    const dateHashHandleBeforeDateHashDrag =
      await dateHashResizeHandle.boundingBox();
    if (
      !messageAuthorHandleBeforeDateHashDrag ||
      !authorDateHandleBeforeDateHashDrag ||
      !dateHashHandleBeforeDateHashDrag
    ) {
      throw new Error(
        "Expected git graph resize handles before date-hash drag.",
      );
    }
    await page.mouse.move(
      dateHashHandleBeforeDateHashDrag.x +
        dateHashHandleBeforeDateHashDrag.width / 2,
      dateHashHandleBeforeDateHashDrag.y +
        dateHashHandleBeforeDateHashDrag.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      dateHashHandleBeforeDateHashDrag.x +
        dateHashHandleBeforeDateHashDrag.width / 2 +
        40,
      dateHashHandleBeforeDateHashDrag.y +
        dateHashHandleBeforeDateHashDrag.height / 2,
      { steps: 8 },
    );
    await page.mouse.up();

    const dateHashHandleAfter = await dateHashResizeHandle.boundingBox();
    if (!dateHashHandleAfter) {
      throw new Error(
        "Expected git graph date-hash resize handle to have a bounding box after drag.",
      );
    }
    const messageAuthorHandleAfterDateHashDrag =
      await messageAuthorResizeHandle.boundingBox();
    const authorDateHandleAfterDateHashDrag =
      await authorDateResizeHandle.boundingBox();
    if (
      !messageAuthorHandleAfterDateHashDrag ||
      !authorDateHandleAfterDateHashDrag
    ) {
      throw new Error(
        "Expected git graph resize handles after date-hash drag.",
      );
    }
    expect(dateHashHandleAfter.x).toBeGreaterThan(
      dateHashHandleBeforeDateHashDrag.x + 6,
    );
    expect(
      Math.abs(
        messageAuthorHandleAfterDateHashDrag.x -
          messageAuthorHandleBeforeDateHashDrag.x,
      ),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(
        authorDateHandleAfterDateHashDrag.x -
          authorDateHandleBeforeDateHashDrag.x,
      ),
    ).toBeLessThanOrEqual(2);

    const commitListWrapper = graphOverlay.getByTestId(
      "git-graph-commit-list-wrapper",
    );
    const commitListOverflow = await commitListWrapper.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(
      commitListOverflow.scrollWidth - commitListOverflow.clientWidth,
    ).toBeLessThanOrEqual(1);
    const listOverflowX = await commitListWrapper
      .locator(":scope > div")
      .first()
      .evaluate((el) => window.getComputedStyle(el).overflowX);
    expect(listOverflowX).toBe("hidden");

    await page.keyboard.press("Escape");
    await expect(graphFilter).toHaveCount(0);
  } finally {
    await cleanupGitOverlayFixture(fixture);
  }
});
