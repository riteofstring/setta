import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SectionTypeEnum } from "utils/generatedTypes";
import { StandaloneSectionSurfaceBoundary } from "./StandaloneSectionSurfaceBoundary";
import type { SectionContainerAreaDictProps } from "./sectionContainerAreaView";

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

vi.mock("./SectionContainerNestedSectionsBoundary", () => ({
  SectionContainerNestedSectionsBoundary: ({
    sectionId,
    isGroup,
    isJoinedCodeTerminalGroup,
  }: {
    sectionId: string;
    isGroup: boolean;
    isJoinedCodeTerminalGroup: boolean;
  }) => (
    <div
      data-testid="mock-section-container-nested-sections-boundary"
      data-section-id={sectionId}
      data-is-group={String(isGroup)}
      data-is-joined-code-terminal-group={String(isJoinedCodeTerminalGroup)}
    />
  ),
}));

describe("StandaloneSectionSurfaceBoundary", () => {
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

    expect(markup).toContain('data-testid="mock-section-window-surface"');
    expect(markup).toContain('data-section-id="section-1"');
    expect(markup).toContain('data-chat-host="standalone_page"');
    expect(markup).toContain('data-rounded-class-name="rounded-none"');
    expect(markup).toContain('data-project-chat-surface-id="surface-1"');
    expect(markup).toContain('data-has-error-callback="true"');
    expect(markup).toContain('data-has-body-override="true"');
    expect(markup).toContain('data-has-render-dict-area="true"');
    expect(markup).toContain(
      'class="min-h-0 flex-1 overflow-auto"',
    );
    expect(markup).toContain(
      'data-testid="mock-section-container-nested-sections-boundary"',
    );
    expect(markup).toContain('data-is-group="true"');
    expect(markup).toContain(
      'data-is-joined-code-terminal-group="false"',
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
    expect(markup).not.toContain(
      'mock-section-container-nested-sections-boundary',
    );
  });
});
