import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  memo,
  useCallback,
  useMemo,
  useState,
} from "react";
import { IoSend, IoStop } from "react-icons/io5";

type ChatInputProps = {
  placeholderText: string | undefined;
  waitingForResponse: boolean;
  disabled?: boolean;
  submitDisabled?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  onSubmit: (message: string) => Promise<boolean | void> | boolean | void;
  onStop?: () => Promise<void> | void;
};

export const ChatInput = memo(function ChatInput({
  placeholderText,
  waitingForResponse,
  disabled = false,
  submitDisabled = false,
  value,
  onChange,
  onSubmit,
  onStop,
}: ChatInputProps) {
  const [internalValue, setInternalValue] = useState("");
  const isControlled = typeof value === "string" && Boolean(onChange);
  const inputValue = isControlled ? value : internalValue;
  const isDisabled = disabled;
  const isSubmitDisabled = submitDisabled || isDisabled;

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const nextValue = event.target.value;
      if (isControlled) {
        onChange?.(nextValue);
        return;
      }
      setInternalValue(nextValue);
      onChange?.(nextValue);
    },
    [isControlled, onChange],
  );

  const clearInput = useCallback(() => {
    if (isControlled) {
      onChange?.("");
      return;
    }
    setInternalValue("");
    onChange?.("");
  }, [isControlled, onChange]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (waitingForResponse) {
        if (onStop) {
          await onStop();
        }
        return;
      }
      if (isSubmitDisabled) {
        return;
      }

      const trimmedInput = inputValue.trim();
      if (trimmedInput.length === 0) {
        return;
      }

      const submittedValue = inputValue;
      const result = await onSubmit(submittedValue);
      if (result !== false) {
        clearInput();
      }
    },
    [
      clearInput,
      inputValue,
      isSubmitDisabled,
      onStop,
      onSubmit,
      waitingForResponse,
    ],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (
        event.key !== "Enter" ||
        event.shiftKey ||
        waitingForResponse ||
        isSubmitDisabled
      ) {
        return;
      }
      event.preventDefault();
      const formEvent = new Event("submit", {
        bubbles: true,
        cancelable: true,
      });
      event.currentTarget.form?.dispatchEvent(formEvent);
    },
    [isSubmitDisabled, waitingForResponse],
  );

  const buttonIcon = useMemo(() => {
    if (waitingForResponse) {
      return <IoStop />;
    }
    return <IoSend />;
  }, [waitingForResponse]);

  const buttonClassName = useMemo(() => {
    if (waitingForResponse) {
      return "text-setta-300 dark:text-setta-600";
    }
    if (isSubmitDisabled) {
      return "text-setta-300 dark:text-setta-600";
    }
    return "text-setta-500 hover:text-blue-500 focus:text-blue-500";
  }, [isSubmitDisabled, waitingForResponse]);

  const textAreaClassName = useMemo(() => {
    const base =
      "nodrag prose prose-sm my-2 max-h-48 flex-1 resize-none overflow-y-auto rounded-lg border border-setta-200 bg-transparent px-4 py-2 text-setta-800 outline-none [field-sizing:content] hover:bg-setta-100/50 focus:outline-none focus:outline focus:outline-blue-500 dark:border-setta-700 dark:text-white dark:hover:bg-setta-800 dark:focus:bg-setta-800/50 dark:focus:outline-blue-700";
    if (isDisabled) {
      return `${base} cursor-not-allowed opacity-30`;
    }
    return `${base} cursor-auto opacity-100`;
  }, [isDisabled]);

  return (
    <form onSubmit={handleSubmit} className="flex justify-center">
      <div className="flex w-full max-w-xl gap-2">
        <textarea
          type="text"
          value={inputValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholderText}
          className={textAreaClassName}
          disabled={isDisabled}
        />
        <button
          type="submit"
          disabled={isSubmitDisabled}
          className={`mb-5 cursor-pointer self-end px-2 py-0.5 ${buttonClassName} focus:outline-none focus:ring-0 disabled:opacity-40 dark:hover:text-blue-700`}
        >
          {buttonIcon}
        </button>
      </div>
    </form>
  );
});
