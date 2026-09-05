import { evaluate } from "./capture-actions.mjs";

const GEOMETRY_SNAPSHOT_EXPRESSION = `(() => {
  const round = (value) => Math.round(value * 1_000) / 1_000;
  const rect = (element) => {
    if (!element) return null;
    const value = element.getBoundingClientRect();
    return {
      bottom: round(value.bottom),
      height: round(value.height),
      left: round(value.left),
      right: round(value.right),
      top: round(value.top),
      width: round(value.width),
    };
  };
  const style = (element) => {
    if (!element) return null;
    const value = getComputedStyle(element);
    return {
      display: value.display,
      opacity: value.opacity,
      pointerEvents: value.pointerEvents,
      position: value.position,
      transform: value.transform,
      visibility: value.visibility,
      zIndex: value.zIndex,
    };
  };
  const record = (element, extra = {}) => ({
    ...extra,
    rect: rect(element),
    style: style(element),
  });
  const shell = document.querySelector('[data-workspace-shell="true"]');
  const canvas = document.querySelector('.setta-workspace-shell-canvas');
  const flow = document.querySelector('.react-flow');
  const minimap = document.querySelector('[data-testid="rf__minimap"]');
  const viewport = document.querySelector('.react-flow__viewport');
  const sections = [...document.querySelectorAll('[data-section-id]')].map((element, index) => {
    const manager = element.closest('[data-testid="workspace-window-manager-window"]');
    const dock = element.closest('[data-testid="workspace-bottom-dock-window-panel"]');
    return record(element, {
      active: element.getAttribute('data-section-active'),
      id: element.getAttribute('data-section-id'),
      index,
      placement: manager ? 'floating-window' : dock ? 'bottom-dock' : 'canvas',
      presentation: element.getAttribute('data-section-presentation'),
      type: element.getAttribute('data-section-type'),
    });
  });
  const nodes = [...document.querySelectorAll('[data-id]')].map((element, index) =>
    record(element, {
      id: element.getAttribute('data-id'),
      index,
      selected: element.getAttribute('data-selected'),
    }),
  );
  const panes = [...document.querySelectorAll('[data-workspace-shell-pane-region]')].map((element) => {
    const pane = element.querySelector('[data-pane]');
    return record(element, {
      pane: element.getAttribute('data-workspace-shell-pane-region'),
      visible: pane?.getAttribute('data-visible') ?? null,
      width: pane?.style.width ?? null,
    });
  });
  const windows = [...document.querySelectorAll('[data-testid="workspace-window-manager-window"], [data-testid="workspace-bottom-dock-window-panel"]')].map((element, index) =>
    record(element, {
      focused: element.getAttribute('data-focused'),
      id: element.getAttribute('data-workspace-window-id'),
      index,
      kind: element.getAttribute('data-testid'),
    }),
  );
  const selection = [...document.querySelectorAll('.react-flow__nodesselection-rect, .react-flow__selection')].map((element, index) =>
    record(element, { className: element.className, index }),
  );
  const activeElement = document.activeElement;
  return {
    document: {
      devicePixelRatio: window.devicePixelRatio,
      readyState: document.readyState,
      theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      title: document.title,
      url: location.href,
    },
    elements: {
      canvas: record(canvas),
      flow: record(flow),
      minimap: record(minimap),
      shell: record(shell),
      viewport: record(viewport),
    },
    focus: activeElement instanceof HTMLElement
      ? {
          ariaLabel: activeElement.getAttribute('aria-label'),
          dataTestId: activeElement.getAttribute('data-testid'),
          tagName: activeElement.tagName.toLowerCase(),
        }
      : null,
    nodes,
    panes,
    sections,
    selection,
    windows,
  };
})()`;

function hasPositiveSize(rectangle) {
  return rectangle.width > 0 && rectangle.height > 0;
}

function assertGeometry(geometry, scenario) {
  const shellRect = geometry.elements.shell?.rect;
  const flowRect = geometry.elements.flow?.rect;
  if (!shellRect || !flowRect) {
    throw new Error(
      `Scenario ${scenario.id} did not report shell and flow geometry.`,
    );
  }
  if (!hasPositiveSize(shellRect) || !hasPositiveSize(flowRect)) {
    throw new Error(
      `Scenario ${scenario.id} has non-positive shell or flow geometry.`,
    );
  }
  if (geometry.document.theme !== scenario.theme) {
    throw new Error(
      `Scenario ${scenario.id} rendered ${geometry.document.theme} instead of ${scenario.theme}.`,
    );
  }
}

export async function captureGeometry(client, scenario) {
  const geometry = await evaluate(client, GEOMETRY_SNAPSHOT_EXPRESSION);
  assertGeometry(geometry, scenario);
  return geometry;
}
