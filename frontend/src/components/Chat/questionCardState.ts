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
  lastTabIndex: number;
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

  const { displayedAnswers, answered } = resolveAnswerDisplayState(
    resolvedAnswers,
    submittedAnswers,
  );
  const viewState = buildQuestionCardViewState({
    questions,
    selections,
    otherValues,
    displayedAnswers,
    answered,
    activeIndex,
  });

  useQuestionCardLifecycle({
    answered,
    hasSummary: viewState.hasSummary,
    questionCount: viewState.questionCount,
    activeIndex,
    lastTabIndex: viewState.lastTabIndex,
    setActiveIndex,
    setPending,
    setError,
  });

  return {
    activeIndex,
    activeQuestion: viewState.activeQuestion,
    activeQuestionKey: viewState.activeQuestionKey,
    answered,
    canSubmit: viewState.canSubmit,
    error,
    lastTabIndex: viewState.lastTabIndex,
    handleOtherChange: createOtherChangeHandler(answered, setOtherValues),
    handleSubmit: createSubmitHandler({
      toolCallId,
      questions,
      selections,
      otherValues,
      canSubmit: viewState.canSubmit,
      pending,
      setPending,
      setError,
      setSubmittedAnswers,
    }),
    handleToggle: createToggleHandler(answered, setSelections),
    hasSummary: viewState.hasSummary,
    helperText: viewState.helperText,
    isSummaryTab: viewState.isSummaryTab,
    pending,
    questionCompletion: viewState.questionCompletion,
    questionCount: viewState.questionCount,
    setActiveIndex,
    showSubmit: viewState.showSubmit,
    summaryItems: viewState.summaryItems,
    displayedAnswers,
    otherValues,
    selections,
  };
}

function resolveAnswerDisplayState(
  resolvedAnswers: ResolvedAnswers,
  submittedAnswers: ResolvedAnswers,
) {
  const displayedAnswers = resolvedAnswers ?? submittedAnswers;
  return {
    displayedAnswers,
    answered:
      displayedAnswers !== null && Object.keys(displayedAnswers).length > 0,
  };
}

function buildQuestionCardViewState({
  questions,
  selections,
  otherValues,
  displayedAnswers,
  answered,
  activeIndex,
}: {
  questions: AskUserQuestionPrompt[];
  selections: QuestionSelections;
  otherValues: QuestionOtherValues;
  displayedAnswers: ResolvedAnswers;
  answered: boolean;
  activeIndex: number;
}) {
  const questionCount = questions.length;
  const hasSummary = questionCount > 1;
  const lastTabIndex = hasSummary
    ? questionCount
    : Math.max(questionCount - 1, 0);
  const isSummaryTab = hasSummary && activeIndex === questionCount;
  const canSubmit =
    !answered && canSubmitQuestions(questions, selections, otherValues);
  const hasMissingOtherValue = hasMissingOtherValues(
    questions,
    selections,
    otherValues,
  );
  const activeQuestion = questions[activeIndex] ?? null;
  const activeQuestionKey = activeQuestion
    ? buildQuestionKey(activeIndex)
    : null;

  return {
    activeQuestion,
    activeQuestionKey,
    canSubmit,
    hasSummary,
    helperText: resolveQuestionCardHelperText({
      hasSummary,
      isSummaryTab,
      canSubmit,
      hasMissingOtherValue,
    }),
    isSummaryTab,
    lastTabIndex,
    questionCompletion: buildQuestionCompletion(
      questions,
      selections,
      otherValues,
    ),
    questionCount,
    showSubmit: !answered && (!hasSummary || isSummaryTab),
    summaryItems: buildQuestionSummaryItems(
      questions,
      selections,
      otherValues,
      displayedAnswers,
    ),
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
