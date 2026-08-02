import type { ColorPickerChoice } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  buildColorChoiceByColor,
  getSelectedTagFilterDisplay,
  getTagFilterOptionLabel,
  TAG_FILTER_ALL,
  TAG_FILTER_UNTAGGED,
} from "./ProjectOverview.utils";

const COLOR_CHOICES: ColorPickerChoice[] = [
  { color: "#0ea5e9", description: "Sky" },
  { color: "#f97316", description: "" },
];

describe("ProjectOverview tag filter helpers", () => {
  it("returns the special display state for the all filter", () => {
    const display = getSelectedTagFilterDisplay(
      TAG_FILTER_ALL,
      buildColorChoiceByColor(COLOR_CHOICES),
    );

    expect(display).toEqual({
      dotColor: "transparent",
      dotRingClassName: "ring-setta-300/60 dark:ring-setta-700/60",
      label: "All",
    });
  });

  it("returns the special display state for the untagged filter", () => {
    const display = getSelectedTagFilterDisplay(
      TAG_FILTER_UNTAGGED,
      buildColorChoiceByColor(COLOR_CHOICES),
    );

    expect(display).toEqual({
      dotColor: "rgba(148, 163, 184, 0.7)",
      dotRingClassName: "ring-black/10 dark:ring-white/10",
      label: "Untagged",
    });
  });

  it("prefers the color-choice description when a tag matches a configured color", () => {
    const display = getSelectedTagFilterDisplay(
      "#0ea5e9",
      buildColorChoiceByColor(COLOR_CHOICES),
    );

    expect(display).toEqual({
      dotColor: "#0ea5e9",
      dotRingClassName: "ring-black/10 dark:ring-white/10",
      label: "Sky",
    });
  });

  it("falls back to the raw color when a configured choice has no description", () => {
    expect(getTagFilterOptionLabel(COLOR_CHOICES[1])).toBe("#f97316");
  });

  it("falls back to the raw filter value when the color is not configured", () => {
    const display = getSelectedTagFilterDisplay(
      "#22c55e",
      buildColorChoiceByColor(COLOR_CHOICES),
    );

    expect(display).toEqual({
      dotColor: "#22c55e",
      dotRingClassName: "ring-black/10 dark:ring-white/10",
      label: "#22c55e",
    });
  });
});
