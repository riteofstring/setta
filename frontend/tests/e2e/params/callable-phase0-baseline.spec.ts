import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createCallableSection,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
} from "../helpers";

const CALLABLE_NAME = "open";
const FIXED_VIEWPORT_TRANSFORM = {
  x: 518.651,
  y: 547.532,
  zoom: 1.20289,
};

type ParamIdsByName = Record<string, string>;

type RectSnapshot = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

type CallablePhase0Metrics = {
  section: RectSnapshot;
  searchRow: RectSnapshot;
  pinnedSection: RectSnapshot;
  firstPinnedRow: RectSnapshot;
  modeRow: RectSnapshot;
  encodingRow: RectSnapshot;
  errorsRow: RectSnapshot;
  unpinnedListContainer: RectSnapshot;
  resizeHandle: RectSnapshot;
  agenticSourceHandle: RectSnapshot;
  agenticTargetHandle: RectSnapshot;
  texts: {
    pinnedSection: string;
    firstPinnedRow: string;
    modeRow: string;
    encodingRow: string;
    errorsRow: string;
  };
  bufferingVisible: boolean;
};

async function setViewportTransform(
  page: Page,
  transform: { x: number; y: number; zoom: number },
): Promise<void> {
  await page.evaluate(async ({ x, y, zoom }) => {
    const { useReactFlow } = await import(
      "/src/forks/xyflow/core/store/index.ts"
    );
    useReactFlow.setState({
      transform: [x, y, zoom],
      fitViewOnInit: false,
      fitViewOnInitDone: true,
    });
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  }, transform);
}

async function setCallableAndGetParamIds(
  page: Page,
  projectConfigId: string,
  sectionId: string,
  callableName: string,
): Promise<ParamIdsByName> {
  await postBackend(page, "/setCallable", {
    projectConfigId,
    sectionId,
    callableName,
    refetchParams: true,
  });

  const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
  const idPrefix = `ParamContainer-${sectionId}-`;
  await expect(sectionNode.locator(`[id^="${idPrefix}"]`).first()).toBeVisible({
    timeout: 20000,
  });

  const idsByName = await sectionNode
    .locator(`[id^="${idPrefix}"]`)
    .evaluateAll((nodes, prefix) => {
      const result: Record<string, string> = {};
      for (const node of nodes) {
        if (!(node instanceof HTMLElement) || !node.id.startsWith(prefix)) {
          continue;
        }
        const label = node.querySelector(".section-key")?.textContent?.trim();
        if (!label) {
          continue;
        }
        result[label] = node.id.slice(prefix.length);
      }
      return result;
    }, idPrefix);

  for (const key of [
    "file",
    "buffering",
    "mode",
    "encoding",
    "errors",
    "newline",
    "closefd",
    "opener",
  ]) {
    if (!idsByName[key]) {
      throw new Error(`Missing callable param id for ${key}.`);
    }
  }

  return idsByName;
}

async function getCallablePhase0Metrics(
  page: Page,
  sectionId: string,
  idsByName: ParamIdsByName,
): Promise<CallablePhase0Metrics> {
  return await page.evaluate(
    ({ currentSectionId, currentIdsByName }) => {
      const roundRect = ({
        top,
        right,
        bottom,
        left,
        width,
        height,
      }: DOMRect): RectSnapshot => ({
        top: Number(top.toFixed(2)),
        right: Number(right.toFixed(2)),
        bottom: Number(bottom.toFixed(2)),
        left: Number(left.toFixed(2)),
        width: Number(width.toFixed(2)),
        height: Number(height.toFixed(2)),
      });

      const getElement = (selector: string): HTMLElement => {
        const node = document.querySelector(selector);
        if (!(node instanceof HTMLElement)) {
          throw new Error(`Missing element for selector: ${selector}`);
        }
        return node;
      };

      const section = getElement(
        `.react-flow__node[data-id="${currentSectionId}"]`,
      );
      const searchRow = getElement(
        `.react-flow__node[data-id="${currentSectionId}"] search.section-search`,
      );
      const pinnedSection = Array.from(
        section.querySelectorAll('section[data-params-fixed="true"]'),
      ).find((node) => node.textContent?.includes("Pinned Params"));
      if (!(pinnedSection instanceof HTMLElement)) {
        throw new Error("Missing pinned params section.");
      }

      const firstPinnedRow = getElement(
        `#ParamContainer-${currentSectionId}-${currentIdsByName.file}`,
      );
      const modeRow = getElement(
        `#ParamContainer-${currentSectionId}-${currentIdsByName.mode}`,
      );
      const encodingRow = getElement(
        `#ParamContainer-${currentSectionId}-${currentIdsByName.encoding}`,
      );
      const errorsRow = getElement(
        `#ParamContainer-${currentSectionId}-${currentIdsByName.errors}`,
      );
      const unpinnedListContainer = getElement(
        `.react-flow__node[data-id="${currentSectionId}"] div.section-args-nested.overflow-y-scroll`,
      );
      const resizeHandle = getElement(
        `.react-flow__node[data-id="${currentSectionId}"] .section-resize-handle-bottom-right`,
      );
      const agenticSourceHandle = getElement(
        `.react-flow__handle[data-nodeid="${currentSectionId}"][data-handleid="agentic-edge-source"]`,
      );
      const agenticTargetHandle = getElement(
        `.react-flow__handle[data-nodeid="${currentSectionId}"][data-handleid="agentic-edge-target"]`,
      );

      return {
        section: roundRect(section.getBoundingClientRect()),
        searchRow: roundRect(searchRow.getBoundingClientRect()),
        pinnedSection: roundRect(pinnedSection.getBoundingClientRect()),
        firstPinnedRow: roundRect(firstPinnedRow.getBoundingClientRect()),
        modeRow: roundRect(modeRow.getBoundingClientRect()),
        encodingRow: roundRect(encodingRow.getBoundingClientRect()),
        errorsRow: roundRect(errorsRow.getBoundingClientRect()),
        unpinnedListContainer: roundRect(
          unpinnedListContainer.getBoundingClientRect(),
        ),
        resizeHandle: roundRect(resizeHandle.getBoundingClientRect()),
        agenticSourceHandle: roundRect(
          agenticSourceHandle.getBoundingClientRect(),
        ),
        agenticTargetHandle: roundRect(
          agenticTargetHandle.getBoundingClientRect(),
        ),
        texts: {
          pinnedSection: pinnedSection.textContent?.trim() ?? "",
          firstPinnedRow: firstPinnedRow.textContent?.trim() ?? "",
          modeRow: modeRow.textContent?.trim() ?? "",
          encodingRow: encodingRow.textContent?.trim() ?? "",
          errorsRow: errorsRow.textContent?.trim() ?? "",
        },
        bufferingVisible:
          document.getElementById(
            `ParamContainer-${currentSectionId}-${currentIdsByName.buffering}`,
          ) !== null,
      };
    },
    { currentSectionId: sectionId, currentIdsByName: idsByName },
  );
}

test.describe.serial("callable phase 0 baseline", () => {
  test("keeps the open callable baseline geometry stable", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1200 });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const projectConfigId = projectContext.projectConfigId;
      const sectionId = await createCallableSection(page, projectConfigId);
      const idsByName = await setCallableAndGetParamIds(
        page,
        projectConfigId,
        sectionId,
        CALLABLE_NAME,
      );

      await postBackend(page, "/indentParams", {
        projectConfigId,
        sectionId,
        paramIds: [idsByName.errors],
      });
      await postBackend(page, "/setSectionPinnedParams", {
        projectConfigId,
        sectionId,
        pinnedParams: [idsByName.file],
      });
      await postBackend(page, "/setSectionEdgeInputs", {
        projectConfigId,
        sectionId,
        edgeInputParams: [idsByName.buffering],
      });

      const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
      await expect(sectionNode).toBeVisible();
      await expect(sectionNode.locator("text=Pinned Params")).toBeVisible();
      await expect(
        sectionNode.locator(`#ParamContainer-${sectionId}-${idsByName.file}`),
      ).toBeVisible();
      await expect(
        sectionNode.locator(`#ParamContainer-${sectionId}-${idsByName.errors}`),
      ).toBeVisible();

      await setViewportTransform(page, FIXED_VIEWPORT_TRANSFORM);
      await sectionNode.hover();

      // Lock the baseline around the row ordering, indentation, and handle placement
      // that Phase 1+ refactors must preserve.
      const metrics = await getCallablePhase0Metrics(
        page,
        sectionId,
        idsByName,
      );

      expect(metrics.texts.pinnedSection).toContain("Pinned Params");
      expect(metrics.texts.firstPinnedRow).toMatch(/^file/i);
      expect(metrics.texts.modeRow).toMatch(/^mode/i);
      expect(metrics.texts.encodingRow).toMatch(/^encoding/i);
      expect(metrics.texts.errorsRow).toMatch(/^errors/i);
      expect(metrics.bufferingVisible).toBe(false);

      expect(metrics.section.width).toBeGreaterThan(190);
      expect(metrics.section.height).toBeGreaterThan(330);

      expect(metrics.searchRow.top).toBeLessThan(metrics.pinnedSection.top);
      expect(metrics.pinnedSection.top).toBeLessThan(
        metrics.firstPinnedRow.top,
      );
      expect(metrics.firstPinnedRow.top).toBeLessThan(metrics.modeRow.top);
      expect(metrics.modeRow.top).toBeLessThan(metrics.encodingRow.top);
      expect(metrics.encodingRow.top).toBeLessThan(metrics.errorsRow.top);
      expect(metrics.errorsRow.top).toBeLessThan(
        metrics.unpinnedListContainer.bottom,
      );

      // Nested children must stay indented relative to their parent row, not merely
      // stacked beneath it.
      expect(metrics.errorsRow.left - metrics.encodingRow.left).toBeGreaterThan(
        8,
      );
      expect(metrics.errorsRow.left).toBeGreaterThan(metrics.modeRow.left);

      // The unpinned list and resize affordance must stay inside the callable shell.
      expect(metrics.unpinnedListContainer.top).toBeGreaterThanOrEqual(
        metrics.pinnedSection.bottom,
      );
      expect(metrics.resizeHandle.right).toBeGreaterThanOrEqual(
        metrics.section.right - 24,
      );
      expect(metrics.resizeHandle.bottom).toBeGreaterThanOrEqual(
        metrics.section.bottom - 24,
      );

      const searchCenterY =
        metrics.searchRow.top + metrics.searchRow.height / 2;
      const sourceCenterY =
        metrics.agenticSourceHandle.top +
        metrics.agenticSourceHandle.height / 2;
      const targetCenterY =
        metrics.agenticTargetHandle.top +
        metrics.agenticTargetHandle.height / 2;
      expect(Math.abs(sourceCenterY - searchCenterY)).toBeLessThanOrEqual(3);
      expect(Math.abs(targetCenterY - searchCenterY)).toBeLessThanOrEqual(3);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
