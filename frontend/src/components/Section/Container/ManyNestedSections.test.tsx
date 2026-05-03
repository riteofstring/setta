import { renderToStaticMarkup } from "react-dom/server";
import {
  SectionTypeEnum,
  type BaseSectionImplUnion,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MaybeManyNestedSections } from "./ManyNestedSections";

type MockProjectState = {
  readonly embeddedTerminal: {
    readonly attachedTerminalId: string;
    readonly isTerminalMinimized: boolean;
  } | null;
  readonly impls: Record<string, BaseSectionImplUnion>;
};

let mockProjectState: MockProjectState = {
  embeddedTerminal: null,
  impls: {},
};

vi.mock("state/definitions", () => ({
  useProjectState: (selector: (state: MockProjectState) => unknown) =>
    selector(mockProjectState),
}));

vi.mock("state/actions/sectionInfos", () => ({
  getCurrEffectiveSectionImpl: (state: MockProjectState, sectionId: string) => {
    const impl = state.impls[sectionId];
    if (!impl) {
      throw new Error(`Missing mock section ${sectionId}.`);
    }
    return impl;
  },
  getCurrEffectiveSectionImplIfPresent: (
    state: MockProjectState,
    sectionId: string,
  ) => state.impls[sectionId] ?? null,
  getEmbeddedAttachedTerminalForCodeSection: () =>
    mockProjectState.embeddedTerminal,
}));

vi.mock("state/actions/sections/sectionPositions", () => ({
  goToSection: vi.fn(),
}));

vi.mock("./SectionContainer", () => ({
  SectionContainer: ({
    sectionId,
    isTopLevel,
  }: {
    sectionId: string;
    isTopLevel: boolean;
  }) => (
    <div
      data-testid="mock-section-container"
      data-section-id={sectionId}
      data-is-top-level={String(isTopLevel)}
    />
  ),
}));

describe("MaybeManyNestedSections", () => {
  beforeEach(() => {
    mockProjectState = {
      embeddedTerminal: null,
      impls: {
        "child-a": textSection(),
        "child-b": textSection(),
        parent: groupSection(["child-a", "missing-child", "child-b"]),
      },
    };
  });

  it("renders durable project children without a sortable transform owner", () => {
    const markup = renderToStaticMarkup(
      <MaybeManyNestedSections sectionId="parent" isGroup />,
    );

    expect(markup).toContain('data-nested-section-id="child-a"');
    expect(markup).toContain('data-nested-section-id="child-b"');
    expect(markup).not.toContain("missing-child");
    expect(markup).not.toContain("data-sortable-section-id");
    expect(markup).toContain('data-is-top-level="false"');
  });

  it("omits minimized embedded terminals from the static child list", () => {
    mockProjectState = {
      embeddedTerminal: {
        attachedTerminalId: "terminal",
        isTerminalMinimized: true,
      },
      impls: {
        "child-a": textSection(),
        "child-b": textSection(),
        parent: groupSection(["child-a", "terminal", "child-b"]),
        terminal: textSection(),
      },
    };

    const markup = renderToStaticMarkup(
      <MaybeManyNestedSections sectionId="parent" isGroup />,
    );

    expect(markup).toContain('data-nested-section-id="child-a"');
    expect(markup).toContain('data-nested-section-id="child-b"');
    expect(markup).not.toContain('data-nested-section-id="terminal"');
  });
});

function groupSection(children: readonly string[]): BaseSectionImplUnion {
  return {
    children: [...children],
    isHorizontalOrientation: false,
    type: SectionTypeEnum.Group,
  } as BaseSectionImplUnion;
}

function textSection(): BaseSectionImplUnion {
  return {
    type: SectionTypeEnum.TextBlock,
  } as BaseSectionImplUnion;
}
