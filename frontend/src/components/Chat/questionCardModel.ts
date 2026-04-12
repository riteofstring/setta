import { AskUserQuestionPrompt } from "utils/claudeTools";

export const DEFAULT_TITLE = "Question";
const OTHER_OPTION_VALUE = "__other__";
const OTHER_OPTION_LABEL = "Type something else";
const OTHER_OPTION_LABELS = new Set(["other", "type something else"]);

export type QuestionKey = string;

export type QuestionSelections = Record<QuestionKey, string[]>;

export type QuestionOtherValues = Record<QuestionKey, string>;

export type RenderQuestionOption = {
  value: string;
  label: string;
  description?: string;
  isOther: boolean;
};

export type QuestionSummaryItem = {
  questionKey: QuestionKey;
  label: string;
  questionText: string;
  summaryValue: string | null;
  isComplete: boolean;
  needsOther: boolean;
};

type QuestionSelectionState = {
  selection: string[];
  otherSelected: boolean;
  otherValue: string;
  needsOther: boolean;
};

export const buildQuestionKey = (index: number): QuestionKey => `q_${index}`;

export function toggleQuestionSelection(
  multiSelect: boolean,
  existing: string[] | undefined,
  value: string,
): string[] {
  const current = existing ?? [];
  if (!multiSelect) {
    return [value];
  }
  return current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value];
}

export function canSubmitQuestions(
  questions: AskUserQuestionPrompt[],
  selections: QuestionSelections,
  otherValues: QuestionOtherValues,
): boolean {
  if (questions.length === 0) {
    return false;
  }
  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    const answer = buildAnswerForQuestion(
      question,
      buildQuestionKey(index),
      selections,
      otherValues,
    );
    if (!answer) {
      return false;
    }
  }
  return true;
}

export function hasMissingOtherValues(
  questions: AskUserQuestionPrompt[],
  selections: QuestionSelections,
  otherValues: QuestionOtherValues,
): boolean {
  for (let index = 0; index < questions.length; index += 1) {
    const questionKey = buildQuestionKey(index);
    if (
      readQuestionSelectionState(questionKey, selections, otherValues)
        .needsOther
    ) {
      return true;
    }
  }
  return false;
}

export function buildQuestionCompletion(
  questions: AskUserQuestionPrompt[],
  selections: QuestionSelections,
  otherValues: QuestionOtherValues,
): Record<QuestionKey, boolean> {
  const output: Record<QuestionKey, boolean> = {};
  for (let index = 0; index < questions.length; index += 1) {
    const questionKey = buildQuestionKey(index);
    const { selection, needsOther } = readQuestionSelectionState(
      questionKey,
      selections,
      otherValues,
    );
    output[questionKey] = selection.length > 0 && !needsOther;
  }
  return output;
}

export function buildQuestionSummaryItems(
  questions: AskUserQuestionPrompt[],
  selections: QuestionSelections,
  otherValues: QuestionOtherValues,
  displayedAnswers: Record<string, string> | null,
): QuestionSummaryItem[] {
  return questions.map((question, index) => {
    const questionKey = buildQuestionKey(index);
    const draftAnswer = buildAnswerForQuestion(
      question,
      questionKey,
      selections,
      otherValues,
    );
    const { needsOther } = readQuestionSelectionState(
      questionKey,
      selections,
      otherValues,
    );
    const summaryValue = displayedAnswers?.[question.question] ?? draftAnswer;
    return {
      questionKey,
      label: question.header || `Q${index + 1}`,
      questionText: question.question,
      summaryValue,
      isComplete: Boolean(summaryValue) && !needsOther,
      needsOther,
    };
  });
}

export function resolveQuestionCardHelperText({
  hasSummary,
  isSummaryTab,
  canSubmit,
  hasMissingOtherValue,
}: {
  hasSummary: boolean;
  isSummaryTab: boolean;
  canSubmit: boolean;
  hasMissingOtherValue: boolean;
}): string {
  if (hasMissingOtherValue) {
    return "Fill in the custom response for each custom selection.";
  }
  if (!hasSummary) {
    return "Select an option for each question.";
  }
  if (isSummaryTab) {
    return canSubmit
      ? "Review your answers before submitting."
      : "Complete all questions to submit.";
  }
  return "Answer each question, then review on Summary.";
}

export function buildSelectionsFromAnswers(
  questions: AskUserQuestionPrompt[],
  answers: Record<string, string>,
): {
  selections: QuestionSelections;
  otherValues: QuestionOtherValues;
} {
  const selections: QuestionSelections = {};
  const otherValues: QuestionOtherValues = {};
  for (const [index, question] of questions.entries()) {
    const answer = answers[question.question];
    if (!answer) {
      continue;
    }
    const questionKey = buildQuestionKey(index);
    const values = splitAnswerEntries(answer);
    const optionSet = new Set(getKnownOptionLabels(question));
    const selectedValues: string[] = [];
    const customValues: string[] = [];
    for (const entry of values) {
      if (optionSet.has(entry)) {
        selectedValues.push(entry);
      } else {
        customValues.push(entry);
      }
    }
    if (customValues.length > 0) {
      selectedValues.push(OTHER_OPTION_VALUE);
      otherValues[questionKey] = customValues.join(", ");
    }
    selections[questionKey] = selectedValues;
  }
  return { selections, otherValues };
}

export function buildAnswers(
  questions: AskUserQuestionPrompt[],
  selections: QuestionSelections,
  otherValues: QuestionOtherValues,
): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const [index, question] of questions.entries()) {
    const answer = buildAnswerForQuestion(
      question,
      buildQuestionKey(index),
      selections,
      otherValues,
    );
    if (answer) {
      answers[question.question] = answer;
    }
  }
  return answers;
}

function buildAnswerForQuestion(
  question: AskUserQuestionPrompt,
  questionKey: QuestionKey,
  selections: QuestionSelections,
  otherValues: QuestionOtherValues,
): string | null {
  const { selection, otherSelected, otherValue } = readQuestionSelectionState(
    questionKey,
    selections,
    otherValues,
  );
  if (selection.length === 0) {
    return null;
  }
  const selectedLabels = selection.filter(
    (value) => value !== OTHER_OPTION_VALUE,
  );
  if (!question.multiSelect) {
    return otherSelected ? otherValue || null : selectedLabels[0] ?? null;
  }
  return buildMultiSelectAnswer(selectedLabels, otherSelected, otherValue);
}

export function buildQuestionOptions(
  question: AskUserQuestionPrompt,
): RenderQuestionOption[] {
  const options = question.options
    .filter((option) => !isOtherLabel(option.label))
    .map((option) => ({
      value: option.label,
      label: option.label,
      description: option.description,
      isOther: false,
    }));
  return [
    ...options,
    {
      value: OTHER_OPTION_VALUE,
      label: OTHER_OPTION_LABEL,
      description: resolveOtherDescription(question),
      isOther: true,
    },
  ];
}

function buildMultiSelectAnswer(
  selectedLabels: string[],
  otherSelected: boolean,
  otherValue: string,
): string | null {
  if (otherSelected && !otherValue) {
    return null;
  }
  const entries = otherSelected
    ? [...selectedLabels, otherValue]
    : selectedLabels;
  return entries.length > 0 ? entries.join(", ") : null;
}

function readQuestionSelectionState(
  questionKey: QuestionKey,
  selections: QuestionSelections,
  otherValues: QuestionOtherValues,
): QuestionSelectionState {
  const selection = selections[questionKey] ?? [];
  const otherSelected = selection.includes(OTHER_OPTION_VALUE);
  const otherValue = (otherValues[questionKey] ?? "").trim();
  return {
    selection,
    otherSelected,
    otherValue,
    needsOther: otherSelected && !otherValue,
  };
}

function splitAnswerEntries(answer: string): string[] {
  return answer
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function getKnownOptionLabels(question: AskUserQuestionPrompt): string[] {
  return question.options
    .map((option) => option.label)
    .filter((label) => !isOtherLabel(label));
}

function resolveOtherDescription(
  question: AskUserQuestionPrompt,
): string | undefined {
  return question.options.find((option) => isOtherLabel(option.label))
    ?.description;
}

function isOtherLabel(label: string): boolean {
  return OTHER_OPTION_LABELS.has(label.trim().toLowerCase());
}
