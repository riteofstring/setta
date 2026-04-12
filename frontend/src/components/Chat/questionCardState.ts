import type { Dispatch, SetStateAction } from "react";
import { useEffect, useState } from "react";

import { respondExternalAgentQuestion } from "state/actions/ai";
import type { AskUserQuestionPrompt } from "utils/claudeTools";

import {
  buildAnswers,
  buildQuestionCompletion,
  buildQuestionKey,
  buildQuestionSummaryItems,
  buildSelectionsFromAnswers,
  canSubmitQuestions,
  hasMissingOtherValues,
  resolveQuestionCardHelperText,
  toggleQuestionSelection,
  type QuestionKey,
  type QuestionOtherValues,
  type QuestionSelections,
  type QuestionSummaryItem,
  type RenderQuestionOption,
} from "./questionCardModel";

type ResolvedAnswers = Record<string, string> | null;

type UseQuestionCardStateParams = {
  toolCallId: string;
  questions: AskUserQuestionPrompt[];
  resolvedAnswers: ResolvedAnswers;
};

type UseQuestionCardStateResult = {
  activeIndex: number;
  activeQuestion: AskUserQuestionPrompt | null;
  activeQuestionKey: QuestionKey | null;
  answered: boolean;
  canSubmit: boolean;
  error: string | null;
  handleOtherChange: (questionKey: QuestionKey, value: string) => void;
  handleSubmit: () => Promise<void>;
  handleToggle: (
    question: AskUserQuestionPrompt,
    questionKey: QuestionKey,
    option: RenderQuestionOption,
  ) => void;
  hasSummary: boolean;
  helperText: string;
  isSummaryTab: boolean;
  pending: boolean;
  questionCompletion: Record<QuestionKey, boolean>;
  questionCount: number;
  setActiveIndex: Dispatch<SetStateAction<number>>;
  showSubmit: boolean;
  summaryItems: QuestionSummaryItem[];
  displayedAnswers: ResolvedAnswers;
  otherValues: QuestionOtherValues;
  selections: QuestionSelections;
};

export function useQuestionCardState({
  toolCallId,
  questions,
  resolvedAnswers,
}: UseQuestionCardStateParams): UseQuestionCardStateResult {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selections, setSelections] = useState<QuestionSelections>({});
  const [otherValues, setOtherValues] = useState<QuestionOtherValues>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [submittedAnswers, setSubmittedAnswers] =
    useState<ResolvedAnswers>(null);

  useResolvedAnswersSync(
    questions,
    resolvedAnswers,
    setSelections,
    setOtherValues,
    setSubmittedAnswers,
  );

  const displayedAnswers = resolvedAnswers ?? submittedAnswers;
  const answered = Boolean(
    displayedAnswers && Object.keys(displayedAnswers).length,
  );
  const questionCount = questions.length;
  const hasSummary = questionCount > 1;
  const lastTabIndex = hasSummary
    ? questionCount
    : Math.max(questionCount - 1, 0);
  const isSummaryTab = hasSummary && activeIndex === questionCount;

  useQuestionCardLifecycle({
    answered,
    hasSummary,
    questionCount,
    activeIndex,
    lastTabIndex,
    setActiveIndex,
    setPending,
    setError,
  });

  const canSubmit =
    !answered && canSubmitQuestions(questions, selections, otherValues);
  const hasMissingOtherValue = hasMissingOtherValues(
    questions,
    selections,
    otherValues,
  );
  const questionCompletion = buildQuestionCompletion(
    questions,
    selections,
    otherValues,
  );
  const summaryItems = buildQuestionSummaryItems(
    questions,
    selections,
    otherValues,
    displayedAnswers,
  );
  const activeQuestion = questions[activeIndex] ?? null;
  const activeQuestionKey = activeQuestion
    ? buildQuestionKey(activeIndex)
    : null;
  const showSubmit = !answered && (!hasSummary || isSummaryTab);
  const helperText = resolveQuestionCardHelperText({
    hasSummary,
    isSummaryTab,
    canSubmit,
    hasMissingOtherValue,
  });

  return {
    activeIndex,
    activeQuestion,
    activeQuestionKey,
    answered,
    canSubmit,
    error,
    handleOtherChange: createOtherChangeHandler(answered, setOtherValues),
    handleSubmit: createSubmitHandler({
      toolCallId,
      questions,
      selections,
      otherValues,
      canSubmit,
      pending,
      setPending,
      setError,
      setSubmittedAnswers,
    }),
    handleToggle: createToggleHandler(answered, setSelections),
    hasSummary,
    helperText,
    isSummaryTab,
    pending,
    questionCompletion,
    questionCount,
    setActiveIndex,
    showSubmit,
    summaryItems,
    displayedAnswers,
    otherValues,
    selections,
  };
}

function useResolvedAnswersSync(
  questions: AskUserQuestionPrompt[],
  resolvedAnswers: ResolvedAnswers,
  setSelections: Dispatch<SetStateAction<QuestionSelections>>,
  setOtherValues: Dispatch<SetStateAction<QuestionOtherValues>>,
  setSubmittedAnswers: Dispatch<SetStateAction<ResolvedAnswers>>,
) {
  useEffect(() => {
    if (!resolvedAnswers) {
      return;
    }
    const syncedState = buildSelectionsFromAnswers(questions, resolvedAnswers);
    setSelections(syncedState.selections);
    setOtherValues(syncedState.otherValues);
    if (Object.keys(resolvedAnswers).length > 0) {
      setSubmittedAnswers(resolvedAnswers);
    }
  }, [
    questions,
    resolvedAnswers,
    setSelections,
    setOtherValues,
    setSubmittedAnswers,
  ]);
}

function useQuestionCardLifecycle({
  answered,
  hasSummary,
  questionCount,
  activeIndex,
  lastTabIndex,
  setActiveIndex,
  setPending,
  setError,
}: {
  answered: boolean;
  hasSummary: boolean;
  questionCount: number;
  activeIndex: number;
  lastTabIndex: number;
  setActiveIndex: Dispatch<SetStateAction<number>>;
  setPending: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
}) {
  useEffect(() => {
    if (answered) {
      setPending(false);
      setError(null);
    }
  }, [answered, setError, setPending]);

  useEffect(() => {
    if (!answered || !hasSummary) {
      return;
    }
    setActiveIndex(questionCount);
  }, [answered, hasSummary, questionCount, setActiveIndex]);

  useEffect(() => {
    if (activeIndex > lastTabIndex) {
      setActiveIndex(lastTabIndex);
    }
  }, [activeIndex, lastTabIndex, setActiveIndex]);
}

function createToggleHandler(
  answered: boolean,
  setSelections: Dispatch<SetStateAction<QuestionSelections>>,
) {
  return (
    question: AskUserQuestionPrompt,
    questionKey: QuestionKey,
    option: RenderQuestionOption,
  ) => {
    if (answered) {
      return;
    }
    setSelections((current) => ({
      ...current,
      [questionKey]: toggleQuestionSelection(
        question.multiSelect,
        current[questionKey],
        option.value,
      ),
    }));
  };
}

function createOtherChangeHandler(
  answered: boolean,
  setOtherValues: Dispatch<SetStateAction<QuestionOtherValues>>,
) {
  return (questionKey: QuestionKey, value: string) => {
    if (answered) {
      return;
    }
    setOtherValues((current) => ({
      ...current,
      [questionKey]: value,
    }));
  };
}

function createSubmitHandler({
  toolCallId,
  questions,
  selections,
  otherValues,
  canSubmit,
  pending,
  setPending,
  setError,
  setSubmittedAnswers,
}: {
  toolCallId: string;
  questions: AskUserQuestionPrompt[];
  selections: QuestionSelections;
  otherValues: QuestionOtherValues;
  canSubmit: boolean;
  pending: boolean;
  setPending: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setSubmittedAnswers: Dispatch<SetStateAction<ResolvedAnswers>>;
}) {
  return async () => {
    if (!canSubmit || pending) {
      return;
    }
    setPending(true);
    setError(null);
    const answers = buildAnswers(questions, selections, otherValues);
    try {
      const ok = await respondExternalAgentQuestion(toolCallId, answers);
      if (!ok) {
        setPending(false);
        setError("Failed to send answers.");
        return;
      }
      setSubmittedAnswers(answers);
    } catch (err) {
      setPending(false);
      setError(err instanceof Error ? err.message : "Failed to send answers.");
    }
  };
}
