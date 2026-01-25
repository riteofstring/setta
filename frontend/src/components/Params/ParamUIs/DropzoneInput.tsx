import { type DragEvent } from "react";
import { FiUploadCloud } from "react-icons/fi";
import {
  NO_DRAG_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "utils/constants";

type DropzoneInputProps = {
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  isDisabled?: boolean;
};

export function DropzoneInput({
  value,
  onChange,
  placeholder = "Drop a file here",
  className,
  isDisabled = false,
}: DropzoneInputProps) {
  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!onChange || isDisabled) {
      return;
    }
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
      onChange(files.map((file) => file.name).join(", "));
      return;
    }
    const text = event.dataTransfer.getData("text");
    if (text) {
      onChange(text);
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
  }

  const label = value === "" ? placeholder : value;
  const disabledClassName = isDisabled ? "opacity-60" : "";
  const wrapperClassName = `${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${NO_DRAG_CLASS_NAME} section-value flex w-full items-center justify-center gap-2 rounded-xl border-4 border-dashed border-setta-300 bg-setta-50/70 px-4 py-3 text-center text-xs font-bold uppercase tracking-widest text-setta-500/80 dark:border-setta-700 dark:bg-setta-900/50 dark:text-setta-500 ${disabledClassName} ${className ?? ""}`;

  return (
    <div
      className={wrapperClassName}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      aria-disabled={isDisabled}
    >
      <FiUploadCloud className="text-base" />
      <span className="break-all">{label}</span>
    </div>
  );
}
