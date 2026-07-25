import { describe, expect, test } from "vitest";

import { buildApprovalAnswers } from "./DirectorArtifactsRail";

describe("Director command-center approval answers", () => {
  test("builds structured answers from public question definitions", () => {
    const result = buildApprovalAnswers(
      [
        {
          allowsOther: false,
          header: "Scope",
          id: "scope",
          options: ["staging", "production"],
          question: "Which scope should be used?",
          secret: true,
        },
      ],
      { scope: " production " },
    );

    expect(result).toEqual({
      answers: [{ answers: ["production"], questionId: "scope" }],
      status: "valid",
    });
  });

  test("rejects missing and unauthorized structured answers before dispatch", () => {
    const result = buildApprovalAnswers(
      [
        {
          allowsOther: false,
          header: "Scope",
          id: "scope",
          options: ["staging"],
          question: "Which scope should be used?",
          secret: false,
        },
        {
          allowsOther: true,
          header: "Notes",
          id: "notes",
          options: [],
          question: "What should be sent?",
          secret: false,
        },
      ],
      { notes: "", scope: "production" },
    );

    expect(result).toEqual({
      errors: {
        notes: "Answer this question.",
        scope: "Choose one of the listed answers.",
      },
      firstInvalidQuestionId: "scope",
      status: "invalid",
    });
  });
});
