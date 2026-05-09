/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluateHtmlSurfaceSourcePolicy } from "./apiProbes";
import {
  HTML_SURFACE_SOURCE_CLASS_NAME,
  HTML_SURFACE_SOURCE_ID_ATTRIBUTE,
  HtmlSurfaceSourceLayer,
} from "./sourceLayer";

type TestSource = {
  readonly id: string;
  readonly label: string;
};

describe("HtmlSurfaceSourceLayer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mounts source hosts as direct canvas children with capture-ready metadata", () => {
    const canvas = document.createElement("canvas");
    document.body.append(canvas);
    const root = createRoot(canvas);
    const elements = new Map<string, HTMLElement>();

    act(() => {
      root.render(
        <HtmlSurfaceSourceLayer
          getSourceId={(source: TestSource) => source.id}
          onSourceElementChange={(sourceId, element) => {
            if (element) {
              elements.set(sourceId, element);
              return;
            }
            elements.delete(sourceId);
          }}
          renderSource={(source: TestSource) => (
            <button type="button">{source.label}</button>
          )}
          sources={[{ id: "source-a", label: "Source A" }]}
        />,
      );
    });

    const sourceElement = elements.get("source-a");
    expect(sourceElement).toBeInstanceOf(HTMLElement);
    if (!sourceElement) {
      throw new Error("Expected source host to mount.");
    }
    expect(sourceElement?.parentElement).toBe(canvas);
    expect(sourceElement?.dataset.gpuFlowHtmlSource).toBe("true");
    expect(sourceElement?.getAttribute(HTML_SURFACE_SOURCE_ID_ATTRIBUTE)).toBe(
      "source-a",
    );
    expect(
      sourceElement?.classList.contains(HTML_SURFACE_SOURCE_CLASS_NAME),
    ).toBe(true);
    expect(sourceElement?.style.contain).toBe("layout paint style");
    expect(sourceElement?.style.left).toBe("0px");
    expect(sourceElement?.style.pointerEvents).toBe("none");
    expect(sourceElement?.style.position).toBe("absolute");
    expect(sourceElement?.style.top).toBe("0px");
    expect(sourceElement?.style.transformOrigin).toBe("0 0");
    expect(sourceElement?.style.visibility).toBe("");
    expect(
      canvas.querySelector(
        `[data-gpu-flow-html-source-anchor="true"][${HTML_SURFACE_SOURCE_ID_ATTRIBUTE}="source-a"]`,
      ),
    ).not.toBeNull();
    expect(sourceElement?.querySelector("button")?.textContent).toBe(
      "Source A",
    );
    mockSourceBox(sourceElement);
    expect(evaluateHtmlSurfaceSourcePolicy(canvas, sourceElement).ok).toBe(
      true,
    );

    act(() => root.unmount());
    expect(elements.has("source-a")).toBe(false);
    expect(sourceElement?.isConnected).toBe(false);
    canvas.remove();
  });

  it("keeps source host identity stable while source content rerenders", () => {
    const canvas = document.createElement("canvas");
    document.body.append(canvas);
    const root = createRoot(canvas);
    const elements = new Map<string, HTMLElement>();
    const onSourceElementChange = (
      sourceId: string,
      element: HTMLElement | null,
    ) => {
      if (element) {
        elements.set(sourceId, element);
        return;
      }
      elements.delete(sourceId);
    };

    act(() => {
      root.render(
        <HtmlSurfaceSourceLayer
          getSourceId={(source: TestSource) => source.id}
          onSourceElementChange={onSourceElementChange}
          renderSource={(source: TestSource) => <span>{source.label}</span>}
          sources={[{ id: "source-a", label: "A" }]}
        />,
      );
    });
    const firstHost = elements.get("source-a");

    act(() => {
      root.render(
        <HtmlSurfaceSourceLayer
          getSourceId={(source: TestSource) => source.id}
          onSourceElementChange={onSourceElementChange}
          renderSource={(source: TestSource) => <span>{source.label}</span>}
          sources={[{ id: "source-a", label: "B" }]}
        />,
      );
    });

    expect(elements.get("source-a")).toBe(firstHost);
    expect(firstHost?.textContent).toBe("B");

    act(() => root.unmount());
    canvas.remove();
  });

  it("runs owner-specific source configuration without hiding the source host", () => {
    const canvas = document.createElement("canvas");
    document.body.append(canvas);
    const root = createRoot(canvas);
    const elements = new Map<string, HTMLElement>();

    act(() => {
      root.render(
        <HtmlSurfaceSourceLayer
          configureSourceElement={({ host, source }) => {
            host.dataset.ownerSource = source.id;
            host.style.zIndex = "12";
          }}
          getSourceId={(source: TestSource) => source.id}
          onSourceElementChange={(sourceId, element) => {
            if (element) {
              elements.set(sourceId, element);
              return;
            }
            elements.delete(sourceId);
          }}
          renderSource={(source: TestSource) => <span>{source.label}</span>}
          sourceClassName={`${HTML_SURFACE_SOURCE_CLASS_NAME} custom-source`}
          sources={[{ id: "source-a", label: "A" }]}
        />,
      );
    });

    const sourceElement = elements.get("source-a");
    expect(sourceElement?.dataset.gpuFlowHtmlSource).toBe("true");
    expect(sourceElement?.dataset.ownerSource).toBe("source-a");
    expect(sourceElement?.classList.contains("custom-source")).toBe(true);
    expect(sourceElement?.getAttribute(HTML_SURFACE_SOURCE_ID_ATTRIBUTE)).toBe(
      "source-a",
    );
    expect(sourceElement?.style.visibility).toBe("");
    expect(sourceElement?.style.zIndex).toBe("12");

    act(() => root.unmount());
    canvas.remove();
  });
});

function mockSourceBox(sourceElement: HTMLElement | undefined) {
  if (!sourceElement) {
    throw new Error("Expected source element to exist.");
  }
  const rect = {
    bottom: 60,
    height: 60,
    left: 0,
    right: 100,
    width: 100,
  };
  vi.spyOn(sourceElement, "getBoundingClientRect").mockReturnValue({
    ...rect,
    x: rect.left,
    y: rect.bottom - rect.height,
    toJSON: () => rect,
  } as DOMRect);
  vi.spyOn(sourceElement, "getClientRects").mockReturnValue({
    length: 1,
  } as DOMRectList);
}
