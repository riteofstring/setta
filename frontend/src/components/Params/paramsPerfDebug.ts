export type ParamsPerfDebugMetrics = {
  timestampMs: number;
  viewportWidth: number;
  viewportHeight: number;
  totalSectionCount: number;
  visibleSectionCount: number;
  totalParamRowCount: number;
  visibleParamRowCount: number;
};

type WindowWithParamsPerfDebug = Window & {
  __settaReadParamsPerfDebugMetrics?: () => ParamsPerfDebugMetrics;
  __settaLastParamsPerfDebugMetrics?: ParamsPerfDebugMetrics;
};

function isVisibleInViewport(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }
  return (
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth
  );
}

export function readParamsPerfDebugMetrics(
  doc: Document = document,
): ParamsPerfDebugMetrics {
  const sectionNodes = Array.from(
    doc.querySelectorAll<HTMLElement>(".react-flow__node"),
  );
  const paramRows = Array.from(
    doc.querySelectorAll<HTMLElement>("[data-param-row='true']"),
  );
  const visibleSectionCount = sectionNodes.reduce((count, sectionNode) => {
    return count + (isVisibleInViewport(sectionNode) ? 1 : 0);
  }, 0);
  const visibleParamRowCount = paramRows.reduce((count, row) => {
    return count + (isVisibleInViewport(row) ? 1 : 0);
  }, 0);
  return {
    timestampMs: performance.now(),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    totalSectionCount: sectionNodes.length,
    visibleSectionCount,
    totalParamRowCount: paramRows.length,
    visibleParamRowCount,
  };
}

export function installParamsPerfDebugHelper(): void {
  if (!import.meta.env.DEV) {
    return;
  }
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  const windowWithDebug = window as WindowWithParamsPerfDebug;
  if (!windowWithDebug.__settaReadParamsPerfDebugMetrics) {
    windowWithDebug.__settaReadParamsPerfDebugMetrics = () => {
      const metrics = readParamsPerfDebugMetrics(document);
      windowWithDebug.__settaLastParamsPerfDebugMetrics = metrics;
      return metrics;
    };
  }
  windowWithDebug.__settaLastParamsPerfDebugMetrics =
    windowWithDebug.__settaReadParamsPerfDebugMetrics();
}
