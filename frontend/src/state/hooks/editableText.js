import { useEffect, useState } from "react";

export function useEditableOnSubmit(initialValue, onSetTitle, condition) {
  const [inputValue, setInputValue] = useState(initialValue);

  async function onBlur(v) {
    if (v != "" && v != initialValue && (await condition(v))) {
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
