import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionTypeEnum } from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SectionContainerAreaDictProps } from "./sectionContainerAreaView";
import type { SectionContainerCoreBodyProps } from "./sectionContainerCoreBodyView";
import {
  renderDefaultSectionContainerCoreBody,
  renderDefaultSectionContainerNestedSections,
} from "./sectionContainerDefaultRenderers";
import type { SectionContainerNestedSectionsProps } from "./sectionContainerNestedSectionsView";
import { StandaloneSectionSurfaceBoundary } from "./StandaloneSectionSurfaceBoundary";

vi.mock("./SectionWindowSurface", () => ({
  SectionWindowSurface: ({
    sectionId,
    chatHost,
    roundedClassName,
    projectChatSurfaceId,
    onProjectChatBlockedErrorCodeChange,
    bodyOverride,
    renderDictArea,
  }: {
    sectionId: string;
    chatHost: string;
    roundedClassName: string;
    projectChatSurfaceId?: string;
    onProjectChatBlockedErrorCodeChange?:
      | ((errorCode: string | null) => void)
      | undefined;
    bodyOverride?: ReactNode;
    renderDictArea?: unknown;
  }) => (
    <div
      data-testid="mock-section-window-surface"
      data-section-id={sectionId}
      data-chat-host={chatHost}
      data-rounded-class-name={roundedClassName}
      data-project-chat-surface-id={projectChatSurfaceId ?? ""}
      data-has-error-callback={String(
        Boolean(onProjectChatBlockedErrorCodeChange),
      )}
      data-has-body-override={String(bodyOverride !== undefined)}
      data-has-render-dict-area={String(Boolean(renderDictArea))}
    >
      {bodyOverride}
    </div>
  ),
}));

const mockSectionContainerNestedSections = vi.fn(
  ({
    sectionId,
    isGroup,
    isJoinedCodeTerminalGroup,
    renderCoreBody,
    renderNestedSections,
  }: {
    sectionId: string;
    isGroup: boolean;
    isJoinedCodeTerminalGroup: boolean;
    renderCoreBody: (props: SectionContainerCoreBodyProps) => ReactNode;
    renderNestedSections: (
      props: SectionContainerNestedSectionsProps,
    ) => ReactNode;
  }) => (
    <div
      data-testid="mock-section-container-nested-sections"
      data-section-id={sectionId}
      data-is-group={String(isGroup)}
      data-is-joined-code-terminal-group={String(isJoinedCodeTerminalGroup)}
      data-has-render-core-body={String(Boolean(renderCoreBody))}
      data-has-render-nested-sections={String(Boolean(renderNestedSections))}
    />
  ),
);

vi.mock("./SectionContainerNestedSections", () => ({
  SectionContainerNestedSections: (props: {
    sectionId: string;
    isGroup: boolean;
    isJoinedCodeTerminalGroup: boolean;
    renderCoreBody: (props: SectionContainerCoreBodyProps) => ReactNode;
    renderNestedSections: (
      props: SectionContainerNestedSectionsProps,
    ) => ReactNode;
  }) => mockSectionContainerNestedSections(props),
}));

vi.mock("./sectionContainerDefaultRenderers", () => ({
  renderDefaultSectionContainerCoreBody: () => null,
  renderDefaultSectionContainerNestedSections: () => null,
}));

describe("StandaloneSectionSurfaceBoundary", () => {
  beforeEach(() => {
    mockSectionContainerNestedSections.mockClear();
  });

  it("injects the standalone section surface defaults and nested-sections boundary for group sections", () => {
    const renderDictArea = (_props: SectionContainerAreaDictProps) => null;
    const markup = renderToStaticMarkup(
      <StandaloneSectionSurfaceBoundary
        sectionId="section-1"
        sectionType={SectionTypeEnum.Group}
        projectChatSurfaceId="surface-1"
        onProjectChatBlockedErrorCodeChange={() => undefined}
        renderDictArea={renderDictArea}
      />,
    );
    const forwardedProps =
      mockSectionContainerNestedSections.mock.calls[0]?.[0];

    expect(markup).toContain('data-testid="mock-section-window-surface"');
    expect(markup).toContain('data-section-id="section-1"');
    expect(markup).toContain('data-chat-host="standalone_page"');
    expect(markup).toContain('data-rounded-class-name="rounded-none"');
    expect(markup).toContain('data-project-chat-surface-id="surface-1"');
    expect(markup).toContain('data-has-error-callback="true"');
    expect(markup).toContain('data-has-body-override="true"');
    expect(markup).toContain('data-has-render-dict-area="true"');
    expect(markup).toContain('class="min-h-0 flex-1 overflow-auto"');
    expect(markup).toContain(
      'data-testid="mock-section-container-nested-sections"',
    );
    expect(markup).toContain('data-is-group="true"');
    expect(markup).toContain('data-is-joined-code-terminal-group="false"');
    expect(markup).toContain('data-has-render-core-body="true"');
    expect(markup).toContain('data-has-render-nested-sections="true"');
    expect(forwardedProps?.renderCoreBody).toBe(
      renderDefaultSectionContainerCoreBody,
    );
    expect(forwardedProps?.renderNestedSections).toBe(
      renderDefaultSectionContainerNestedSections,
    );
  });

  it("keeps standalone non-group sections on the default section window body path", () => {
    const renderDictArea = (_props: SectionContainerAreaDictProps) => null;
    const markup = renderToStaticMarkup(
      <StandaloneSectionSurfaceBoundary
        sectionId="section-2"
        sectionType={SectionTypeEnum.TextBlock}
        projectChatSurfaceId="surface-2"
        renderDictArea={renderDictArea}
      />,
    );

    expect(markup).toContain('data-testid="mock-section-window-surface"');
    expect(markup).toContain('data-section-id="section-2"');
    expect(markup).toContain('data-has-body-override="false"');
    expect(markup).toContain('data-has-render-dict-area="true"');
    expect(markup).not.toContain("mock-section-container-nested-sections");
    expect(mockSectionContainerNestedSections).not.toHaveBeenCalled();
  });
});
