import assert from "node:assert/strict";

import { evaluate } from "../browser-page.mjs";

const canonicalCaptureNormalizations = Object.freeze({
  "canonical-callable-replacement": Object.freeze({
    collection: "callables",
    sectionPrefix: "python-canvas:callable:",
    stableId: "id:000000000000000000000000000000c1",
  }),
  "canonical-list-replacement": Object.freeze({
    collection: "lists",
    sectionPrefix: "python-canvas:list:",
    stableId: "id:00000000000000000000000000000011",
  }),
  "canonical-param-dict-replacement": Object.freeze({
    collection: "parameterDictionaries",
    sectionPrefix: "python-canvas:parameter-dictionary:",
    stableId: "id:000000000000000000000000000000d1",
  }),
});

export async function collectPublicState(client, selectors) {
  return evaluate(
    client,
    `(() => {
      const rectangle = (element) => {
        const rect = element.getBoundingClientRect();
        return {
          bottom: rect.bottom,
          height: rect.height,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          width: rect.width,
          x: rect.x,
          y: rect.y,
        };
      };
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" &&
          Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
      };
      const workspace = document.querySelector(".setta-workspace");
      const canvas = document.querySelector(${JSON.stringify(selectors.workspaceCanvas)});
      const canvasViewport = document.querySelector(".react-flow__viewport");
      const shell = document.querySelector('[data-workspace-shell="true"]');
      const active = document.activeElement;
      const transform = canvasViewport instanceof HTMLElement
        ? getComputedStyle(canvasViewport).transform
        : null;
      const matrix = transform === null || transform === "none"
        ? null
        : new DOMMatrixReadOnly(transform);
      const sections = Array.from(document.querySelectorAll("[data-section-id]"), (section) => {
        const style = getComputedStyle(section);
        return {
          active: section.getAttribute("data-section-active"),
          ariaLabel: section.getAttribute("aria-label"),
          ariaSelected: section.getAttribute("aria-selected"),
          dragging: section.classList.contains("opacity-80") ||
            section.parentElement?.classList.contains("opacity-80") === true,
          id: section.getAttribute("data-section-id"),
          rect: rectangle(section),
          selected: section.getAttribute("data-selected"),
          visible: visible(section),
          zIndex: style.zIndex,
        };
      });
      const dragPreview = document.querySelector('[data-dnd-placeholder="true"]');
      const generatedEditor = document.querySelector(${JSON.stringify(selectors.generatedEditor)});
      const generatedScroller = generatedEditor?.querySelector(".cm-scroller");
      const pendingSections = Array.from(document.querySelectorAll("[data-section-type]"))
        .filter((section) => section.getAttribute("data-section-type")?.endsWith("-pending") === true)
        .map((section) => ({
          rect: rectangle(section),
          type: section.getAttribute("data-section-type"),
          visible: visible(section),
        }));
      const savedViewsPane = document.querySelector(${JSON.stringify(selectors.savedViewsPane)});
      const savedViewRows = savedViewsPane instanceof HTMLElement
        ? Array.from(savedViewsPane.querySelectorAll("[data-workspace-saved-view-id]"), (row) => ({
            active: row.getAttribute("data-active"),
            id: row.getAttribute("data-workspace-saved-view-id"),
          }))
        : [];
      const terminalPane = document.querySelector(${JSON.stringify(selectors.terminalPane)});
      const terminalSurface = document.querySelector(${JSON.stringify(selectors.terminalSurface)});
      const terminalRows = document.querySelector(${JSON.stringify(selectors.terminalRows)});
      const terminalViewport = document.querySelector(${JSON.stringify(selectors.terminalViewport)});
      const terminalToggle = document.querySelector(${JSON.stringify(selectors.terminalToggle)});
      const focusSection = active instanceof Element
        ? active.closest("[data-section-id]")?.getAttribute("data-section-id") ?? null
        : null;
      return {
        canvas: canvas instanceof HTMLElement ? {
          rect: rectangle(canvas),
          visible: visible(canvas),
        } : null,
        document: {
          activeElement: active instanceof HTMLElement ? {
            ariaLabel: active.getAttribute("aria-label"),
            dataSectionId: focusSection,
            role: active.getAttribute("role"),
            tagName: active.tagName,
          } : null,
          colorScheme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
          readyState: document.readyState,
        },
        dragPreview: dragPreview instanceof HTMLElement ? {
          rect: rectangle(dragPreview),
          visible: visible(dragPreview),
        } : null,
        generatedEditor: generatedEditor instanceof HTMLElement ? {
          protectedLineCount: generatedEditor.querySelectorAll("[data-workspace-generated-line]").length,
          rect: rectangle(generatedEditor),
          scroller: generatedScroller instanceof HTMLElement ? {
            clientHeight: generatedScroller.clientHeight,
            scrollHeight: generatedScroller.scrollHeight,
            scrollTop: generatedScroller.scrollTop,
          } : null,
          visible: visible(generatedEditor),
        } : null,
        pendingSections,
        savedViews: savedViewsPane instanceof HTMLElement ? {
          editing: savedViewsPane.getAttribute("data-workspace-saved-view-editing"),
          rect: rectangle(savedViewsPane),
          rows: savedViewRows,
          visible: visible(savedViewsPane),
        } : null,
        sections,
        shell: shell instanceof HTMLElement ? {
          rect: rectangle(shell),
          panes: Array.from(shell.querySelectorAll("[data-workspace-shell-pane-region]"), (pane) => ({
            edge: pane.getAttribute("data-workspace-shell-pane-region"),
            rect: rectangle(pane),
            visible: pane.querySelector("[data-pane]")?.getAttribute("data-visible") ?? null,
          })),
        } : null,
        terminal: {
          nowheel: terminalSurface instanceof HTMLElement
            ? terminalSurface.classList.contains("nowheel")
            : false,
          pane: terminalPane instanceof HTMLElement ? rectangle(terminalPane) : null,
          rows: terminalRows instanceof HTMLElement
            ? (terminalRows.textContent ?? "").slice(-4096)
            : null,
          toggleLabel: terminalToggle?.getAttribute("aria-label") ?? null,
          viewport: terminalViewport instanceof HTMLElement ? {
            clientHeight: terminalViewport.clientHeight,
            scrollHeight: terminalViewport.scrollHeight,
            scrollTop: terminalViewport.scrollTop,
          } : null,
        },
        viewport: {
          devicePixelRatio: window.devicePixelRatio,
          documentHeight: document.documentElement.scrollHeight,
          documentWidth: document.documentElement.scrollWidth,
          height: window.innerHeight,
          matrix: matrix === null ? null : {
            x: matrix.m41,
            y: matrix.m42,
            zoom: matrix.m11,
          },
          width: window.innerWidth,
        },
        workspace: workspace instanceof HTMLElement ? {
          className: workspace.className,
          rect: rectangle(workspace),
          visible: visible(workspace),
        } : null,
      };
    })()`,
  );
}

function replaceExactJsonStrings(value, replacements) {
  if (typeof value === "string") {
    return replacements.get(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceExactJsonStrings(item, replacements));
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      replacements.get(key) ?? key,
      replaceExactJsonStrings(item, replacements),
    ]),
  );
}

export function normalizeCanonicalCapture(
  scenario,
  initialSnapshot,
  canonicalSnapshot,
  publicState,
) {
  const configuration = canonicalCaptureNormalizations[scenario.capture];
  if (configuration === undefined) {
    return { canonicalSnapshot, publicState };
  }
  const initialIds = new Set(
    initialSnapshot[configuration.collection].map((section) => section.id),
  );
  const created = canonicalSnapshot[configuration.collection].filter(
    (section) => !initialIds.has(section.id),
  );
  assert.equal(
    created.length,
    1,
    `${scenario.id} must create exactly one canonical section.`,
  );
  const runtimeId = created[0].id;
  const replacements = new Map([
    [runtimeId, configuration.stableId],
    [
      `${configuration.sectionPrefix}${runtimeId}`,
      `${configuration.sectionPrefix}${configuration.stableId}`,
    ],
  ]);
  return {
    canonicalSnapshot: replaceExactJsonStrings(canonicalSnapshot, replacements),
    publicState: replaceExactJsonStrings(publicState, replacements),
  };
}
