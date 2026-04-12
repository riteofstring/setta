import { IoMdCheckmark } from "react-icons/io";
import type {
  AskUserQuestionPayload,
  AskUserQuestionPrompt,
} from "utils/claudeTools";
import {
  DEFAULT_TITLE,
  buildQuestionKey,
  buildQuestionOptions,
  type QuestionKey,
  type QuestionSummaryItem,
  type RenderQuestionOption,
} from "./questionCardModel";
import { useQuestionCardState } from "./questionCardState";

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
  const {
    activeIndex,
    activeQuestion,
    activeQuestionKey,
    answered,
    canSubmit,
    displayedAnswers,
    error,
    handleOtherChange,
    handleSubmit,
    handleToggle,
    hasSummary,
    helperText,
    isSummaryTab,
    otherValues,
    pending,
    questionCompletion,
    questionCount,
    selections,
    setActiveIndex,
    showSubmit,
    summaryItems,
  } = useQuestionCardState({
    toolCallId,
    questions: payload.questions,
    resolvedAnswers,
  });

  return (
    <div className="my-1 overflow-hidden rounded-md border border-setta-200/70 bg-white shadow-sm dark:border-setta-800 dark:bg-setta-900">
      <QuestionCardHeader questionCount={questionCount} answered={answered} />
      <div className="border-t border-setta-100 px-3 py-3 dark:border-setta-800">
        <QuestionCardTabs
          visible={hasSummary}
          questions={payload.questions}
          activeIndex={activeIndex}
          questionCount={questionCount}
          questionCompletion={questionCompletion}
          canSubmit={canSubmit}
          onSelect={setActiveIndex}
        />
        {activeQuestion && activeQuestionKey ? (
          <QuestionEditor
            question={activeQuestion}
            questionKey={activeQuestionKey}
            selectedValues={selections[activeQuestionKey] ?? []}
            otherValue={otherValues[activeQuestionKey] ?? ""}
            resolvedAnswer={displayedAnswers?.[activeQuestion.question] ?? null}
            answered={answered}
            pending={pending}
            onToggle={handleToggle}
            onOtherChange={handleOtherChange}
          />
        ) : (
          <QuestionSummary summaryItems={summaryItems} />
        )}
      </div>
      <QuestionCardFooter
        answered={answered}
        error={error}
        helperText={helperText}
        hasSummary={hasSummary}
        isSummaryTab={isSummaryTab}
        activeIndex={activeIndex}
        questionCount={questionCount}
        showSubmit={showSubmit}
        canSubmit={canSubmit}
        pending={pending}
        onPrevious={() => setActiveIndex((prev) => Math.max(prev - 1, 0))}
        onNext={() =>
          setActiveIndex((prev) => Math.min(prev + 1, lastTabIndex))
        }
        onSubmit={handleSubmit}
      />
    </div>
  );
}

function QuestionCardHeader({
  questionCount,
  answered,
}: {
  questionCount: number;
  answered: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <div className="flex flex-col">
        <span className="text-xs font-semibold text-setta-700 dark:text-setta-200">
          {questionCount > 1 ? `Questions (${questionCount})` : DEFAULT_TITLE}
        </span>
        <span className="text-[10px] text-setta-400">
          {answered ? "Submitted" : "Awaiting response"}
        </span>
      </div>
      <span className="rounded-full bg-setta-100 px-2 py-1 text-[10px] font-semibold text-setta-500 dark:bg-setta-800 dark:text-setta-200">
        {answered ? "Complete" : "Pending"}
      </span>
    </div>
  );
}

function QuestionCardTabs({
  visible,
  questions,
  activeIndex,
  questionCount,
  questionCompletion,
  canSubmit,
  onSelect,
}: {
  visible: boolean;
  questions: AskUserQuestionPrompt[];
  activeIndex: number;
  questionCount: number;
  questionCompletion: Record<QuestionKey, boolean>;
  canSubmit: boolean;
  onSelect: (index: number) => void;
}) {
  if (!visible) {
    return null;
  }
  return (
    <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
      {questions.map((question, index) => (
        <QuestionTabButton
          key={buildQuestionKey(index)}
          label={question.header || `Q${index + 1}`}
          isActive={activeIndex === index}
          isComplete={questionCompletion[buildQuestionKey(index)]}
          onClick={() => onSelect(index)}
        />
      ))}
      <QuestionTabButton
        label="Summary"
        isActive={activeIndex === questionCount}
        isComplete={canSubmit}
        onClick={() => onSelect(questionCount)}
      />
    </div>
  );
}

function QuestionTabButton({
  label,
  isActive,
  isComplete,
  onClick,
}: {
  label: string;
  isActive: boolean;
  isComplete: boolean;
  onClick: () => void;
}) {
  const buttonClass = isActive
    ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500/70 dark:bg-blue-900/40 dark:text-blue-200"
    : "border-setta-200 text-setta-500 hover:bg-setta-50 dark:border-setta-800 dark:text-setta-400 dark:hover:bg-setta-800/40";
  const dotClass = isComplete
    ? "bg-emerald-500"
    : "bg-setta-300 dark:bg-setta-600";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold transition ${buttonClass}`}
    >
      <span className="max-w-[120px] truncate">{label}</span>
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
    </button>
  );
}

function QuestionEditor({
  question,
  questionKey,
  selectedValues,
  otherValue,
  resolvedAnswer,
  answered,
  pending,
  onToggle,
  onOtherChange,
}: {
  question: AskUserQuestionPrompt;
  questionKey: QuestionKey;
  selectedValues: string[];
  otherValue: string;
  resolvedAnswer: string | null;
  answered: boolean;
  pending: boolean;
  onToggle: (
    question: AskUserQuestionPrompt,
    questionKey: QuestionKey,
    option: RenderQuestionOption,
  ) => void;
  onOtherChange: (questionKey: QuestionKey, value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        {question.header ? (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-setta-400">
            {question.header}
          </span>
        ) : null}
        <span className="text-sm font-semibold text-setta-700 dark:text-setta-200">
          {question.question}
        </span>
        {resolvedAnswer ? (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">
            {resolvedAnswer}
          </span>
        ) : null}
      </div>
      {resolvedAnswer ? null : (
        <QuestionOptions
          question={question}
          questionKey={questionKey}
          selectedValues={selectedValues}
          otherValue={otherValue}
          answered={answered}
          pending={pending}
          onToggle={onToggle}
          onOtherChange={onOtherChange}
        />
      )}
    </div>
  );
}

function QuestionOptions({
  question,
  questionKey,
  selectedValues,
  otherValue,
  answered,
  pending,
  onToggle,
  onOtherChange,
}: {
  question: AskUserQuestionPrompt;
  questionKey: QuestionKey;
  selectedValues: string[];
  otherValue: string;
  answered: boolean;
  pending: boolean;
  onToggle: (
    question: AskUserQuestionPrompt,
    questionKey: QuestionKey,
    option: RenderQuestionOption,
  ) => void;
  onOtherChange: (questionKey: QuestionKey, value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {buildQuestionOptions(question).map((option) => (
        <QuestionOptionRow
          key={option.value}
          question={question}
          questionKey={questionKey}
          option={option}
          selectedValues={selectedValues}
          otherValue={otherValue}
          answered={answered}
          pending={pending}
          onToggle={onToggle}
          onOtherChange={onOtherChange}
        />
      ))}
    </div>
  );
}

function QuestionOptionRow({
  question,
  questionKey,
  option,
  selectedValues,
  otherValue,
  answered,
  pending,
  onToggle,
  onOtherChange,
}: {
  question: AskUserQuestionPrompt;
  questionKey: QuestionKey;
  option: RenderQuestionOption;
  selectedValues: string[];
  otherValue: string;
  answered: boolean;
  pending: boolean;
  onToggle: (
    question: AskUserQuestionPrompt,
    questionKey: QuestionKey,
    option: RenderQuestionOption,
  ) => void;
  onOtherChange: (questionKey: QuestionKey, value: string) => void;
}) {
  const isSelected = selectedValues.includes(option.value);
  const rowClass = isSelected
    ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500/70 dark:bg-blue-900/40 dark:text-blue-200"
    : "border-setta-200 text-setta-600 hover:bg-setta-50 dark:border-setta-800 dark:text-setta-300 dark:hover:bg-setta-800/40";
  return (
    <label
      className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-xs transition-colors ${rowClass}`}
    >
      <input
        type={question.multiSelect ? "checkbox" : "radio"}
        name={questionKey}
        checked={isSelected}
        onChange={() => onToggle(question, questionKey, option)}
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
            value={otherValue}
            onChange={(event) => onOtherChange(questionKey, event.target.value)}
            disabled={answered || pending}
            placeholder="Type your answer"
            className="mt-2 w-full rounded-md border border-setta-200 bg-white px-2 py-1 text-xs text-setta-700 focus:border-blue-400 focus:outline-none dark:border-setta-800 dark:bg-setta-900 dark:text-setta-200"
          />
        ) : null}
      </span>
    </label>
  );
}

function QuestionSummary({
  summaryItems,
}: {
  summaryItems: QuestionSummaryItem[];
}) {
  return (
    <div className="flex flex-col gap-3">
      {summaryItems.map((item) => (
        <QuestionSummaryRow key={item.questionKey} item={item} />
      ))}
    </div>
  );
}

function QuestionSummaryRow({ item }: { item: QuestionSummaryItem }) {
  const statusClass = item.isComplete
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
    : "bg-setta-100 text-setta-500 dark:bg-setta-800 dark:text-setta-300";
  return (
    <div className="rounded-md border border-setta-200 bg-setta-50 px-3 py-2 text-xs dark:border-setta-800 dark:bg-setta-900/60">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-setta-400">
            {item.label}
          </span>
          <span className="text-sm font-semibold text-setta-700 dark:text-setta-200">
            {item.questionText}
          </span>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-[10px] font-semibold ${statusClass}`}
        >
          {item.isComplete ? "Ready" : "Incomplete"}
        </span>
      </div>
      <div className="mt-2 text-xs">
        <QuestionSummaryValue
          summaryValue={item.summaryValue}
          needsOther={item.needsOther}
        />
      </div>
    </div>
  );
}

function QuestionSummaryValue({
  summaryValue,
  needsOther,
}: {
  summaryValue: string | null;
  needsOther: boolean;
}) {
  if (summaryValue) {
    return (
      <span className="text-setta-700 dark:text-setta-200">{summaryValue}</span>
    );
  }
  if (needsOther) {
    return (
      <span className="text-amber-600 dark:text-amber-300">
        Add a custom response.
      </span>
    );
  }
  return <span className="text-setta-400">No selection yet.</span>;
}

function QuestionCardFooter({
  answered,
  error,
  helperText,
  hasSummary,
  isSummaryTab,
  activeIndex,
  questionCount,
  showSubmit,
  canSubmit,
  pending,
  onPrevious,
  onNext,
  onSubmit,
}: {
  answered: boolean;
  error: string | null;
  helperText: string;
  hasSummary: boolean;
  isSummaryTab: boolean;
  activeIndex: number;
  questionCount: number;
  showSubmit: boolean;
  canSubmit: boolean;
  pending: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="border-t border-setta-100 bg-setta-50 px-3 py-2 dark:border-setta-800 dark:bg-setta-950/40">
      <div className="flex flex-wrap items-center gap-2">
        <QuestionFooterStatus
          answered={answered}
          error={error}
          helperText={helperText}
        />
        <QuestionFooterActions
          answered={answered}
          hasSummary={hasSummary}
          isSummaryTab={isSummaryTab}
          activeIndex={activeIndex}
          lastTabIndex={lastTabIndex}
          questionCount={questionCount}
          showSubmit={showSubmit}
          canSubmit={canSubmit}
          pending={pending}
          onPrevious={onPrevious}
          onNext={onNext}
          onSubmit={onSubmit}
        />
      </div>
    </div>
  );
}

function QuestionFooterStatus({
  answered,
  error,
  helperText,
}: {
  answered: boolean;
  error: string | null;
  helperText: string;
}) {
  if (error) {
    return <span className="mr-auto text-xs text-red-500">{error}</span>;
  }
  if (answered) {
    return (
      <span className="mr-auto flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
        <IoMdCheckmark className="text-emerald-500" size={12} />
        Submitted
      </span>
    );
  }
  return <span className="mr-auto text-xs text-setta-500">{helperText}</span>;
}

function QuestionFooterActions({
  answered,
  hasSummary,
  isSummaryTab,
  activeIndex,
  questionCount,
  showSubmit,
  canSubmit,
  pending,
  onPrevious,
  onNext,
  onSubmit,
}: {
  answered: boolean;
  hasSummary: boolean;
  isSummaryTab: boolean;
  activeIndex: number;
  questionCount: number;
  showSubmit: boolean;
  canSubmit: boolean;
  pending: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onSubmit: () => void;
}) {
  if (answered) {
    return null;
  }
  return (
    <>
      {hasSummary ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPrevious}
            disabled={activeIndex === 0}
            className="cursor-pointer rounded-md border border-setta-200 px-2 py-1 text-xs font-semibold text-setta-500 transition hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-setta-800 dark:text-setta-300 dark:hover:bg-setta-800/40"
          >
            Previous
          </button>
          {isSummaryTab ? null : (
            <button
              type="button"
              onClick={onNext}
              className="cursor-pointer rounded-md border border-setta-200 px-2 py-1 text-xs font-semibold text-setta-500 transition hover:bg-setta-100 dark:border-setta-800 dark:text-setta-300 dark:hover:bg-setta-800/40"
            >
              {activeIndex === questionCount - 1 ? "Review" : "Next"}
            </button>
          )}
        </div>
      ) : null}
      {showSubmit ? (
        <button
          className="cursor-pointer rounded-md bg-blue-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={onSubmit}
          disabled={!canSubmit || pending}
        >
          Submit
        </button>
      ) : null}
    </>
  );
}
