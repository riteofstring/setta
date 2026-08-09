import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SectionWindowPlaceholder } from "./SectionWindowPlaceholder";

let mockCanEditLayout = true;

vi.mock("state/actions/projectChatWindowing", () => ({
  bootProjectChatWindowToCanvasSection: vi.fn(),
  focusProjectChatWindow: vi.fn(),
  reopenProjectChatWindow: vi.fn(),
}));

vi.mock("state/definitions", () => ({
  useProjectState: (
    selector: (state: {
      sections: Record<string, { name: string; displayName?: string }>;
    }) => unknown,
  ) =>
    selector({
      sections: {
        "section-1": {
          name: "Research Notes",
        },
      },
    }),
}));

vi.mock("state/hooks/share", () => ({
  useShareCapabilities: () => ({
    canEditLayout: mockCanEditLayout,
  }),
}));

vi.mock("components/Utils/FloatingBox", () => ({
  getFloatingBoxHandlers: ({
    content,
    title,
  }: {
    content?: string;
    title?: string;
  }) => ({
    "data-tooltip-content": content ?? title ?? "",
  }),
}));

describe("SectionWindowPlaceholder", () => {
  beforeEach(() => {
    mockCanEditLayout = true;
  });

  it("shows both focus and restore actions when layout edits are allowed", () => {
    const markup = renderToStaticMarkup(
      <SectionWindowPlaceholder instanceId="window-1" sectionId="section-1" />,
    );

    expect(markup).toContain('data-testid="section-window-placeholder-focus"');
    expect(markup).toContain(
      'data-testid="section-window-placeholder-restore"',
    );
    expect(markup).toContain(
      "Focus the external window or return this section to the canvas.",
    );
    expect(markup).toContain(
      'data-tooltip-content="Focus Research Notes window"',
    );
    expect(markup).toContain(
      'data-tooltip-content="Show Research Notes in canvas"',
    );
  });

  it("keeps only the focus action when layout edits are disallowed", () => {
    mockCanEditLayout = false;

    const markup = renderToStaticMarkup(
      <SectionWindowPlaceholder instanceId="window-1" sectionId="section-1" />,
    );

    expect(markup).toContain('data-testid="section-window-placeholder-focus"');
    expect(markup).not.toContain(
      'data-testid="section-window-placeholder-restore"',
    );
    expect(markup).toContain("Focus the external window from here.");
    expect(markup).toContain(
      'data-tooltip-content="Focus Research Notes window"',
    );
  });
});
