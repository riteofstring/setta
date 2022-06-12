import { useState } from "react";

export function useEditableOnSubmit(initialValue, onSetTitle) {
  const [inputValue, setInputValue] = useState(initialValue);

  const onBlur = (v) => {
    if (v != "") {
      onSetTitle(v);
    } else {
      setInputValue(initialValue);
    }
  };

  return [inputValue, setInputValue, onBlur];
}
