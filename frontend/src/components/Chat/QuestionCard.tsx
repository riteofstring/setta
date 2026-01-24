import { useEffect, useMemo, useState } from "react";
import { respondExternalAgentQuestion } from "state/actions/ai";
import {
  AskUserQuestionPayload,
  AskUserQuestionPrompt,
} from "utils/claudeTools";

const DEFAULT_TITLE = "Question";
const OTHER_OPTION_VALUE = "__other__";
const OTHER_OPTION_LABEL = "Type something else";
const OTHER_OPTION_LABELS = new Set(["other", "type something else"]);

type RenderQuestionOption = {
  value: string;
  label: string;
  description?: string;
  isOther: boolean;
};

type QuestionCardProps = {
  toolCallId: string;
  payload: AskUserQuestionPayload;
  resolvedAnswers: Record<string, string> | null;
};

export function QuestionCard({
  toolCallId,
  payload,
  resolvedAnswers,
}: QuestionCardProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [otherValues, setOtherValues] = useState<Record<string, string>>({});
  const [activeIndex, setActiveIndex] = useState(0);

  const answered = Boolean(
    resolvedAnswers && Object.keys(resolvedAnswers).length,
  );
  const questionCount = payload.questions.length;
  const hasSummary = questionCount > 1;
  const lastTabIndex = hasSummary
    ? questionCount
    : Math.max(questionCount - 1, 0);
  const isSummaryTab = hasSummary && activeIndex === questionCount;

  useEffect(() => {
    if (!resolvedAnswers) {
      return;
    }
    const { selections: nextSelections, otherValues: nextOtherValues } =
      buildSelectionsFromAnswers(payload.questions, resolvedAnswers);
    setSelections(nextSelections);
    setOtherValues(nextOtherValues);
  }, [payload.questions, resolvedAnswers]);

  useEffect(() => {
    if (answered) {
      setPending(false);
      setError(null);
    }
  }, [answered]);

  useEffect(() => {
    if (!answered || !hasSummary) {
      return;
    }
    setActiveIndex(questionCount);
  }, [answered, hasSummary, questionCount]);

  useEffect(() => {
    if (activeIndex > lastTabIndex) {
      setActiveIndex(lastTabIndex);
    }
  }, [activeIndex, lastTabIndex]);

  const canSubmit = useMemo(() => {
    if (answered) {
      return false;
    }
    if (payload.questions.length === 0) {
      return false;
    }
    return payload.questions.every((question) => {
      const answer = buildAnswerForQuestion(question, selections, otherValues);
      return Boolean(answer);
    });
  }, [answered, payload.questions, selections, otherValues]);

  const hasMissingOtherValue = useMemo(() => {
    for (const question of payload.questions) {
      const selection = selections[question.question] ?? [];
      if (!selection.includes(OTHER_OPTION_VALUE)) {
        continue;
      }
      const otherValue = (otherValues[question.question] ?? "").trim();
      if (!otherValue) {
        return true;
      }
    }
    return false;
  }, [payload.questions, selections, otherValues]);

  const questionCompletion = useMemo(() => {
    const output: Record<string, boolean> = {};
    for (const question of payload.questions) {
      const selection = selections[question.question] ?? [];
      const otherSelected = selection.includes(OTHER_OPTION_VALUE);
      const otherValue = (otherValues[question.question] ?? "").trim();
      const needsOther = otherSelected && !otherValue;
      output[question.question] = selection.length > 0 && !needsOther;
    }
    return output;
  }, [payload.questions, selections, otherValues]);

  const handleToggle = (
    question: AskUserQuestionPrompt,
    option: RenderQuestionOption,
  ) => {
    if (answered) {
      return;
    }
    setSelections((current) => {
      const existing = current[question.question] ?? [];
      let nextSelections = existing;
      if (question.multiSelect) {
        if (existing.includes(option.value)) {
          nextSelections = existing.filter((value) => value !== option.value);
        } else {
          nextSelections = [...existing, option.value];
        }
      } else {
        nextSelections = [option.value];
      }
      return { ...current, [question.question]: nextSelections };
    });
  };

  const handleOtherChange = (
    question: AskUserQuestionPrompt,
    value: string,
  ) => {
    if (answered) {
      return;
    }
    setOtherValues((current) => ({
      ...current,
      [question.question]: value,
    }));
  };

  const handleSubmit = async () => {
    if (!canSubmit || pending) {
      return;
    }
    setPending(true);
    setError(null);
    const answers = buildAnswers(payload.questions, selections, otherValues);
    try {
      const ok = await respondExternalAgentQuestion(toolCallId, answers);
      if (!ok) {
        setPending(false);
        setError("Failed to send answers.");
      }
    } catch (err) {
      setPending(false);
      setError(err instanceof Error ? err.message : "Failed to send answers.");
    }
  };

  const displayedAnswers = answered ? resolvedAnswers : null;
  const activeQuestion =
    activeIndex < questionCount ? payload.questions[activeIndex] : null;
  const showSubmit = !answered && (!hasSummary || isSummaryTab);

  let helperText = "Select an option for each question.";
  if (hasSummary) {
    if (isSummaryTab) {
      helperText = canSubmit
        ? "Review your answers before submitting."
        : "Complete all questions to submit.";
    } else {
      helperText = "Answer each question, then review on Summary.";
    }
  }
  if (hasMissingOtherValue) {
    helperText = "Fill in the custom response for each custom selection.";
  }

  return (
    <div className="my-1 overflow-hidden rounded-md border border-setta-200/70 bg-white shadow-sm dark:border-setta-800 dark:bg-setta-900">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-setta-700 dark:text-setta-200">
            {payload.questions.length > 1
              ? `Questions (${payload.questions.length})`
              : DEFAULT_TITLE}
          </span>
          <span className="text-[10px] text-setta-400">
            {answered ? "Submitted" : "Awaiting response"}
          </span>
        </div>
        <span className="rounded-full bg-setta-100 px-2 py-1 text-[10px] font-semibold text-setta-500 dark:bg-setta-800 dark:text-setta-200">
          {answered ? "Complete" : "Pending"}
        </span>
      </div>
      <div className="border-t border-setta-100 px-3 py-3 dark:border-setta-800">
        {hasSummary ? (
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {payload.questions.map((question, index) => {
              const isActive = activeIndex === index;
              const tabLabel = question.header
                ? question.header
                : `Q${index + 1}`;
              const isComplete = questionCompletion[question.question];
              const tabClass = isActive
                ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500/70 dark:bg-blue-900/40 dark:text-blue-200"
                : "border-setta-200 text-setta-500 hover:bg-setta-50 dark:border-setta-800 dark:text-setta-400 dark:hover:bg-setta-800/40";
              const dotClass = isComplete
                ? "bg-emerald-500"
                : "bg-setta-300 dark:bg-setta-600";
              return (
                <button
                  key={question.question}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold transition ${tabClass}`}
                >
                  <span className="max-w-[120px] truncate">{tabLabel}</span>
                  <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setActiveIndex(questionCount)}
              className={`flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold transition ${
                isSummaryTab
                  ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500/70 dark:bg-blue-900/40 dark:text-blue-200"
                  : "border-setta-200 text-setta-500 hover:bg-setta-50 dark:border-setta-800 dark:text-setta-400 dark:hover:bg-setta-800/40"
              }`}
            >
              <span className="max-w-[120px] truncate">Summary</span>
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  canSubmit
                    ? "bg-emerald-500"
                    : "bg-setta-300 dark:bg-setta-600"
                }`}
              />
            </button>
          </div>
        ) : null}
        {activeQuestion ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              {activeQuestion.header ? (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-setta-400">
                  {activeQuestion.header}
                </span>
              ) : null}
              <span className="text-sm font-semibold text-setta-700 dark:text-setta-200">
                {activeQuestion.question}
              </span>
              {displayedAnswers?.[activeQuestion.question] ? (
                <span className="text-xs text-emerald-600 dark:text-emerald-400">
                  {displayedAnswers[activeQuestion.question]}
                </span>
              ) : null}
            </div>
            {displayedAnswers?.[activeQuestion.question] ? null : (
              <div className="flex flex-col gap-2">
                {buildQuestionOptions(activeQuestion).map((option) => {
                  const selected = selections[activeQuestion.question] ?? [];
                  const isSelected = selected.includes(option.value);
                  return (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-xs transition-colors ${
                        isSelected
                          ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500/70 dark:bg-blue-900/40 dark:text-blue-200"
                          : "border-setta-200 text-setta-600 hover:bg-setta-50 dark:border-setta-800 dark:text-setta-300 dark:hover:bg-setta-800/40"
                      }`}
                    >
                      <input
                        type={activeQuestion.multiSelect ? "checkbox" : "radio"}
                        name={activeQuestion.question}
                        checked={isSelected}
                        onChange={() => handleToggle(activeQuestion, option)}
                        disabled={answered || pending}
                        className="mt-1 h-3 w-3"
                      />
                      <span className="flex w-full flex-col gap-1">
                        <span className="font-semibold">{option.label}</span>
                        {option.description ? (
                          <span className="text-[11px] text-setta-400">
                            {option.description}
                          </span>
                        ) : null}
                        {option.isOther && isSelected ? (
                          <input
                            type="text"
                            value={otherValues[activeQuestion.question] ?? ""}
                            onChange={(event) =>
                              handleOtherChange(
                                activeQuestion,
                                event.target.value,
                              )
                            }
                            disabled={answered || pending}
                            placeholder="Type your answer"
                            className="mt-2 w-full rounded-md border border-setta-200 bg-white px-2 py-1 text-xs text-setta-700 focus:border-blue-400 focus:outline-none dark:border-setta-800 dark:bg-setta-900 dark:text-setta-200"
                          />
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {payload.questions.map((question, index) => {
              const draftAnswer = buildAnswerForQuestion(
                question,
                selections,
                otherValues,
              );
              const resolvedAnswer =
                displayedAnswers?.[question.question] ?? null;
              let summaryValue = resolvedAnswer;
              if (!summaryValue) {
                summaryValue = draftAnswer;
              }
              const selection = selections[question.question] ?? [];
              const otherSelected = selection.includes(OTHER_OPTION_VALUE);
              const otherValue = (otherValues[question.question] ?? "").trim();
              const needsOther = otherSelected && !otherValue;
              const isComplete = Boolean(summaryValue) && !needsOther;
              const label = question.header ? question.header : `Q${index + 1}`;
              let summaryContent = (
                <span className="text-setta-400">No selection yet.</span>
              );
              if (summaryValue) {
                summaryContent = (
                  <span className="text-setta-700 dark:text-setta-200">
                    {summaryValue}
                  </span>
                );
              } else if (needsOther) {
                summaryContent = (
                  <span className="text-amber-600 dark:text-amber-300">
                    Add a custom response.
                  </span>
                );
              }
              return (
                <div
                  key={question.question}
                  className="rounded-md border border-setta-200 bg-setta-50 px-3 py-2 text-xs dark:border-setta-800 dark:bg-setta-900/60"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-setta-400">
                        {label}
                      </span>
                      <span className="text-sm font-semibold text-setta-700 dark:text-setta-200">
                        {question.question}
                      </span>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                        isComplete
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                          : "bg-setta-100 text-setta-500 dark:bg-setta-800 dark:text-setta-300"
                      }`}
                    >
                      {isComplete ? "Ready" : "Incomplete"}
                    </span>
                  </div>
                  <div className="mt-2 text-xs">{summaryContent}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {answered ? null : (
        <div className="border-t border-setta-100 bg-setta-50 px-3 py-2 dark:border-setta-800 dark:bg-setta-950/40">
          <div className="flex flex-wrap items-center gap-2">
            {error ? (
              <span className="mr-auto text-xs text-red-500">{error}</span>
            ) : (
              <span className="mr-auto text-xs text-setta-500">
                {helperText}
              </span>
            )}
            {hasSummary ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setActiveIndex((prev) => Math.max(prev - 1, 0))
                  }
                  disabled={activeIndex === 0}
                  className="rounded-md border border-setta-200 px-2 py-1 text-xs font-semibold text-setta-500 transition hover:bg-setta-100 disabled:opacity-50 dark:border-setta-800 dark:text-setta-300 dark:hover:bg-setta-800/40"
                >
                  Previous
                </button>
                {isSummaryTab ? null : (
                  <button
                    type="button"
                    onClick={() =>
                      setActiveIndex((prev) => Math.min(prev + 1, lastTabIndex))
                    }
                    className="rounded-md border border-setta-200 px-2 py-1 text-xs font-semibold text-setta-500 transition hover:bg-setta-100 dark:border-setta-800 dark:text-setta-300 dark:hover:bg-setta-800/40"
                  >
                    {activeIndex === questionCount - 1 ? "Review" : "Next"}
                  </button>
                )}
              </div>
            ) : null}
            {showSubmit ? (
              <button
                className="rounded-md bg-blue-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-blue-600 disabled:opacity-60"
                onClick={handleSubmit}
                disabled={!canSubmit || pending}
              >
                Submit
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function buildSelectionsFromAnswers(
  questions: AskUserQuestionPrompt[],
  answers: Record<string, string>,
): {
  selections: Record<string, string[]>;
  otherValues: Record<string, string>;
} {
  const selections: Record<string, string[]> = {};
  const otherValues: Record<string, string> = {};
  for (const question of questions) {
    const answer = answers[question.question];
    if (!answer) {
      continue;
    }
    const values = answer
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    const knownOptions = question.options
      .map((option) => option.label)
      .filter((label) => !isOtherLabel(label));
    const optionSet = new Set(knownOptions);
    const nextSelections: string[] = [];
    const otherEntries: string[] = [];
    for (const entry of values) {
      if (optionSet.has(entry)) {
        nextSelections.push(entry);
      } else {
        otherEntries.push(entry);
      }
    }
    if (otherEntries.length > 0) {
      nextSelections.push(OTHER_OPTION_VALUE);
      otherValues[question.question] = otherEntries.join(", ");
    }
    selections[question.question] = nextSelections;
  }
  return { selections, otherValues };
}

function buildAnswers(
  questions: AskUserQuestionPrompt[],
  selections: Record<string, string[]>,
  otherValues: Record<string, string>,
): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const question of questions) {
    const answer = buildAnswerForQuestion(question, selections, otherValues);
    if (answer) {
      answers[question.question] = answer;
    }
  }
  return answers;
}

function buildAnswerForQuestion(
  question: AskUserQuestionPrompt,
  selections: Record<string, string[]>,
  otherValues: Record<string, string>,
): string | null {
  const selected = selections[question.question] ?? [];
  if (selected.length === 0) {
    return null;
  }
  const otherSelected = selected.includes(OTHER_OPTION_VALUE);
  const otherValue = (otherValues[question.question] ?? "").trim();
  const selectedLabels = selected.filter(
    (value) => value !== OTHER_OPTION_VALUE,
  );
  if (question.multiSelect) {
    if (otherSelected && !otherValue) {
      return null;
    }
    const entries = [...selectedLabels];
    if (otherSelected) {
      entries.push(otherValue);
    }
    if (entries.length === 0) {
      return null;
    }
    return entries.join(", ");
  }
  if (otherSelected) {
    return otherValue || null;
  }
  return selectedLabels[0] ?? null;
}

function buildQuestionOptions(
  question: AskUserQuestionPrompt,
): RenderQuestionOption[] {
  const options: RenderQuestionOption[] = [];
  let otherDescription: string | undefined;
  for (const option of question.options) {
    if (isOtherLabel(option.label)) {
      if (!otherDescription && option.description) {
        otherDescription = option.description;
      }
      continue;
    }
    options.push({
      value: option.label,
      label: option.label,
      description: option.description,
      isOther: false,
    });
  }
  options.push({
    value: OTHER_OPTION_VALUE,
    label: OTHER_OPTION_LABEL,
    description: otherDescription,
    isOther: true,
  });
  return options;
}

function isOtherLabel(label: string): boolean {
  return OTHER_OPTION_LABELS.has(label.trim().toLowerCase());
}
