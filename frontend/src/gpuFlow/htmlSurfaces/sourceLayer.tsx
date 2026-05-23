import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
  type ReactNode,
} from "react";

import { createPortal } from "react-dom";

import {
  HTML_SURFACE_EXPLICIT_DIRTY_SOURCE_ATTRIBUTE,
  HTML_SURFACE_SOURCE_CLASS_NAME,
  HTML_SURFACE_SOURCE_ID_ATTRIBUTE,
} from "./sourceDom";

export {
  HTML_SURFACE_SOURCE_CLASS_NAME,
  HTML_SURFACE_SOURCE_ID_ATTRIBUTE,
  HTML_SURFACE_SOURCE_SELECTOR,
} from "./sourceDom";

export type HtmlSurfaceSourceElementConfig<TSource> = {
  readonly anchor: HTMLElement;
  readonly className: string;
  readonly host: HTMLElement;
  readonly source: TSource;
  readonly sourceId: string;
};

type HtmlSurfaceSourceLayerProps<TSource> = {
  readonly configureSourceElement?:
    | ((config: HtmlSurfaceSourceElementConfig<TSource>) => void)
    | undefined;
  readonly getSourceId: (source: TSource) => string;
  readonly onSourceElementChange?:
    | ((sourceId: string, element: HTMLElement | null) => void)
    | undefined;
  readonly preservedClassNames?: readonly string[] | undefined;
  readonly prioritySourceIds?:
    | ReadonlySet<string>
    | readonly string[]
    | undefined;
  readonly progressiveBatchDelayMs?: number | undefined;
  readonly progressiveBatchSize?: number | undefined;
  readonly renderSource: (source: TSource) => ReactNode;
  readonly sourceClassName?: string | undefined;
  readonly sources: readonly TSource[];
};

type HtmlSurfaceSourceChildProps<TSource> = Omit<
  HtmlSurfaceSourceLayerProps<TSource>,
  "getSourceId" | "sources"
> & {
  readonly source: TSource;
  readonly sourceId: string;
};

export function HtmlSurfaceSourceLayer<TSource>({
  configureSourceElement,
  getSourceId,
  onSourceElementChange,
  preservedClassNames,
  prioritySourceIds,
  progressiveBatchDelayMs,
  progressiveBatchSize,
  renderSource,
  sourceClassName = HTML_SURFACE_SOURCE_CLASS_NAME,
  sources,
}: HtmlSurfaceSourceLayerProps<TSource>) {
  const orderedSources = useMemo(
    () => orderHtmlSurfaceSources({ getSourceId, prioritySourceIds, sources }),
    [getSourceId, prioritySourceIds, sources],
  );
  const prioritySourceCount = useMemo(
    () =>
      countPriorityHtmlSurfaceSources({
        getSourceId,
        prioritySourceIds,
        sources: orderedSources,
      }),
    [getSourceId, orderedSources, prioritySourceIds],
  );
  const renderSources = useProgressiveHtmlSurfaceSources({
    getSourceId,
    minimumInitialSourceCount: prioritySourceCount,
    progressiveBatchDelayMs,
    progressiveBatchSize,
    sources: orderedSources,
  });
  return (
    <>
      {renderSources.map((source) => {
        const sourceId = getSourceId(source);
        return (
          <HtmlSurfaceSourceChild
            configureSourceElement={configureSourceElement}
            key={sourceId}
            onSourceElementChange={onSourceElementChange}
            preservedClassNames={preservedClassNames}
            renderSource={renderSource}
            source={source}
            sourceClassName={sourceClassName}
            sourceId={sourceId}
          />
        );
      })}
    </>
  );
}

function orderHtmlSurfaceSources<TSource>({
  getSourceId,
  prioritySourceIds,
  sources,
}: {
  readonly getSourceId: (source: TSource) => string;
  readonly prioritySourceIds?:
    | ReadonlySet<string>
    | readonly string[]
    | undefined;
  readonly sources: readonly TSource[];
}): readonly TSource[] {
  const priorityIds = normalizeSourceIdSet(prioritySourceIds);
  if (!priorityIds || priorityIds.size === 0 || sources.length <= 1) {
    return sources;
  }
  const prioritySources: TSource[] = [];
  const remainingSources: TSource[] = [];
  for (const source of sources) {
    if (priorityIds.has(getSourceId(source))) {
      prioritySources.push(source);
    } else {
      remainingSources.push(source);
    }
  }
  return [...prioritySources, ...remainingSources];
}

function useProgressiveHtmlSurfaceSources<TSource>({
  getSourceId,
  minimumInitialSourceCount,
  progressiveBatchDelayMs,
  progressiveBatchSize,
  sources,
}: {
  readonly getSourceId: (source: TSource) => string;
  readonly minimumInitialSourceCount: number;
  readonly progressiveBatchDelayMs?: number | undefined;
  readonly progressiveBatchSize?: number | undefined;
  readonly sources: readonly TSource[];
}): readonly TSource[] {
  const batchSize = normalizeProgressiveBatchSize(progressiveBatchSize);
  const batchDelayMs = normalizeProgressiveBatchDelayMs(
    progressiveBatchDelayMs,
  );
  const sourceKey = useMemo(
    () => sources.map(getSourceId).join("\u001f"),
    [getSourceId, sources],
  );
  const initialLimit =
    batchSize === null
      ? sources.length
      : Math.min(
          sources.length,
          Math.max(batchSize, minimumInitialSourceCount),
        );
  const [progress, setProgress] = useState(() => ({
    limit: initialLimit,
    sourceKey,
  }));
  const renderLimit =
    progress.sourceKey === sourceKey ? progress.limit : initialLimit;

  useEffect(() => {
    if (progress.sourceKey !== sourceKey || progress.limit > sources.length) {
      setProgress({ limit: initialLimit, sourceKey });
    }
  }, [initialLimit, progress.limit, progress.sourceKey, sourceKey, sources]);

  useEffect(() => {
    if (batchSize === null || renderLimit >= sources.length) {
      return;
    }
    let cancelled = false;
    let idle: number | null = null;
    let timer: number | null = null;
    const commitProgress = () => {
      if (cancelled) {
        return;
      }
      startTransition(() => {
        setProgress((current) => {
          const currentLimit =
            current.sourceKey === sourceKey ? current.limit : initialLimit;
          return {
            limit: Math.min(sources.length, currentLimit + batchSize),
            sourceKey,
          };
        });
      });
    };
    const requestIdleProgress = () => {
      if (cancelled) {
        return;
      }
      if (
        typeof window.requestIdleCallback === "function" &&
        typeof window.cancelIdleCallback === "function"
      ) {
        const runIdle = (deadline: IdleDeadline) => {
          idle = null;
          if (cancelled) {
            return;
          }
          if (
            !deadline.didTimeout &&
            deadline.timeRemaining() < HTML_SURFACE_PROGRESSIVE_MIN_IDLE_MS
          ) {
            idle = window.requestIdleCallback(runIdle, {
              timeout: HTML_SURFACE_PROGRESSIVE_IDLE_TIMEOUT_MS,
            });
            return;
          }
          commitProgress();
        };
        idle = window.requestIdleCallback(runIdle, {
          timeout: HTML_SURFACE_PROGRESSIVE_IDLE_TIMEOUT_MS,
        });
        return;
      }
      commitProgress();
    };
    const frame = window.requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }
      timer = window.setTimeout(() => {
        timer = null;
        requestIdleProgress();
      }, batchDelayMs);
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      if (
        idle !== null &&
        typeof window.cancelIdleCallback === "function"
      ) {
        window.cancelIdleCallback(idle);
      }
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [batchDelayMs, batchSize, initialLimit, renderLimit, sourceKey, sources]);
  useProgressiveHtmlSurfaceSourceHeartbeat(
    batchSize !== null && renderLimit < sources.length,
  );

  return renderLimit >= sources.length
    ? sources
    : sources.slice(0, renderLimit);
}

function useProgressiveHtmlSurfaceSourceHeartbeat(active: boolean) {
  useEffect(() => {
    if (!active) {
      return;
    }
    let cancelled = false;
    let frame = 0;
    const schedule = () => {
      frame = window.requestAnimationFrame(() => {
        if (!cancelled) {
          schedule();
        }
      });
    };
    schedule();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [active]);
}

function normalizeSourceIdSet(
  sourceIds: ReadonlySet<string> | readonly string[] | undefined,
): ReadonlySet<string> | null {
  if (!sourceIds) {
    return null;
  }
  return sourceIds instanceof Set ? sourceIds : new Set(sourceIds);
}

function countPriorityHtmlSurfaceSources<TSource>({
  getSourceId,
  prioritySourceIds,
  sources,
}: {
  readonly getSourceId: (source: TSource) => string;
  readonly prioritySourceIds?:
    | ReadonlySet<string>
    | readonly string[]
    | undefined;
  readonly sources: readonly TSource[];
}): number {
  const priorityIds = normalizeSourceIdSet(prioritySourceIds);
  if (!priorityIds || priorityIds.size === 0) {
    return 0;
  }
  let count = 0;
  for (const source of sources) {
    if (!priorityIds.has(getSourceId(source))) {
      break;
    }
    count += 1;
  }
  return count;
}

function normalizeProgressiveBatchSize(
  progressiveBatchSize: number | undefined,
): number | null {
  if (progressiveBatchSize === undefined) {
    return null;
  }
  const batchSize = Math.floor(progressiveBatchSize);
  return batchSize > 0 ? batchSize : null;
}

const HTML_SURFACE_PROGRESSIVE_IDLE_TIMEOUT_MS = 1_200;
const HTML_SURFACE_PROGRESSIVE_MIN_IDLE_MS = 12;

function normalizeProgressiveBatchDelayMs(
  progressiveBatchDelayMs: number | undefined,
): number {
  if (progressiveBatchDelayMs === undefined) {
    return 0;
  }
  if (!Number.isFinite(progressiveBatchDelayMs)) {
    return 0;
  }
  return Math.max(0, Math.floor(progressiveBatchDelayMs));
}

function HtmlSurfaceSourceChild<TSource>({
  configureSourceElement,
  onSourceElementChange,
  preservedClassNames,
  renderSource,
  source,
  sourceClassName = HTML_SURFACE_SOURCE_CLASS_NAME,
  sourceId,
}: HtmlSurfaceSourceChildProps<TSource>) {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [hostElement, setHostElement] = useState<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }
    const host =
      hostRef.current ?? createHtmlSurfaceSourceElement(anchor.ownerDocument);
    hostRef.current = host;
    insertHtmlSurfaceSourceAfterAnchor(anchor, host);
    setHostElement(host);
    onSourceElementChange?.(sourceId, host);
    return () => {
      onSourceElementChange?.(sourceId, null);
      host.remove();
      if (hostRef.current === host) {
        hostRef.current = null;
      }
    };
  }, [onSourceElementChange, sourceId]);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!hostElement || !anchor) {
      return;
    }
    configureHtmlSurfaceSourceElement({
      className: sourceClassName,
      host: hostElement,
      preservedClassNames,
      sourceId,
    });
    configureSourceElement?.({
      anchor,
      className: sourceClassName,
      host: hostElement,
      source,
      sourceId,
    });
  }, [
    configureSourceElement,
    hostElement,
    source,
    sourceClassName,
    sourceId,
    preservedClassNames,
  ]);

  return (
    <>
      <span
        aria-hidden="true"
        data-gpu-flow-html-source-anchor="true"
        data-gpu-flow-source-id={sourceId}
        ref={anchorRef}
        style={{ display: "none" }}
      />
      {hostElement ? createPortal(renderSource(source), hostElement) : null}
    </>
  );
}

function createHtmlSurfaceSourceElement(
  ownerDocument: Document,
): HTMLDivElement {
  return ownerDocument.createElement("div");
}

function insertHtmlSurfaceSourceAfterAnchor(
  anchor: HTMLElement,
  host: HTMLElement,
) {
  const parent = anchor.parentNode;
  if (!parent || host.parentNode === parent) {
    return;
  }
  parent.insertBefore(host, anchor.nextSibling);
}

function configureHtmlSurfaceSourceElement({
  className = HTML_SURFACE_SOURCE_CLASS_NAME,
  host,
  preservedClassNames,
  sourceId,
}: {
  readonly className?: string | undefined;
  readonly host: HTMLElement;
  readonly preservedClassNames?: readonly string[] | undefined;
  readonly sourceId: string;
}) {
  host.className = mergeHtmlSurfaceSourceClassName(
    className,
    host.classList,
    preservedClassNames,
  );
  host.setAttribute(HTML_SURFACE_EXPLICIT_DIRTY_SOURCE_ATTRIBUTE, "true");
  host.dataset.gpuFlowHtmlSource = "true";
  host.setAttribute(HTML_SURFACE_SOURCE_ID_ATTRIBUTE, sourceId);
  setHtmlSurfaceSourceBaseStyle(host);
  clearHtmlSurfaceSourceVisibility(host);
}

function mergeHtmlSurfaceSourceClassName(
  baseClassName: string,
  currentClassList: DOMTokenList,
  preservedClassNames: readonly string[] | undefined = undefined,
): string {
  const classes = new Set(baseClassName.split(/\s+/).filter(Boolean));
  if (currentClassList.contains(HTML_SURFACE_SOURCE_CLASS_NAME)) {
    classes.add(HTML_SURFACE_SOURCE_CLASS_NAME);
  }
  for (const className of preservedClassNames ?? []) {
    if (currentClassList.contains(className)) {
      classes.add(className);
    }
  }
  return [...classes].join(" ");
}

function setHtmlSurfaceSourceBaseStyle(element: HTMLElement) {
  setStyleValue(element, "contain", "layout paint style");
  setStyleValue(element, "left", "0px");
  setStyleValue(element, "pointerEvents", "none");
  setStyleValue(element, "position", "absolute");
  setStyleValue(element, "top", "0px");
  setStyleValue(element, "transformOrigin", "0 0");
}

function clearHtmlSurfaceSourceVisibility(element: HTMLElement) {
  if (element.style.visibility) {
    element.style.removeProperty("visibility");
  }
}

function setStyleValue(
  element: HTMLElement,
  property:
    | "contain"
    | "left"
    | "pointerEvents"
    | "position"
    | "top"
    | "transformOrigin",
  value: string,
) {
  if (element.style[property] !== value) {
    element.style[property] = value;
  }
}
