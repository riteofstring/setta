import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("appRuntimeBootstrap", () => {
  it("owns the lifted section-boundary and dict-area seams above appBootstrap.tsx", async () => {
    const routerValue = {
      dispose: vi.fn(),
      navigate: vi.fn(),
      revalidate: vi.fn(),
      subscribe: vi.fn(),
    };
    const buildBootstrapAppProps = vi.fn(() => ({ router: routerValue }));

    vi.doMock("./appBootstrap", () => ({
      buildBootstrapAppProps,
    }));
    vi.doMock("components/Section/Container/SectionContainerBoundary", () => ({
      SectionContainerBoundary: ({ sectionId }: { sectionId: string }) => (
        <div
          data-testid="mock-section-container-boundary"
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

    const { buildRuntimeBootstrapAppProps } = await import(
      "./appRuntimeBootstrap"
    );
    const { SectionContainerBoundary } = await import(
      "components/Section/Container/SectionContainerBoundary"
    );

    expect(buildRuntimeBootstrapAppProps()).toEqual({ router: routerValue });
    expect(buildBootstrapAppProps).toHaveBeenCalledOnce();
    expect(buildBootstrapAppProps).toHaveBeenCalledWith({
      SectionBoundary: SectionContainerBoundary,
      renderDictArea: expect.any(Function),
    });

    const routedArgs = vi.mocked(buildBootstrapAppProps).mock.calls[0][0];
    expect(
      renderToStaticMarkup(
        <routedArgs.SectionBoundary sectionId="section-1" />,
      ),
    ).toContain('data-testid="mock-section-container-boundary"');
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
  });
});
