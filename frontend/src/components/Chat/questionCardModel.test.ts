import { describe, expect, it } from "vitest";

import {
  buildAnswers,
  buildQuestionCompletion,
  buildQuestionKey,
  buildQuestionOptions,
  buildQuestionSummaryItems,
  buildSelectionsFromAnswers,
  canSubmitQuestions,
  hasMissingOtherValues,
  resolveQuestionCardHelperText,
  toggleQuestionSelection,
} from "./questionCardModel";

const questions = [
  {
    header: "Color",
    question: "Pick a color",
    multiSelect: false,
    options: [{ label: "Blue" }, { label: "Other" }],
  },
  {
    header: "Tags",
    question: "Pick tags",
    multiSelect: true,
    options: [{ label: "Fast" }, { label: "Reliable" }, { label: "Other" }],
  },
];

describe("questionCardModel", () => {
  it("maps custom resolved answers back into selections and other values", () => {
    const otherOptionValue =
      buildQuestionOptions(questions[0]).find((option) => option.isOther)
        ?.value ?? "__missing__";

    const state = buildSelectionsFromAnswers(questions, {
      "Pick a color": "Magenta",
      "Pick tags": "Fast, Custom",
    });

    expect(state.selections).toEqual({
      [buildQuestionKey(0)]: [otherOptionValue],
      [buildQuestionKey(1)]: ["Fast", otherOptionValue],
    });
    expect(state.otherValues).toEqual({
      [buildQuestionKey(0)]: "Magenta",
      [buildQuestionKey(1)]: "Custom",
    });
  });

  it("requires a filled custom value before multi-select answers can submit", () => {
    const otherOptionValue =
      buildQuestionOptions(questions[1]).find((option) => option.isOther)
        ?.value ?? "__missing__";
    const selections = {
      [buildQuestionKey(1)]: ["Fast", otherOptionValue],
    };

    expect(buildAnswers(questions, selections, {})).toEqual({});
    expect(canSubmitQuestions(questions, selections, {})).toBe(false);
    expect(hasMissingOtherValues(questions, selections, {})).toBe(true);
  });

  it("builds completion and summary state from draft and resolved answers", () => {
    const otherOptionValue =
      buildQuestionOptions(questions[1]).find((option) => option.isOther)
        ?.value ?? "__missing__";
    const selections = {
      [buildQuestionKey(0)]: ["Blue"],
      [buildQuestionKey(1)]: ["Reliable", otherOptionValue],
    };
    const otherValues = {
      [buildQuestionKey(1)]: "Portable",
    };

    expect(buildQuestionCompletion(questions, selections, otherValues)).toEqual(
      {
        [buildQuestionKey(0)]: true,
        [buildQuestionKey(1)]: true,
      },
    );
    expect(
      buildQuestionSummaryItems(questions, selections, otherValues, {
        "Pick a color": "Blue",
      }),
    ).toEqual([
      {
        questionKey: buildQuestionKey(0),
        label: "Color",
        questionText: "Pick a color",
        summaryValue: "Blue",
        isComplete: true,
        needsOther: false,
      },
      {
        questionKey: buildQuestionKey(1),
        label: "Tags",
        questionText: "Pick tags",
        summaryValue: "Reliable, Portable",
        isComplete: true,
        needsOther: false,
      },
    ]);
  });

  it("toggles multi-select values without disturbing single-select behavior", () => {
    expect(toggleQuestionSelection(false, ["Blue"], "Green")).toEqual([
      "Green",
    ]);
    expect(toggleQuestionSelection(true, ["Fast"], "Reliable")).toEqual([
      "Fast",
      "Reliable",
    ]);
    expect(toggleQuestionSelection(true, ["Fast"], "Fast")).toEqual([]);
  });

  it("resolves helper text from summary and custom-value state", () => {
    expect(
      resolveQuestionCardHelperText({
        hasSummary: false,
        isSummaryTab: false,
        canSubmit: false,
        hasMissingOtherValue: false,
      }),
    ).toBe("Select an option for each question.");
    expect(
      resolveQuestionCardHelperText({
        hasSummary: true,
        isSummaryTab: true,
        canSubmit: true,
        hasMissingOtherValue: false,
      }),
    ).toBe("Review your answers before submitting.");
    expect(
      resolveQuestionCardHelperText({
        hasSummary: true,
        isSummaryTab: false,
        canSubmit: false,
        hasMissingOtherValue: true,
      }),
    ).toBe("Fill in the custom response for each custom selection.");
  });
});
