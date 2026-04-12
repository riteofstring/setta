export const PROJECT_AI_ENGINE_COMBOBOX_INPUT_ID = "project-ai-engine-combobox";

type InputSelectionTarget = {
  value: string;
  setSelectionRange: (selectionStart: number, selectionEnd: number) => void;
};

function setInputSelectionToEnd(input: InputSelectionTarget): number {
  const caretPosition = input.value.length;
  input.setSelectionRange(caretPosition, caretPosition);
  return caretPosition;
}

export function focusInputWithoutSelectionById(inputId: string): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  const input = document.getElementById(inputId);
  if (!(input instanceof HTMLInputElement)) {
    return false;
  }
  input.focus({ preventScroll: true });
  setInputSelectionToEnd(input);
  return true;
}
