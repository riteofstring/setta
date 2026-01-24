import { useEffect, useMemo, useState } from "react";
import { respondExternalAgentQuestion } from "state/actions/ai";
import {
  AskUserQuestionPayload,
  AskUserQuestionPrompt,
} from "utils/claudeTools";

const DEFAULT_TITLE = "Question";

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

  const answered = Boolean(
    resolvedAnswers && Object.keys(resolvedAnswers).length,
  );

  useEffect(() => {
    if (!resolvedAnswers) {
      return;
    }
    setSelections(
      buildSelectionsFromAnswers(payload.questions, resolvedAnswers),
    );
  }, [payload.questions, resolvedAnswers]);

  useEffect(() => {
    if (answered) {
      setPending(false);
      setError(null);
    }
  }, [answered]);

  const canSubmit = useMemo(() => {
    if (answered) {
      return false;
    }
    return payload.questions.every((question) => {
      const selection = selections[question.question] ?? [];
      return selection.length > 0;
    });
  }, [answered, payload.questions, selections]);

  const handleToggle = (question: AskUserQuestionPrompt, label: string) => {
    if (answered) {
      return;
    }
    setSelections((current) => {
      const existing = current[question.question] ?? [];
      let nextSelections = existing;
      if (question.multiSelect) {
        if (existing.includes(label)) {
          nextSelections = existing.filter((value) => value !== label);
        } else {
          nextSelections = [...existing, label];
        }
      } else {
        nextSelections = [label];
      }
      return { ...current, [question.question]: nextSelections };
    });
  };

  const handleSubmit = async () => {
    if (!canSubmit || pending) {
      return;
    }
    setPending(true);
    setError(null);
    const answers = buildAnswers(payload.questions, selections);
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
        <div className="flex flex-col gap-4">
          {payload.questions.map((question) => {
            const selected = selections[question.question] ?? [];
            const answeredValue = displayedAnswers?.[question.question];
            return (
              <div key={question.question} className="flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  {question.header ? (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-setta-400">
                      {question.header}
                    </span>
                  ) : null}
                  <span className="text-sm font-semibold text-setta-700 dark:text-setta-200">
                    {question.question}
                  </span>
                  {answeredValue ? (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400">
                      {answeredValue}
                    </span>
                  ) : null}
                </div>
                {answeredValue ? null : (
                  <div className="flex flex-col gap-2">
                    {question.options.map((option) => {
                      const isSelected = selected.includes(option.label);
                      return (
                        <label
                          key={option.label}
                          className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-xs transition-colors ${
                            isSelected
                              ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500/70 dark:bg-blue-900/40 dark:text-blue-200"
                              : "border-setta-200 text-setta-600 hover:bg-setta-50 dark:border-setta-800 dark:text-setta-300 dark:hover:bg-setta-800/40"
                          }`}
                        >
                          <input
                            type={question.multiSelect ? "checkbox" : "radio"}
                            name={question.question}
                            checked={isSelected}
                            onChange={() =>
                              handleToggle(question, option.label)
                            }
                            disabled={answered || pending}
                            className="mt-1 h-3 w-3"
                          />
                          <span className="flex flex-col gap-1">
                            <span className="font-semibold">
                              {option.label}
                            </span>
                            {option.description ? (
                              <span className="text-[11px] text-setta-400">
                                {option.description}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {answered ? null : (
        <div className="border-t border-setta-100 bg-setta-50 px-3 py-2 dark:border-setta-800 dark:bg-setta-950/40">
          <div className="flex flex-wrap items-center gap-2">
            {error ? (
              <span className="mr-auto text-xs text-red-500">{error}</span>
            ) : (
              <span className="mr-auto text-xs text-setta-500">
                Select an option for each question.
              </span>
            )}
            <button
              className="rounded-md bg-blue-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-blue-600 disabled:opacity-60"
              onClick={handleSubmit}
              disabled={!canSubmit || pending}
            >
              Submit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function buildSelectionsFromAnswers(
  questions: AskUserQuestionPrompt[],
  answers: Record<string, string>,
): Record<string, string[]> {
  const output: Record<string, string[]> = {};
  for (const question of questions) {
    const answer = answers[question.question];
    if (!answer) {
      continue;
    }
    const selections = answer
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    output[question.question] = selections;
  }
  return output;
}

function buildAnswers(
  questions: AskUserQuestionPrompt[],
  selections: Record<string, string[]>,
): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const question of questions) {
    const selected = selections[question.question] ?? [];
    if (selected.length === 0) {
      continue;
    }
    if (question.multiSelect) {
      answers[question.question] = selected.join(", ");
    } else {
      answers[question.question] = selected[0] ?? "";
    }
  }
  return answers;
}
