import { expect, test, type Page } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  getWorkspaceRootOrThrow,
  initializeDisposableGitRepo,
  openGitOverview,
  runGit,
  toRepoRelativePath,
} from "./helpers/gitOverlayFixture";

async function openGitGraph(page: Page) {
  await openGitOverview(page);

  let graphFilter = page
    .getByTestId("git-graph-overlay")
    .getByPlaceholder(/Filter commits/)
    .first();
  if ((await graphFilter.count()) === 0) {
    await page
      .getByTestId("overview-tab-content-shell")
      .getByRole("button", { name: "Graph" })
      .click();
    graphFilter = page
      .getByTestId("git-graph-overlay")
      .getByPlaceholder(/Filter commits/)
      .first();
  }
  await expect(graphFilter).toBeVisible();
  return {
    graphFilter,
    graphOverlay: graphFilter.locator("xpath=ancestor::section[1]"),
  };
}

test("git graph keeps lanes aligned across join boundaries", async ({
  page,
}) => {
  const workspaceRoot = getWorkspaceRootOrThrow();
  const repo = await initializeDisposableGitRepo(workspaceRoot);
  const mainPath = path.join(repo.fixtureRoot, "graph-test-main.txt");
  const sidePath = path.join(repo.fixtureRoot, "graph-test-side.txt");
  const mainRepoPath = toRepoRelativePath(workspaceRoot, mainPath);
  const sideRepoPath = toRepoRelativePath(workspaceRoot, sidePath);
  const commitEnv = (isoTime: string): Record<string, string> => ({
    GIT_AUTHOR_DATE: isoTime,
    GIT_COMMITTER_DATE: isoTime,
  });

  try {
    // Root commit: graph-test A
    await fs.writeFile(mainPath, "A\n", "utf8");
    runGit(workspaceRoot, ["add", mainRepoPath]);
    runGit(
      workspaceRoot,
      ["commit", "-m", "graph-test A"],
      commitEnv("2000-01-01T00:00:00Z"),
    );
    const defaultBranch = runGit(workspaceRoot, [
      "rev-parse",
      "--abbrev-ref",
      "HEAD",
    ]).trim();

    // Side branch from A (will be merged later).
    runGit(workspaceRoot, ["checkout", "-b", "graph-test-side"]);
    await fs.writeFile(sidePath, "D\n", "utf8");
    runGit(workspaceRoot, ["add", sideRepoPath]);
    runGit(
      workspaceRoot,
      ["commit", "-m", "graph-test D"],
      commitEnv("2000-01-01T00:02:00Z"),
    );

    // Mainline commit: A -> B
    runGit(workspaceRoot, ["checkout", defaultBranch]);
    await fs.writeFile(mainPath, "B\n", "utf8");
    runGit(workspaceRoot, ["add", mainRepoPath]);
    runGit(
      workspaceRoot,
      ["commit", "-m", "graph-test B"],
      commitEnv("2000-01-01T00:01:00Z"),
    );

    // Branch1 from B (newest head, to force traversal order: C1 first).
    runGit(workspaceRoot, ["checkout", "-b", "graph-test-branch1"]);
    await fs.writeFile(mainPath, "C1\n", "utf8");
    runGit(workspaceRoot, ["add", mainRepoPath]);
    runGit(
      workspaceRoot,
      ["commit", "-m", "graph-test C1"],
      commitEnv("2000-01-01T00:05:00Z"),
    );

    runGit(workspaceRoot, ["checkout", defaultBranch]);
    // Branch2 from B: C2 then merge side branch: M
    runGit(workspaceRoot, ["checkout", "-b", "graph-test-branch2"]);
    await fs.writeFile(mainPath, "C2\n", "utf8");
    runGit(workspaceRoot, ["add", mainRepoPath]);
    runGit(
      workspaceRoot,
      ["commit", "-m", "graph-test C2"],
      commitEnv("2000-01-01T00:03:00Z"),
    );
    runGit(workspaceRoot, [
      "merge",
      "--no-ff",
      "graph-test-side",
      "-m",
      "graph-test M",
    ]);
    runGit(
      workspaceRoot,
      ["commit", "--amend", "--no-edit"],
      commitEnv("2000-01-01T00:04:00Z"),
    );

    const { graphFilter, graphOverlay } = await openGitGraph(page);
    const showAllRefsButton = graphOverlay.getByRole("button", {
      name: "Show all refs",
    });
    await expect(showAllRefsButton).toBeVisible();
    await showAllRefsButton.click();
    await expect(
      graphOverlay.getByRole("button", { name: "Show current branch only" }),
    ).toBeVisible();

    await expect(
      graphOverlay.getByRole("button", { name: /graph-test D/ }),
    ).toBeVisible();
    await expect(
      graphOverlay.getByRole("button", { name: /graph-test B/ }),
    ).toBeVisible();
    await expect(
      graphOverlay.getByRole("button", { name: /graph-test A/ }),
    ).toBeVisible();

    const bRow = graphOverlay.getByRole("button", { name: /graph-test B/ });
    const dRow = graphOverlay.getByRole("button", { name: /graph-test D/ });
    const aRow = graphOverlay.getByRole("button", { name: /graph-test A/ });

    // Lane-shift regression guard:
    // Compare the x coordinate of the rightmost vertical lane segment at B
    // with the x coordinate of the join curve at A. If lanes shift left when
    // a middle lane is removed, these won't match and the graph will look
    // "disconnected" at the row boundary.
    const dLaneColor = await dRow.locator("svg circle").evaluate((circle) => {
      return circle.getAttribute("fill");
    });
    expect(dLaneColor).not.toBeNull();

    const bLaneX = await bRow.locator("svg").evaluate((svg, laneColor) => {
      const lines = Array.from(svg.querySelectorAll("line"));
      for (const line of lines) {
        if (line.getAttribute("stroke") !== laneColor) {
          continue;
        }
        const raw = line.getAttribute("x1");
        if (!raw) {
          continue;
        }
        const value = Number(raw);
        return Number.isFinite(value) ? value : null;
      }
      return null;
    }, dLaneColor);
    expect(bLaneX).not.toBeNull();

    const aJoinStartX = await aRow.locator("svg").evaluate((svg, laneColor) => {
      const paths = Array.from(svg.querySelectorAll("path"));
      for (const path of paths) {
        if (path.getAttribute("stroke") !== laneColor) {
          continue;
        }
        const d = path.getAttribute("d") ?? "";
        const match = d.match(/M\s*([-\d.]+)[ ,]+([-\d.]+)\s*C/);
        if (!match) {
          continue;
        }
        const x = Number(match[1]);
        const y = Number(match[2]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          continue;
        }
        if (Math.abs(y) > 1e-6) {
          continue;
        }
        return x;
      }
      return null;
    }, dLaneColor);
    expect(aJoinStartX).not.toBeNull();
    expect(aJoinStartX).toBe(bLaneX);

    await page.locator("body").click();
  } finally {
    await fs.rm(repo.fixtureRoot, { recursive: true, force: true });
    await fs.rm(repo.gitDir, { recursive: true, force: true });
  }
});

test("git graph assigns distinct colors to more than 8 lanes", async ({
  page,
}) => {
  const workspaceRoot = getWorkspaceRootOrThrow();
  const repo = await initializeDisposableGitRepo(workspaceRoot);
  const basePath = path.join(repo.fixtureRoot, "graph-color-base.txt");
  const topicPaths = Array.from({ length: 9 }, (_, idx) =>
    path.join(repo.fixtureRoot, `graph-color-topic-${idx + 1}.txt`),
  );
  const baseRepoPath = toRepoRelativePath(workspaceRoot, basePath);
  const commitEnv = (isoTime: string): Record<string, string> => ({
    GIT_AUTHOR_DATE: isoTime,
    GIT_COMMITTER_DATE: isoTime,
  });

  try {
    await fs.writeFile(basePath, "base\n", "utf8");
    runGit(workspaceRoot, ["add", baseRepoPath]);
    runGit(
      workspaceRoot,
      ["commit", "-m", "graph-color base"],
      commitEnv("2000-01-01T00:00:00Z"),
    );

    const defaultBranch = runGit(workspaceRoot, [
      "rev-parse",
      "--abbrev-ref",
      "HEAD",
    ]).trim();

    const topicBranches: string[] = [];
    for (let idx = 0; idx < topicPaths.length; idx += 1) {
      const branch = `graph-color-topic-${idx + 1}`;
      topicBranches.push(branch);

      runGit(workspaceRoot, ["checkout", "-b", branch]);
      await fs.writeFile(topicPaths[idx]!, `topic ${idx + 1}\n`, "utf8");
      runGit(workspaceRoot, [
        "add",
        toRepoRelativePath(workspaceRoot, topicPaths[idx]!),
      ]);
      runGit(
        workspaceRoot,
        ["commit", "-m", `graph-color T${idx + 1}`],
        commitEnv(`2000-01-01T00:0${idx + 1}:00Z`),
      );
      runGit(workspaceRoot, ["checkout", defaultBranch]);
    }

    runGit(
      workspaceRoot,
      ["merge", "-m", "graph-color M", ...topicBranches],
      commitEnv("2000-01-01T00:10:00Z"),
    );
    runGit(
      workspaceRoot,
      ["commit", "--amend", "--no-edit"],
      commitEnv("2000-01-01T00:10:00Z"),
    );

    const { graphFilter, graphOverlay } = await openGitGraph(page);

    await graphFilter.fill("graph-color M");
    const mergeRow = graphOverlay.getByRole("button", {
      name: /graph-color M/i,
    });
    await expect(mergeRow).toBeVisible();

    const { laneCount, uniqueColors } = await mergeRow.evaluate((row) => {
      const laneCountMatch = (row.textContent ?? "").match(/lanes\s*(\d+)/);
      const parsedLaneCount = laneCountMatch ? Number(laneCountMatch[1]) : null;
      const svg = row.querySelector("svg");
      if (!svg) {
        return { laneCount: parsedLaneCount, uniqueColors: null };
      }

      const colors = new Set<string>();
      for (const el of svg.querySelectorAll("line,path")) {
        const stroke = el.getAttribute("stroke");
        if (stroke) {
          colors.add(stroke);
        }
      }
      const fill = svg.querySelector("circle")?.getAttribute("fill");
      if (fill) {
        colors.add(fill);
      }

      return { laneCount: parsedLaneCount, uniqueColors: colors.size };
    });

    expect(laneCount).not.toBeNull();
    expect(laneCount).toBeGreaterThan(8);
    expect(uniqueColors).toBe(laneCount);
    const graphMessageResizeHandle = graphOverlay.getByTestId(
      "git-graph-col-resize-graph-message",
    );
    await expect(graphMessageResizeHandle).toBeVisible();

    const mergeSvg = mergeRow.locator("svg");
    const dotBeforeResize = await mergeSvg.evaluate((svg) => {
      const dot = svg.querySelector("circle");
      if (!dot) {
        return null;
      }
      const rect = dot.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    if (!dotBeforeResize) {
      throw new Error(
        "Expected graph-color merge row to render a commit dot before resize.",
      );
    }

    const graphMessageHandleBefore =
      await graphMessageResizeHandle.boundingBox();
    if (!graphMessageHandleBefore) {
      throw new Error(
        "Expected graph-message resize handle to have a bounding box before narrow drag.",
      );
    }
    await page.mouse.move(
      graphMessageHandleBefore.x + graphMessageHandleBefore.width / 2,
      graphMessageHandleBefore.y + graphMessageHandleBefore.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      graphMessageHandleBefore.x + graphMessageHandleBefore.width / 2 - 180,
      graphMessageHandleBefore.y + graphMessageHandleBefore.height / 2,
      { steps: 10 },
    );
    const dotDuringNarrowResize = await mergeSvg.evaluate((svg) => {
      const dot = svg.querySelector("circle");
      if (!dot) {
        return null;
      }
      const rect = dot.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    await page.mouse.up();
    if (!dotDuringNarrowResize) {
      throw new Error(
        "Expected graph-color merge row to render a commit dot during narrow resize drag.",
      );
    }
    const dotAfterNarrowResize = await mergeSvg.evaluate((svg) => {
      const dot = svg.querySelector("circle");
      if (!dot) {
        return null;
      }
      const rect = dot.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    if (!dotAfterNarrowResize) {
      throw new Error(
        "Expected graph-color merge row to render a commit dot after narrow resize drag.",
      );
    }
    expect(
      Math.abs(dotBeforeResize.width - dotBeforeResize.height),
    ).toBeLessThanOrEqual(1.5);
    expect(
      Math.abs(dotDuringNarrowResize.width - dotDuringNarrowResize.height),
    ).toBeLessThanOrEqual(1.5);
    expect(
      Math.abs(dotAfterNarrowResize.width - dotAfterNarrowResize.height),
    ).toBeLessThanOrEqual(1.5);

    await page.locator("body").click();
  } finally {
    await fs.rm(repo.fixtureRoot, { recursive: true, force: true });
    await fs.rm(repo.gitDir, { recursive: true, force: true });
  }
});

test("git graph keeps merge-to lanes continuous when the branch continues above the merge", async ({
  page,
}) => {
  const workspaceRoot = getWorkspaceRootOrThrow();
  const repo = await initializeDisposableGitRepo(workspaceRoot);
  const mainPath = path.join(repo.fixtureRoot, "graph-gap-main.txt");
  const sidePath1 = path.join(repo.fixtureRoot, "graph-gap-side-1.txt");
  const sidePath2 = path.join(repo.fixtureRoot, "graph-gap-side-2.txt");
  const mainRepoPath = toRepoRelativePath(workspaceRoot, mainPath);
  const sideRepoPath1 = toRepoRelativePath(workspaceRoot, sidePath1);
  const sideRepoPath2 = toRepoRelativePath(workspaceRoot, sidePath2);
  const commitEnv = (isoTime: string): Record<string, string> => ({
    GIT_AUTHOR_DATE: isoTime,
    GIT_COMMITTER_DATE: isoTime,
  });

  try {
    await fs.writeFile(mainPath, "A\n", "utf8");
    runGit(workspaceRoot, ["add", mainRepoPath]);
    runGit(
      workspaceRoot,
      ["commit", "-m", "graph-gap A"],
      commitEnv("2000-01-01T00:00:00Z"),
    );

    const defaultBranch = runGit(workspaceRoot, [
      "rev-parse",
      "--abbrev-ref",
      "HEAD",
    ]).trim();

    runGit(workspaceRoot, ["checkout", "-b", "graph-gap-side"]);
    await fs.writeFile(sidePath1, "S1\n", "utf8");
    runGit(workspaceRoot, ["add", sideRepoPath1]);
    runGit(
      workspaceRoot,
      ["commit", "-m", "graph-gap S1"],
      commitEnv("2000-01-01T00:01:00Z"),
    );

    // Merge the side branch into main.
    runGit(workspaceRoot, ["checkout", defaultBranch]);
    runGit(workspaceRoot, [
      "merge",
      "--no-ff",
      "graph-gap-side",
      "-m",
      "graph-gap M",
    ]);
    runGit(
      workspaceRoot,
      ["commit", "--amend", "--no-edit"],
      commitEnv("2000-01-01T00:02:00Z"),
    );

    // Continue the side branch after the merge so the side lane exists above the
    // merge commit when showing `--all` refs.
    runGit(workspaceRoot, ["checkout", "graph-gap-side"]);
    await fs.writeFile(sidePath2, "S2\n", "utf8");
    runGit(workspaceRoot, ["add", sideRepoPath2]);
    runGit(
      workspaceRoot,
      ["commit", "-m", "graph-gap S2"],
      commitEnv("2000-01-01T00:03:00Z"),
    );

    const { graphFilter, graphOverlay } = await openGitGraph(page);
    const showAllRefsButton = graphOverlay.getByRole("button", {
      name: "Show all refs",
    });
    await expect(showAllRefsButton).toBeVisible();
    await showAllRefsButton.click();
    await expect(
      graphOverlay.getByRole("button", { name: "Show current branch only" }),
    ).toBeVisible();

    await expect(
      graphOverlay.getByRole("button", { name: /graph-gap S2/i }),
    ).toBeVisible();

    await graphFilter.fill("graph-gap M");
    const mergeRow = graphOverlay.getByRole("button", {
      name: /graph-gap M/i,
    });
    await expect(mergeRow).toBeVisible();

    const svgGeometry = await mergeRow.locator("svg").evaluate((svg) => {
      const parseNum = (raw: string | null): number | null => {
        if (!raw) {
          return null;
        }
        const num = Number(raw);
        return Number.isFinite(num) ? num : null;
      };

      const height = parseNum(svg.getAttribute("height"));
      if (height === null) {
        return { error: "missing svg height" };
      }
      const centerY = height / 2;

      let mergeStroke: string | null = null;
      for (const path of Array.from(svg.querySelectorAll("path"))) {
        const stroke = path.getAttribute("stroke");
        if (!stroke) {
          continue;
        }
        const d = path.getAttribute("d") ?? "";
        const startMatch = d.match(/^M\s*([-\d.]+)[ ,]+([-\d.]+)\s*C/);
        const endMatch = d.match(/([-\d.]+)[ ,]+([-\d.]+)\s*$/);
        if (!startMatch || !endMatch) {
          continue;
        }
        const yStart = Number(startMatch[2]);
        const yEnd = Number(endMatch[2]);
        if (!Number.isFinite(yStart) || !Number.isFinite(yEnd)) {
          continue;
        }
        if (
          Math.abs(yStart - centerY) < 1e-6 &&
          Math.abs(yEnd - height) < 1e-6
        ) {
          mergeStroke = stroke;
          break;
        }
      }

      if (!mergeStroke) {
        return { error: "missing merge path", height };
      }

      const matchingLines = Array.from(svg.querySelectorAll("line")).filter(
        (line) => line.getAttribute("stroke") === mergeStroke,
      );
      let best: { minY: number; maxY: number } | null = null;
      for (const line of matchingLines) {
        const y1 = parseNum(line.getAttribute("y1"));
        const y2 = parseNum(line.getAttribute("y2"));
        if (y1 === null || y2 === null) {
          continue;
        }
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        if (!best || maxY > best.maxY) {
          best = { minY, maxY };
        }
      }

      if (!best) {
        return { error: "missing lane line", height, mergeStroke };
      }

      return {
        height,
        centerY,
        mergeStroke,
        minY: best.minY,
        maxY: best.maxY,
      };
    });

    expect(svgGeometry).not.toHaveProperty("error");
    expect(svgGeometry.minY).toBeCloseTo(0, 5);
    expect(svgGeometry.maxY).toBeCloseTo(svgGeometry.height, 5);
  } finally {
    await fs.rm(repo.fixtureRoot, { recursive: true, force: true });
    await fs.rm(repo.gitDir, { recursive: true, force: true });
  }
});
