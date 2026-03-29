import { buildStandalonePageSectionProjectChatSurfaceId } from "components/ChatWindowing/projectChatSurfaceIds";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import { StandaloneProjectSurfaceRouteSectionBoundary } from "./StandaloneProjectSurfaceRouteSectionBoundary";

const mockStandaloneSectionSurfaceBoundary = vi.fn(
  ({
    sectionId,
    sectionType,
    projectChatSurfaceId,
    renderDictArea,
    renderCoreBody,
    renderNestedSections,
  }: {
    sectionId: string;
    sectionType: string;
    projectChatSurfaceId: string;
    renderDictArea?: unknown;
    renderCoreBody?: unknown;
    renderNestedSections?: unknown;
  }) => (
    <div
      data-testid="mock-standalone-section-surface-boundary"
      data-section-id={sectionId}
      data-section-type={sectionType}
      data-project-chat-surface-id={projectChatSurfaceId}
      data-has-render-dict-area={String(Boolean(renderDictArea))}
      data-has-render-core-body={String(Boolean(renderCoreBody))}
      data-has-render-nested-sections={String(Boolean(renderNestedSections))}
    />
  ),
);

vi.mock(
  "components/Section/Container/StandaloneSectionSurfaceBoundary",
  () => ({
    StandaloneSectionSurfaceBoundary: (props: {
      sectionId: string;
      sectionType: string;
      projectChatSurfaceId: string;
      renderDictArea?: unknown;
      renderCoreBody?: unknown;
      renderNestedSections?: unknown;
    }) => mockStandaloneSectionSurfaceBoundary(props),
  }),
);

describe("StandaloneProjectSurfaceRouteSectionBoundary", () => {
  it("builds the standalone section chat surface id and forwards the lifted render seams", () => {
    mockStandaloneSectionSurfaceBoundary.mockClear();
    const renderDictArea = () => null;
    const renderCoreBody = () => null;
    const renderNestedSections = () => null;
    const markup = renderToStaticMarkup(
      <StandaloneProjectSurfaceRouteSectionBoundary
        projectConfigId="project-config-1"
        sectionId="section-1"
        sectionType={SectionTypeEnum.Group}
        onProjectChatBlockedErrorCodeChange={() => undefined}
        renderDictArea={renderDictArea}
        renderCoreBody={renderCoreBody}
        renderNestedSections={renderNestedSections}
      />,
    );

    expect(markup).toContain('data-testid="standalone-section-surface"');
    expect(markup).toContain(
      'data-testid="mock-standalone-section-surface-boundary"',
    );
    expect(markup).toContain('data-section-id="section-1"');
    expect(markup).toContain(`data-section-type="${SectionTypeEnum.Group}"`);
    expect(markup).toContain(
      `data-project-chat-surface-id="${buildStandalonePageSectionProjectChatSurfaceId(
        "project-config-1",
        "section-1",
      )}"`,
    );
    expect(markup).toContain('data-has-render-dict-area="true"');
    expect(markup).toContain('data-has-render-core-body="true"');
    expect(markup).toContain('data-has-render-nested-sections="true"');
    expect(
      mockStandaloneSectionSurfaceBoundary.mock.calls[0]?.[0]?.renderDictArea,
    ).toBe(renderDictArea);
    expect(
      mockStandaloneSectionSurfaceBoundary.mock.calls[0]?.[0]?.renderCoreBody,
    ).toBe(renderCoreBody);
    expect(
      mockStandaloneSectionSurfaceBoundary.mock.calls[0]?.[0]
        ?.renderNestedSections,
    ).toBe(renderNestedSections);
  });
});
