import { describe, expect, it } from "vitest";
import {
  createWorkspaceShellViewState,
  getWorkspaceShellPaneMaximumWidth,
  getWorkspaceShellPaneTrueWidth,
  normalizeWorkspaceShellViewState,
  resizeWorkspaceShellPane,
  selectWorkspaceShellTab,
  toggleWorkspaceShellPane,
  toggleWorkspaceShellPaneFullWidth,
} from "./workspaceShellLayout";

function createState() {
  return createWorkspaceShellViewState({
    leadingTabId: "outline",
    trailingTabId: "inspector",
  });
}

describe("workspace shell layout", () => {
  it("creates the frozen initial pane state as serializable view state", () => {
    expect(createState()).toEqual({
      leading: {
        selectedTabId: "outline",
        visible: true,
        width: 335,
        rememberedNonFullWidth: 335,
      },
      trailing: {
        selectedTabId: "inspector",
        visible: false,
        width: 500,
        rememberedNonFullWidth: 500,
      },
      outline: {
        collapsedGroupIds: [],
        focusedSectionId: null,
      },
    });
    expect(getWorkspaceShellPaneTrueWidth(createState().trailing)).toBe(40);
  });

  it("shrinks only the existing pane by the overflow when opening its opposite", () => {
    const state = createState();
    state.leading.width = 1050;
    state.leading.rememberedNonFullWidth = 1050;

    const next = toggleWorkspaceShellPane(state, "trailing", 1400);

    expect(next.trailing).toMatchObject({ visible: true, width: 500 });
    expect(next.leading).toMatchObject({ visible: true, width: 900 });
    expect(state.leading.width).toBe(1050);
  });

  it("closes a full-width pane before opening the opposite pane", () => {
    const state = createState();
    state.leading.width = getWorkspaceShellPaneMaximumWidth(1200);

    const next = toggleWorkspaceShellPane(state, "trailing", 1200);

    expect(next.leading.visible).toBe(false);
    expect(getWorkspaceShellPaneTrueWidth(next.leading)).toBe(40);
    expect(next.trailing).toMatchObject({ visible: true, width: 500 });
  });

  it("enters full width, closes the opposite pane, and restores serialized memory", () => {
    const state = createState();
    state.leading.width = 460;
    state.leading.rememberedNonFullWidth = 460;
    state.trailing.visible = true;

    const full = toggleWorkspaceShellPaneFullWidth(state, "leading", 1300);
    expect(full.leading.width).toBe(1260);
    expect(full.leading.rememberedNonFullWidth).toBe(460);
    expect(full.trailing.visible).toBe(false);

    const restored = toggleWorkspaceShellPaneFullWidth(full, "leading", 1300);
    expect(restored.leading).toMatchObject({ visible: true, width: 460 });
    expect(restored.trailing.visible).toBe(false);
  });

  it("clamps a requested resize and negotiates with the opposite pane", () => {
    const state = createState();
    state.trailing.visible = true;

    const next = resizeWorkspaceShellPane(state, "leading", 700, 1000);

    expect(next.leading.width).toBe(575);
    expect(next.trailing.width).toBe(425);
  });

  it("replays both stale render widths during viewport normalization", () => {
    const state = createState();
    state.trailing.visible = true;

    const next = normalizeWorkspaceShellViewState(state, 1492, 800);

    expect(next.leading).toMatchObject({ visible: true, width: 300 });
    expect(next.trailing).toMatchObject({ visible: true, width: 500 });
  });

  it("keeps full-width intent pinned across viewport changes", () => {
    const state = createState();
    state.leading.visible = false;
    state.trailing.visible = true;
    state.trailing.width = 760;

    const next = normalizeWorkspaceShellViewState(state, 800, 1492);

    expect(next.trailing.width).toBe(1452);
    expect(next.trailing.visible).toBe(true);
    expect(next.leading.visible).toBe(false);
  });

  it("closes the opposite pane when their minimum widths cannot fit", () => {
    const state = createState();

    const next = toggleWorkspaceShellPane(state, "trailing", 640);

    expect(next.leading.visible).toBe(false);
    expect(next.trailing).toMatchObject({ visible: true, width: 500 });
  });

  it("selects and opens a different tab but toggles an already selected tab", () => {
    const state = createState();
    state.outline = { collapsedGroupIds: ["group-a"], focusedSectionId: "leaf-a" };
    const selected = selectWorkspaceShellTab(state, "trailing", "hostDetails", 1000);
    expect(selected.trailing).toMatchObject({
      selectedTabId: "hostDetails",
      visible: true,
    });
    expect(selected.outline).toEqual({
      collapsedGroupIds: ["group-a"],
      focusedSectionId: "leaf-a",
    });
    expect(selected.outline).not.toBe(state.outline);

    const closed = selectWorkspaceShellTab(selected, "trailing", "hostDetails", 1000);
    expect(closed.trailing.visible).toBe(false);
  });

  it("rejects malformed tab ids and non-finite layout requests specifically", () => {
    expect(() =>
      createWorkspaceShellViewState({ leadingTabId: "bad id", trailingTabId: "inspector" }),
    ).toThrow(/leading tab id/);
    expect(() => resizeWorkspaceShellPane(createState(), "leading", Number.NaN, 1000)).toThrow(
      /width must be finite/,
    );
  });

  it("defaults the built-in leading tab to Outline", () => {
    expect(
      createWorkspaceShellViewState({ trailingTabId: "inspector" }).leading.selectedTabId,
    ).toBe("outline");
  });
});
