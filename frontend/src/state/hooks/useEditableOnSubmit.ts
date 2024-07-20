import { useEffect, useState } from "react";

export function useEditableOnSubmit<T>(
  initialValue: T,
  onSetTitle: (x: T) => void,
  condition: (x: T) => boolean = () => true,
) {
  const [inputValue, setInputValue] = useState(initialValue);

  function onBlur(v) {
    if (v != "" && v != initialValue && condition(v)) {
      onSetTitle(v);
    } else {
      setInputValue(initialValue);
    }
  }

  function onCancel() {
    setInputValue(initialValue);
  }

  useEffect(() => {
    setInputValue(initialValue);
  }, [initialValue]);

  return [inputValue, setInputValue, onBlur, onCancel];
}
