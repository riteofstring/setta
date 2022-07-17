import { useState } from "react";

export function useEditableOnSubmit(
  initialValue,
  onSetTitle,
  condition = () => true
) {
  const [inputValue, setInputValue] = useState(initialValue);

  const onBlur = (v) => {
    if (v != "" && condition(v)) {
      onSetTitle(v);
    } else {
      setInputValue(initialValue);
    }
  };

  return [inputValue, setInputValue, onBlur];
}
