import { describe, expect, it } from "vitest";
import { getWindowControlQuickInfoText } from "./windowControlQuickInfo";

describe("getWindowControlQuickInfoText", () => {
  it("returns generic quick info for chrome controls without window titles", () => {
    expect(
      getWindowControlQuickInfoText({ action: "open_section_in_window" }),
    ).toBe("Open section in floating window");
    expect(
      getWindowControlQuickInfoText({ action: "create_chat_window" }),
    ).toBe("Create chat window");
    expect(getWindowControlQuickInfoText({ action: "show_chat_windows" })).toBe(
      "Show chat windows",
    );
    expect(
      getWindowControlQuickInfoText({ action: "show_section_in_canvas" }),
    ).toBe("Show section in canvas");
  });

  it("returns explicit quick info for window actions with titles", () => {
    expect(
      getWindowControlQuickInfoText({
        action: "show_in_canvas",
        title: "Renamed Research Chat",
      }),
    ).toBe("Show Renamed Research Chat in canvas");
    expect(
      getWindowControlQuickInfoText({
        action: "undock_window",
        title: "Renamed Research Chat",
      }),
    ).toBe("Undock Renamed Research Chat");
    expect(
      getWindowControlQuickInfoText({
        action: "minimize_window",
        title: "Renamed Research Chat",
      }),
    ).toBe("Minimize Renamed Research Chat");
  });

  it("falls back to generic quick info when an optional title is absent", () => {
    expect(getWindowControlQuickInfoText({ action: "focus_window" })).toBe(
      "Focus window",
    );
    expect(getWindowControlQuickInfoText({ action: "show_in_canvas" })).toBe(
      "Show in canvas",
    );
    expect(getWindowControlQuickInfoText({ action: "hide_window" })).toBe(
      "Hide window",
    );
  });
});
