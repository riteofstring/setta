import { renderToStaticMarkup } from "react-dom/server";
import { SectionTypeEnum } from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SectionWindowToggleButton } from "./SectionWindowToggleButton";

let mockCanEditLayout = true;
let mockExternalizedWindowInstance: { instanceId: string } | null = null;

vi.mock("state/actions/projectChatWindowing", () => ({
  bootProjectChatWindowToCanvasSection: vi.fn(),
  getOpenExternalProjectChatWindowInstanceForSectionInState: () =>
    mockExternalizedWindowInstance,
  showSectionInProjectChatWindow: vi.fn(),
}));

vi.mock("state/definitions", () => ({
  useProjectState: (
    selector: (state: { projectChatWindowing: object }) => unknown,
  ) =>
    selector({
      projectChatWindowing: {},
    }),
}));

vi.mock("state/hooks/share", () => ({
  useShareCapabilities: () => ({
    canEditLayout: mockCanEditLayout,
  }),
}));

describe("SectionWindowToggleButton", () => {
  beforeEach(() => {
    mockCanEditLayout = true;
    mockExternalizedWindowInstance = null;
  });

  it("renders the floating-window toggle when layout edits are allowed", () => {
    const markup = renderToStaticMarkup(
      <SectionWindowToggleButton
        sectionId="section-1"
        sectionTypeName={SectionTypeEnum.Chat}
        isRoot={false}
        hasSectionStyleTheme={false}
      />,
    );

    expect(markup).toContain('data-testid="section-window-toggle"');
    expect(markup).toContain("Open section in floating window");
  });

  it("hides the toggle when layout edits are disallowed", () => {
    mockCanEditLayout = false;

    const markup = renderToStaticMarkup(
      <SectionWindowToggleButton
        sectionId="section-1"
        sectionTypeName={SectionTypeEnum.Chat}
        isRoot={false}
        hasSectionStyleTheme={false}
      />,
    );

    expect(markup).toBe("");
  });
});
