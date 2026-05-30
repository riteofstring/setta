import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const CANVAS_PARITY_SNAPSHOT_KEY = "__SETTA_WORKSPACE_CANVAS_PARITY_SNAPSHOT__";
const DEFAULT_VIEWPORT = { width: 1400, height: 1200 };
const DEFAULT_DEVICE_SCALE_FACTOR = 1;
const DEFAULT_WAIT_MS = 15_000;
const DEFAULT_SETTLE_MS = 250;

const args = parseArgs(process.argv.slice(2));
const url = requireArg(args, "url");
const outPath = args.out;
const screenshotPath = args.screenshot;
const mode = parseMode(args.mode ?? "auto");
const waitMs = parseNumberArg(args["wait-ms"] ?? args.waitMs, DEFAULT_WAIT_MS);
const settleMs = parseNumberArg(
  args["settle-ms"] ?? args.settleMs,
  DEFAULT_SETTLE_MS,
);
const viewport = parseViewport(args.viewport, DEFAULT_VIEWPORT);
const deviceScaleFactor = parseNumberArg(
  args["device-scale-factor"] ?? args.deviceScaleFactor,
  DEFAULT_DEVICE_SCALE_FACTOR,
);
const cleanCaptureState = parseCleanCaptureState(args);
const selectSectionId =
  args["select-section"] ?? args.selectSection ?? null;
const browser = await chromium.launch({
  headless: !args.headed && !args.headful,
});
const page = await browser.newPage({ viewport, deviceScaleFactor });
await installCleanWorkspaceCaptureState(page, cleanCaptureState);
await page.goto(url, { waitUntil: "domcontentloaded", timeout: waitMs });
await waitForWorkspaceAnchors(page, mode, waitMs);
await selectWorkspaceSection(page, mode, selectSectionId, waitMs);
await waitForWorkspacePaint(page, settleMs);

const resolvedMode = mode === "auto" ? await resolveWorkspaceMode(page) : mode;
const snapshot =
  resolvedMode === "canvas"
    ? await extractCanvasAnchorSnapshot(page)
    : await extractDomAnchorSnapshot(page);
if (typeof screenshotPath === "string" && screenshotPath.trim().length > 0) {
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: false });
}
await browser.close();

const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
if (outPath) {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, serialized, "utf8");
} else {
  process.stdout.write(serialized);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${raw}`);
    }
    const withoutPrefix = raw.slice(2);
    const equalsIndex = withoutPrefix.indexOf("=");
    if (equalsIndex >= 0) {
      const key = withoutPrefix.slice(0, equalsIndex);
      parsed[key] = withoutPrefix.slice(equalsIndex + 1);
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[withoutPrefix] = true;
      continue;
    }
    parsed[withoutPrefix] = next;
    index += 1;
  }
  return parsed;
}

function requireArg(parsed, key) {
  const value = parsed[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required --${key} argument.`);
  }
  return value;
}

function parseMode(value) {
  if (value === "auto" || value === "canvas" || value === "dom") {
    return value;
  }
  throw new Error(
    `Invalid --mode '${String(value)}'. Expected auto, canvas, or dom.`,
  );
}

function parseNumberArg(value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected numeric argument, got ${String(value)}.`);
  }
  return parsed;
}

function parseViewport(value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "string") {
    throw new Error("--viewport must use WIDTHxHEIGHT.");
  }
  const match = value.match(/^(\d+)x(\d+)$/u);
  if (!match) {
    throw new Error(`Invalid --viewport '${value}'. Expected WIDTHxHEIGHT.`);
  }
  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
}

function parseCleanCaptureState(args) {
  if (!Boolean(args["clean-workspace-capture"] ?? args.cleanWorkspaceCapture)) {
    return null;
  }
  const theme = parseTheme(args.theme ?? "dark");
  return {
    colorMode: theme,
    darkMode: theme === "dark",
    showMinimap: parseMinimapVisibility(args.minimap ?? "visible"),
  };
}

function parseTheme(value) {
  if (value === "dark" || value === "light") {
    return value;
  }
  throw new Error(
    `Invalid --theme '${String(value)}'. Expected dark or light.`,
  );
}

function parseMinimapVisibility(value) {
  if (
    value === true ||
    value === "true" ||
    value === "visible" ||
    value === "show" ||
    value === "shown"
  ) {
    return true;
  }
  if (
    value === false ||
    value === "false" ||
    value === "hidden" ||
    value === "hide" ||
    value === "off"
  ) {
    return false;
  }
  throw new Error(
    `Invalid --minimap '${String(value)}'. Expected visible or hidden.`,
  );
}

async function installCleanWorkspaceCaptureState(page, cleanCaptureState) {
  if (!cleanCaptureState) {
    return;
  }
  await page.addInitScript((captureState) => {
    const CLOSED_PANE_WIDTH = 40;
    const INITIAL_OVERVIEW_WIDTH = 335;
    const INITIAL_UI_EDITOR_WIDTH = 500;
    const storageKey = "setta_data";
    const parsed = parsePersistedLocalStorage(localStorage.getItem(storageKey));
    const state =
      parsed && typeof parsed.state === "object" && parsed.state !== null
        ? parsed.state
        : {};
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...(parsed && typeof parsed === "object" ? parsed : {}),
        state: {
          ...state,
          darkMode: captureState.darkMode,
          colorMode: captureState.colorMode,
          showMinimap: captureState.showMinimap,
          minimapSide: "left",
          overviewVis: false,
          overviewWidth: INITIAL_OVERVIEW_WIDTH,
          overviewTrueWidth: CLOSED_PANE_WIDTH,
          uiEditorVis: false,
          uiEditorWidth: INITIAL_UI_EDITOR_WIDTH,
          uiEditorTrueWidth: CLOSED_PANE_WIDTH,
          showNavBarHelpMessage: false,
        },
        version:
          parsed && typeof parsed.version === "number" ? parsed.version : 0,
      }),
    );

    function parsePersistedLocalStorage(raw) {
      if (!raw) {
        return {};
      }
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    }
  }, cleanCaptureState);
}

async function waitForWorkspacePaint(page, settleMs) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(resolve);
        });
      }),
  );
  if (settleMs > 0) {
    await page.waitForTimeout(settleMs);
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(resolve);
          });
        }),
    );
  }
}

async function waitForWorkspaceAnchors(page, mode, waitMs) {
  await page.waitForFunction(
    ({ key, mode }) => {
      const hasCanvasSnapshot = Boolean(window[key]);
      const hasDomSections = Boolean(
        document.querySelector(".react-flow section[data-section-id]") ??
          document.querySelector("section[data-section-id]"),
      );
      if (mode === "canvas") {
        return hasCanvasSnapshot;
      }
      if (mode === "dom") {
        return hasDomSections;
      }
      return hasCanvasSnapshot || hasDomSections;
    },
    { key: CANVAS_PARITY_SNAPSHOT_KEY, mode },
    { timeout: waitMs },
  );
}

async function selectWorkspaceSection(page, mode, sectionId, waitMs) {
  if (typeof sectionId !== "string" || sectionId.trim().length === 0) {
    return;
  }
  const stateApplied = await setFrontendSelectedSectionState(page, sectionId);
  if (stateApplied) {
    await waitForSelectedSection(page, mode, sectionId, waitMs);
    return;
  }
  const target = await page.evaluate(
    ({ key, sectionId }) => {
      const domSection = document.querySelector(
        `section[data-section-id="${CSS.escape(sectionId)}"]`,
      );
      if (domSection) {
        const header =
          domSection.querySelector("header") ??
          domSection.querySelector('[data-section-header="true"]');
        const rect = (header ?? domSection).getBoundingClientRect();
        return {
          x: rect.x + rect.width / 2,
          y: rect.y + Math.min(rect.height / 2, 12),
        };
      }
      const snapshot = window[key];
      const section = snapshot?.sections?.find(
        (entry) => entry.id === sectionId,
      );
      const rect = section?.header ?? section?.bounds;
      if (!rect) {
        return null;
      }
      return {
        x: rect.x + rect.width / 2,
        y: rect.y + Math.min(rect.height / 2, 12),
      };
    },
    { key: CANVAS_PARITY_SNAPSHOT_KEY, sectionId },
  );
  if (!target) {
    throw new Error(`Section '${sectionId}' is not available for selection.`);
  }
  await page.mouse.click(target.x, target.y);
  await waitForSelectedSection(page, mode, sectionId, waitMs);
}

async function setFrontendSelectedSectionState(page, sectionId) {
  return await page.evaluate(async (sectionId) => {
    const module = await import("/src/state/definitions.ts");
    const projectStore = module.useProjectState;
    const activeSectionStore = module.useActiveSectionUI;
    if (
      !projectStore ||
      typeof projectStore.setState !== "function" ||
      typeof projectStore.getState !== "function"
    ) {
      return false;
    }
    projectStore.setState((state) => ({
      ...state,
      projectConfig: {
        ...state.projectConfig,
        activeIds: [sectionId],
      },
    }));
    if (
      activeSectionStore &&
      typeof activeSectionStore.setState === "function" &&
      typeof activeSectionStore.getState === "function"
    ) {
      const current = activeSectionStore.getState();
      activeSectionStore.setState({
        activeIds: [sectionId],
        backendHydrationEnabled: false,
        selectionGeneration:
          typeof current.selectionGeneration === "number"
            ? current.selectionGeneration + 1
            : 1,
      });
    }
    return true;
  }, sectionId);
}

async function waitForSelectedSection(page, mode, sectionId, waitMs) {
  await page.waitForFunction(
    ({ key, mode, sectionId }) => {
      if (mode === "canvas" || window[key]) {
        return Boolean(
          window[key]?.sections?.some(
            (section) =>
              section.id === sectionId &&
              (section.selected || section.active),
          ),
        );
      }
      const domSection = document.querySelector(
        `section[data-section-id="${CSS.escape(sectionId)}"]`,
      );
      return Boolean(
        domSection &&
          (domSection.getAttribute("data-section-active") === "true" ||
            domSection.classList.contains("selected")),
      );
    },
    { key: CANVAS_PARITY_SNAPSHOT_KEY, mode, sectionId },
    { timeout: waitMs },
  );
}

async function resolveWorkspaceMode(page) {
  return await page.evaluate((key) => {
    if (window[key]) {
      return "canvas";
    }
    return "dom";
  }, CANVAS_PARITY_SNAPSHOT_KEY);
}

async function extractCanvasAnchorSnapshot(page) {
  return await page.evaluate((key) => {
    const snapshot = window[key];
    if (!snapshot) {
      throw new Error("Canvas workspace parity snapshot is unavailable.");
    }
    return {
      ...snapshot,
      source: {
        kind: "canvas-global-snapshot",
        url: window.location.href,
      },
      probes: collectProbeCounts(),
    };

    function collectProbeCounts() {
      return {
        canvasCount: document.querySelectorAll("canvas").length,
        reactFlowCount: document.querySelectorAll(".react-flow").length,
        sectionElementCount: document.querySelectorAll(
          "section[data-section-id]",
        ).length,
        paramRowElementCount:
          document.querySelectorAll("[data-param-row]").length,
        minimapElementCount: document.querySelectorAll(".react-flow__minimap")
          .length,
      };
    }
  }, CANVAS_PARITY_SNAPSHOT_KEY);
}

async function extractDomAnchorSnapshot(page) {
  return await page.evaluate(() => {
    const root = document.querySelector(".react-flow") ?? document.body;
    const sectionElements = Array.from(
      root.querySelectorAll("section[data-section-id]"),
    );
    const sections = sectionElements.map((sectionElement, index) =>
      buildSectionSnapshot(sectionElement, index),
    );
    return {
      kind: "workspace-dom-parity-snapshot",
      source: {
        kind: "dom-react-flow",
        url: window.location.href,
      },
      canvasBounds: rectFromElement(root),
      viewportSize: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      sectionOrder: sections.map((section) => section.id),
      sections,
      minimap: buildMinimapSnapshot(),
      probes: collectProbeCounts(),
    };

    function buildSectionSnapshot(sectionElement, sectionIndex) {
      const sectionId =
        sectionElement.getAttribute("data-section-id") ??
        `section:${sectionIndex}`;
      const bounds = rectFromElement(sectionElement);
      const rows = Array.from(
        sectionElement.querySelectorAll('[data-param-row="true"]'),
      ).map((rowElement, rowIndex) =>
        buildRowSnapshot(rowElement, sectionId, rowIndex, bounds),
      );
      const headerElement =
        sectionElement.querySelector("header") ??
        sectionElement.querySelector('[data-section-header="true"]');
      const header = deriveHeaderAnchor({
        bounds,
        headerElement,
        rows,
      });
      const active = isSectionActive(sectionElement);
      return {
        id: sectionId,
        type: sectionElement.getAttribute("data-section-type") ?? "",
        name: "",
        parentId: null,
        childIds: [],
        selected: active,
        active,
        worldBounds: bounds,
        bounds,
        header,
        body: rows.length > 0 ? unionRects(rows.map((row) => row.row)) : bounds,
        rows,
        scrollbar: deriveScrollbarAnchor(sectionElement),
      };
    }

    function isSectionActive(sectionElement) {
      return (
        sectionElement.getAttribute("data-section-active") === "true" ||
        sectionElement.classList.contains("selected")
      );
    }

    function deriveHeaderAnchor({ bounds, headerElement, rows }) {
      const firstVisibleRow = rows.find((row) => row.visible);
      if (firstVisibleRow) {
        return roundRect({
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: Math.max(0, firstVisibleRow.row.y - bounds.y),
        });
      }
      return headerElement
        ? rectFromElement(headerElement)
        : { x: bounds.x, y: bounds.y, width: bounds.width, height: 0 };
    }

    function buildRowSnapshot(rowElement, sectionId, rowIndex, sectionBounds) {
      const labelElement = queryFirstRowCell(rowElement, ".section-key");
      const valueElement = queryFirstRowCell(rowElement, ".section-value");
      const controlElement =
        valueElement?.querySelector("input, textarea, select, button") ??
        valueElement ??
        rowElement;
      const label = labelElement ? rectFromElement(labelElement) : null;
      const value = valueElement ? rectFromElement(valueElement) : null;
      const control = rectFromElement(controlElement);
      const containerRow = Boolean(
        rowElement.querySelector('[data-param-row="true"]'),
      );
      const row = deriveRowVisualRect(rowElement, [label, value, control]);
      return {
        id: rowElement.id || `${sectionId}:row:${rowIndex}`,
        sectionId,
        paramId: deriveParamId(rowElement, sectionId, rowIndex),
        paramType: rowElement.getAttribute("data-param-type") ?? "",
        passiveKind: "dom",
        controlKind: "dom",
        containerRow,
        list: "unpinned",
        index: rowIndex,
        depth: deriveRowDepth(rowElement),
        visible: isVisibleRect(row) && rectsIntersect(row, sectionBounds),
        row,
        label: label ?? row,
        value: value ?? row,
        valuePresent: value !== null,
        control,
      };
    }

    function deriveScrollbarAnchor(sectionElement) {
      const scrollContainer = Array.from(
        sectionElement.querySelectorAll("*"),
      ).find((element) => {
        const style = getComputedStyle(element);
        return (
          /^(auto|scroll)$/u.test(style.overflowY) &&
          element.scrollHeight > element.clientHeight + 1 &&
          isVisibleRect(rectFromElement(element))
        );
      });
      if (!scrollContainer) {
        return null;
      }
      const scrollRect = rectFromElement(scrollContainer);
      const scale =
        scrollContainer.offsetWidth > 0
          ? scrollRect.width / scrollContainer.offsetWidth
          : 1;
      const trackWidth = 8 * scale;
      const trackInsetX = 2 * scale;
      const trackInsetY = 4 * scale;
      if (scrollRect.height <= trackInsetY * 2 || scrollRect.width <= 0) {
        return null;
      }
      return roundRect({
        x: scrollRect.x + scrollRect.width - trackWidth - trackInsetX,
        y: scrollRect.y + trackInsetY,
        width: trackWidth,
        height: scrollRect.height - trackInsetY * 2,
      });
    }

    function deriveRowVisualRect(rowElement, cellRects) {
      if (!rowElement.querySelector('[data-param-row="true"]')) {
        return rectFromElement(rowElement);
      }
      return (
        unionRects(cellRects.filter(Boolean)) || rectFromElement(rowElement)
      );
    }

    function queryFirstRowCell(rowElement, selector) {
      const direct = Array.from(rowElement.children).find((child) =>
        child.matches(selector),
      );
      if (!direct && selector === ".section-key") {
        const directParagraph = Array.from(rowElement.children).find(
          (child) => child.tagName === "P",
        );
        if (directParagraph) {
          return directParagraph;
        }
      }
      return direct ?? rowElement.querySelector(selector);
    }

    function deriveParamId(rowElement, sectionId, rowIndex) {
      const explicitParamId = rowElement.getAttribute("data-param-id");
      if (explicitParamId) {
        return explicitParamId;
      }
      const prefix = `ParamContainer-${sectionId}-`;
      if (rowElement.id.startsWith(prefix)) {
        return rowElement.id.slice(prefix.length);
      }
      return rowElement.id || `${sectionId}:row:${rowIndex}`;
    }

    function deriveRowDepth(rowElement) {
      return rowElement.closest(".section-args-nested") ? 1 : 0;
    }

    function buildMinimapSnapshot() {
      const minimapElement = document.querySelector(".react-flow__minimap");
      if (!minimapElement) {
        return {
          visible: false,
          bounds: emptyRect(),
          viewportMask: emptyRect(),
          sectionPreviewCount: 0,
          sectionPreviews: [],
        };
      }
      const svgElement = minimapElement.querySelector("svg");
      const maskElement = minimapElement.querySelector(
        ".react-flow__minimap-mask",
      );
      const sectionPreviews = Array.from(
        minimapElement.querySelectorAll(".react-flow__minimap-node"),
      ).map((previewElement, index) => ({
        sectionId:
          previewElement.getAttribute("data-minimap-node-id") ??
          `preview:${index}`,
        rect: rectFromElement(previewElement),
      }));
      return {
        visible: isVisibleRect(rectFromElement(minimapElement)),
        bounds: rectFromElement(minimapElement),
        viewportMask:
          svgElement && maskElement
            ? deriveViewportMaskRect(svgElement, maskElement)
            : emptyRect(),
        sectionPreviewCount: sectionPreviews.length,
        sectionPreviews,
      };
    }

    function deriveViewportMaskRect(svgElement, maskElement) {
      const pathRect = parseInnerMinimapPathRect(
        maskElement.getAttribute("d") ?? "",
      );
      if (!pathRect) {
        return rectFromElement(maskElement);
      }
      const viewBox = svgElement.viewBox.baseVal;
      if (!viewBox || viewBox.width <= 0 || viewBox.height <= 0) {
        return rectFromElement(maskElement);
      }
      const svgRect = svgElement.getBoundingClientRect();
      return roundRect({
        x:
          svgRect.x +
          ((pathRect.x - viewBox.x) / viewBox.width) * svgRect.width,
        y:
          svgRect.y +
          ((pathRect.y - viewBox.y) / viewBox.height) * svgRect.height,
        width: (pathRect.width / viewBox.width) * svgRect.width,
        height: (pathRect.height / viewBox.height) * svgRect.height,
      });
    }

    function parseInnerMinimapPathRect(pathData) {
      const numberPattern = "[-+]?\\d*\\.?\\d+(?:e[-+]?\\d+)?";
      const commandPattern = new RegExp(
        `M\\s*(${numberPattern})\\s*,\\s*(${numberPattern})\\s*h\\s*(${numberPattern})\\s*v\\s*(${numberPattern})`,
        "giu",
      );
      const matches = Array.from(pathData.matchAll(commandPattern));
      const innerPath = matches[1];
      if (!innerPath) {
        return null;
      }
      return {
        x: Number(innerPath[1]),
        y: Number(innerPath[2]),
        width: Math.abs(Number(innerPath[3])),
        height: Math.abs(Number(innerPath[4])),
      };
    }

    function rectFromElement(element) {
      return roundRect(element.getBoundingClientRect());
    }

    function unionRects(rects) {
      const positiveRects = rects.filter(isVisibleRect);
      if (positiveRects.length === 0) {
        return emptyRect();
      }
      const left = Math.min(...positiveRects.map((rect) => rect.x));
      const top = Math.min(...positiveRects.map((rect) => rect.y));
      const right = Math.max(
        ...positiveRects.map((rect) => rect.x + rect.width),
      );
      const bottom = Math.max(
        ...positiveRects.map((rect) => rect.y + rect.height),
      );
      return roundRect({
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      });
    }

    function isVisibleRect(rect) {
      return rect.width > 0 && rect.height > 0;
    }

    function rectsIntersect(first, second) {
      return (
        first.x < second.x + second.width &&
        first.x + first.width > second.x &&
        first.y < second.y + second.height &&
        first.y + first.height > second.y
      );
    }

    function emptyRect() {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    function roundRect(rect) {
      return {
        x: round(rect.x),
        y: round(rect.y),
        width: round(rect.width),
        height: round(rect.height),
      };
    }

    function round(value) {
      return Math.round(value * 1000) / 1000;
    }

    function collectProbeCounts() {
      return {
        canvasCount: document.querySelectorAll("canvas").length,
        reactFlowCount: document.querySelectorAll(".react-flow").length,
        sectionElementCount: document.querySelectorAll(
          "section[data-section-id]",
        ).length,
        paramRowElementCount:
          document.querySelectorAll("[data-param-row]").length,
        minimapElementCount: document.querySelectorAll(".react-flow__minimap")
          .length,
      };
    }
  });
}
