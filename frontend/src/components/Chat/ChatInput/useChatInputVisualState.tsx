import { useMemo, type ReactNode } from "react";
import { IoSend, IoStop } from "react-icons/io5";
import { CHAT_COMPOSER_GPU_FLOW_CLASS_NAME } from "./shared";

export function useChatInputVisualState({
  isDisabled,
  isDragActive,
  isSubmitDisabled,
  waitingForResponse,
}: {
  isDisabled: boolean;
  isDragActive: boolean;
  isSubmitDisabled: boolean;
  waitingForResponse: boolean;
}): {
  buttonClassName: string;
  buttonIcon: ReactNode;
  textAreaClassName: string;
} {
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
    const base = `${CHAT_COMPOSER_GPU_FLOW_CLASS_NAME} max-h-40 w-full max-w-none flex-1 resize-none overflow-y-auto rounded-md border border-setta-200 bg-transparent py-1.5 pr-9 text-[13px] leading-[1.35] text-setta-800 outline-none [field-sizing:content] hover:bg-setta-100/50 focus:border-blue-500 focus:ring-1 focus:ring-inset focus:ring-blue-500 dark:border-setta-700 dark:text-white dark:hover:bg-setta-800 dark:focus:bg-setta-800/50 dark:focus:border-blue-700 dark:focus:ring-blue-700`;
    const dragClass = isDragActive
      ? "ring-2 ring-blue-400 bg-blue-50/40 dark:bg-blue-900/20"
      : "";
    if (isDisabled) {
      return `${base} ${dragClass} cursor-not-allowed opacity-30`;
    }
    return `${base} ${dragClass} cursor-auto opacity-100`;
  }, [isDisabled, isDragActive]);

  return { buttonClassName, buttonIcon, textAreaClassName };
}
