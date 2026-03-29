import { describe, expect, it } from "vitest";
import {
  PARAM_CONTAINER_COLUMN_WIDTH,
  PARAM_CONTAINER_COMPACT_ROW_HORIZONTAL_PADDING_PX,
  PARAM_CONTAINER_COMPACT_ROW_RADIUS_PX,
  buildParamContainerLayout,
  buildParamContainerViewModel,
  resolveParamContainerDisplayName,
} from "./paramContainerView";

describe("resolveParamContainerDisplayName", () => {
  it("falls back to the core param name when display names are hidden", () => {
    expect(
      resolveParamContainerDisplayName({
        showParamDisplayNames: false,
        paramName: "coreName",
        paramDisplayName: "Shown Name",
        preferCoreName: false,
      }),
    ).toBe("coreName");
  });

  it("keeps the core param name when the current impl edits the core name", () => {
    expect(
      resolveParamContainerDisplayName({
        showParamDisplayNames: true,
        paramName: "coreName",
        paramDisplayName: "Shown Name",
        preferCoreName: true,
      }),
    ).toBe("coreName");
  });

  it("uses the trimmed display name when it exists", () => {
    expect(
      resolveParamContainerDisplayName({
        showParamDisplayNames: true,
        paramName: "coreName",
        paramDisplayName: "Shown Name",
        preferCoreName: false,
      }),
    ).toBe("Shown Name");
  });

  it("falls back to the core param name when the display name is blank", () => {
    expect(
      resolveParamContainerDisplayName({
        showParamDisplayNames: true,
        paramName: "coreName",
        paramDisplayName: "   ",
        preferCoreName: false,
      }),
    ).toBe("coreName");
  });
});

describe("buildParamContainerViewModel", () => {
  it("keeps leaf rows on the explicit leaf layout when there are no child rows", () => {
    const viewModel = buildParamContainerViewModel({
      maybeErrorMessage: null,
      paramName: "Param",
      paramDescription: "Description",
      isNestedParam: false,
      hasChildRows: false,
      hasSectionStyleTheme: false,
    });

    expect(viewModel.variant).toBe("leaf");
    expect(viewModel.hasError).toBe(false);
    expect(viewModel.errorMessage).toBe("");
    expect(viewModel.paramHoverClassName).toBe(
      "hover:bg-setta-100/50 hover:dark:bg-setta-800/70",
    );
    expect(viewModel.tooltipContentArray).toEqual([
      { title: "Param", content: "Description" },
    ]);
  });

  it("prepends the error tooltip page and uses the section theme hover color", () => {
    const viewModel = buildParamContainerViewModel({
      maybeErrorMessage: "Type mismatch",
      paramName: "Param",
      paramDescription: "Description",
      isNestedParam: false,
      hasChildRows: true,
      hasSectionStyleTheme: true,
    });

    expect(viewModel.variant).toBe("topLevelNested");
    expect(viewModel.hasError).toBe(true);
    expect(viewModel.errorMessage).toBe("Type mismatch");
    expect(viewModel.paramHoverClassName).toBe(
      "hover:bg-[color:var(--setta-section-style-border)]",
    );
    expect(viewModel.tooltipContentArray[0]).toMatchObject({
      content: "Type mismatch",
      wrapperClassName: expect.stringContaining("!border-red-300"),
      contentClassName: "!text-red-700 dark:!text-red-300 font-mono",
    });
    expect(viewModel.tooltipContentArray[1]).toEqual({
      title: "Param",
      content: "Description",
    });
  });
});

describe("buildParamContainerLayout", () => {
  it("builds the explicit leaf grid layout", () => {
    const layout = buildParamContainerLayout({
      variant: "leaf",
      paramHoverClassName: "hover:bg-test",
      bg: "bg-test",
      border: "border-test",
      isTopLevelWithPad: false,
      dndClassName: "dragging",
      dndStyle: { zIndex: 10 },
    });

    expect(layout.className).toContain("section-key-value");
    expect(layout.className).toContain("rounded-sm");
    expect(layout.className).toContain("px-[2px]");
    expect(layout.className).toContain("hover:bg-test");
    expect(layout.className).toContain("dragging");
    expect(layout.style).toMatchObject({
      gridTemplateColumns: `minmax(min-content, ${PARAM_CONTAINER_COLUMN_WIDTH}) 0.75rem minmax(0, 1fr)`,
      gridTemplateAreas: '"key center-gutter value"',
      zIndex: 10,
    });
    expect(PARAM_CONTAINER_COMPACT_ROW_RADIUS_PX).toBe(2);
    expect(PARAM_CONTAINER_COMPACT_ROW_HORIZONTAL_PADDING_PX).toBe(2);
  });

  it("adds the top-level padding override only for nested param rows", () => {
    const layout = buildParamContainerLayout({
      variant: "nested",
      paramHoverClassName: "hover:bg-test",
      bg: "bg-test",
      border: "border-test",
      isTopLevelWithPad: true,
      dndStyle: undefined,
    });

    expect(layout.className).toContain("[&>p]:!pb-0");
    expect(layout.className).toContain("[&>p]:section-key-value");
    expect(layout.style.gridTemplateColumns).toBe(
      `[c1] 0.75rem [c2] minmax(min-content, ${PARAM_CONTAINER_COLUMN_WIDTH}) [c3] 0.75rem [c4] 1fr [c5]`,
    );
  });
});
