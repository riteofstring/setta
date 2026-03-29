/* @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.resetModules();
  vi.clearAllMocks();
});

describe("index", () => {
  it("owns the lifted section-boundary seam above SectionContainerDefaultBoundary and appRuntimeBootstrap.tsx", async () => {
    const routerValue = {
      dispose: vi.fn(),
      navigate: vi.fn(),
      revalidate: vi.fn(),
      subscribe: vi.fn(),
    };
    const renderRoot = vi.fn();
    const subscribe = vi.fn();
    const mockSectionContainerDefaultBoundary = vi.fn(
      ({
        sectionId,
        SectionBoundary,
      }: {
        sectionId: string;
        SectionBoundary: unknown;
      }) => (
        <div
          data-testid="mock-section-container-default-boundary"
          data-section-id={sectionId}
          data-has-section-boundary={String(Boolean(SectionBoundary))}
        />
      ),
    );
    const buildRuntimeBootstrapAppProps = vi.fn(() => ({
      router: routerValue,
    }));
    const App = vi.fn(({ router }: { router: unknown }) => (
      <div data-testid="mock-app" data-has-router={String(Boolean(router))} />
    ));

    vi.doMock("react-dom/client", () => ({
      createRoot: vi.fn(() => ({
        render: renderRoot,
      })),
    }));
    vi.doMock("state/subscriptions", () => ({
      subscribe,
    }));
    vi.doMock("./App", () => ({
      App,
    }));
    vi.doMock("./appRuntimeBootstrap", () => ({
      buildRuntimeBootstrapAppProps,
    }));
    vi.doMock(
      "components/Section/Container/SectionContainerDefaultBoundary",
      () => ({
        SectionContainerDefaultBoundary: (props: {
          sectionId: string;
          SectionBoundary: unknown;
        }) => mockSectionContainerDefaultBoundary(props),
      }),
    );
    vi.doMock("components/Section/Container/SortableSectionSection", () => ({
      SortableSectionSection: ({ sectionId }: { sectionId: string }) => (
        <div
          data-testid="mock-sortable-section-section"
          data-section-id={sectionId}
        />
      ),
    }));
    vi.doMock(
      "components/Section/Container/SectionContainerAreaDictBoundary",
      () => ({
        SectionContainerAreaDictBoundary: ({
          bgColor,
          sectionId,
        }: {
          bgColor: string;
          sectionId: string;
        }) => (
          <div
            data-testid="mock-section-container-area-dict-boundary"
            data-bg-color={bgColor}
            data-section-id={sectionId}
          />
        ),
      }),
    );

    await import("./index");

    const { createRoot } = await import("react-dom/client");
    const { SectionContainerDefaultBoundary } = await import(
      "components/Section/Container/SectionContainerDefaultBoundary"
    );
    const { SortableSectionSection } = await import(
      "components/Section/Container/SortableSectionSection"
    );

    expect(subscribe).toHaveBeenCalledOnce();
    expect(buildRuntimeBootstrapAppProps).toHaveBeenCalledOnce();
    expect(buildRuntimeBootstrapAppProps).toHaveBeenCalledWith({
      SectionBoundary: expect.any(Function),
      renderDictArea: expect.any(Function),
    });

    const routedArgs = vi.mocked(buildRuntimeBootstrapAppProps).mock
      .calls[0][0];
    expect(routedArgs.SectionBoundary).not.toBe(
      SectionContainerDefaultBoundary,
    );
    expect(
      renderToStaticMarkup(
        <routedArgs.SectionBoundary sectionId="section-1" />,
      ),
    ).toContain('data-testid="mock-section-container-default-boundary"');
    expect(
      renderToStaticMarkup(
        <routedArgs.SectionBoundary sectionId="section-1" />,
      ),
    ).toContain('data-has-section-boundary="true"');
    const forwardedBoundaryProps =
      mockSectionContainerDefaultBoundary.mock.calls[0]?.[0];
    expect(forwardedBoundaryProps?.SectionBoundary).toBe(
      SortableSectionSection,
    );
    expect(
      renderToStaticMarkup(
        <>
          {routedArgs.renderDictArea({
            sectionId: "section-1",
            bgColor: "#123456",
          })}
        </>,
      ),
    ).toContain('data-testid="mock-section-container-area-dict-boundary"');
    expect(
      renderToStaticMarkup(
        <>
          {routedArgs.renderDictArea({
            sectionId: "section-1",
            bgColor: "#123456",
          })}
        </>,
      ),
    ).toContain('data-section-id="section-1"');
    expect(
      renderToStaticMarkup(
        <>
          {routedArgs.renderDictArea({
            sectionId: "section-1",
            bgColor: "#123456",
          })}
        </>,
      ),
    ).toContain('data-bg-color="#123456"');

    expect(createRoot).toHaveBeenCalledOnce();
    expect(createRoot).toHaveBeenCalledWith(document.getElementById("root"));
    expect(renderRoot).toHaveBeenCalledOnce();

    const rendered = renderToStaticMarkup(<>{renderRoot.mock.calls[0][0]}</>);
    expect(rendered).toContain('data-testid="mock-app"');
    expect(App).toHaveBeenCalledOnce();
    expect(vi.mocked(App).mock.calls[0][0]).toMatchObject({
      router: routerValue,
    });
  });
});
