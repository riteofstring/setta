import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import NodeRenderer from "./NodeRenderer";

vi.mock("state/definitions", () => ({
  useNodeInternals: () => ["section-a", "section-b"],
}));

vi.mock("../store/utils", () => ({
  computeReadyToBeVisible: () => true,
}));

vi.mock("forks/xyflow/core/store", () => ({
  useReactFlow: (
    selector: (state: { panActivationKeyPressed: boolean }) => unknown,
  ) => selector({ panActivationKeyPressed: false }),
}));

vi.mock("forks/xyflow/core/components/wrapNode", () => ({
  NodeWrapper: ({
    id,
    isDraggable,
    visibility,
    SectionBoundary,
  }: {
    id: string;
    isDraggable: boolean;
    visibility: string;
    SectionBoundary: ({ sectionId }: { sectionId: string }) => ReactNode;
  }) => (
    <div
      data-testid="mock-node-wrapper"
      data-section-id={id}
      data-is-draggable={String(isDraggable)}
      data-visibility={visibility}
    >
      <SectionBoundary sectionId={id} />
    </div>
  ),
}));

describe("NodeRenderer", () => {
  it("keeps the generic node wrapper shell caller-owned via the lifted section boundary prop", () => {
    const TestSectionBoundary = ({ sectionId }: { sectionId: string }) => (
      <div
        data-testid="mock-section-container-boundary"
        data-section-id={sectionId}
      />
    );
    const markup = renderToStaticMarkup(
      <NodeRenderer SectionBoundary={TestSectionBoundary} />,
    );

    expect(markup).toContain('data-testid="mock-node-wrapper"');
    expect(markup).toContain('data-section-id="section-a"');
    expect(markup).toContain('data-section-id="section-b"');
    expect(markup).toContain('data-is-draggable="true"');
    expect(markup).toContain('data-visibility="visible"');
    expect(markup).toContain('data-testid="mock-section-container-boundary"');
  });
});
