import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ChatWindowPlacementEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import { SectionWindowSurfaceBody } from "./SectionWindowSurfaceBody";

vi.mock("./SectionContainerArea", () => ({
  SectionContainerArea: ({
    sectionId,
    bgColor,
    chatHost,
    renderDictArea,
  }: {
    sectionId: string;
    bgColor: string;
    chatHost?: string;
    renderDictArea?: (props: {
      sectionId: string;
      bgColor: string;
    }) => ReactNode;
  }) => (
    <div
      data-testid="mock-section-container-area"
      data-chat-host={chatHost}
      data-section-id={sectionId}
    >
      {renderDictArea?.({ sectionId, bgColor })}
    </div>
  ),
}));

describe("SectionWindowSurfaceBody", () => {
  it("renders the caller-owned dict-area seam above SectionContainerArea", () => {
    const markup = renderToStaticMarkup(
      <SectionWindowSurfaceBody
        sectionId="section-1"
        sectionTypeName={SectionTypeEnum.Dict}
        bgColor="bg-setta-50"
        isMinimized={false}
        chatHost={ChatWindowPlacementEnum.floating}
        renderDictArea={({ sectionId, bgColor }) => (
          <div
            data-testid="mock-window-surface-dict-boundary"
            data-section-id={sectionId}
            data-bg-color={bgColor}
          />
        )}
      />,
    );

    expect(markup).toContain('data-testid="mock-section-container-area"');
    expect(markup).toContain('data-chat-host="floating"');
    expect(markup).toContain(
      'data-testid="mock-window-surface-dict-boundary"',
    );
    expect(markup).toContain('data-section-id="section-1"');
    expect(markup).toContain('data-bg-color="bg-setta-50"');
  });
});
