import { useState } from "react";

export function useEditableOnSubmit(
  initialValue,
  onSetTitle,
  condition = () => true
) {
  const [inputValue, setInputValue] = useState(initialValue);

  function onBlur(v) {
    if (v != "" && condition(v)) {
      onSetTitle(v);
    } else {
      setInputValue(initialValue);
    }
  }

  function onCancel() {
    setInputValue(initialValue);
  }

  return [inputValue, setInputValue, onBlur, onCancel];
}
