import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

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
  renderSource,
  sourceClassName = HTML_SURFACE_SOURCE_CLASS_NAME,
  sources,
}: HtmlSurfaceSourceLayerProps<TSource>) {
  return (
    <>
      {sources.map((source) => {
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
    if (!hostElement) {
      return;
    }
    configureHtmlSurfaceSourceElement({
      className: sourceClassName,
      host: hostElement,
      preservedClassNames,
      sourceId,
    });
    configureSourceElement?.({
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
