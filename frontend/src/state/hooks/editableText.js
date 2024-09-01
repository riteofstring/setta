import C from "constants/constants.json";
import { useEffect, useState } from "react";
import { useIsListElement, useIsOneOfType } from "./uiTypes";

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

export function useTitleIsEditable(sectionId) {
  const isUneditableType = useIsOneOfType(sectionId, [
    C.ARTIFACT,
    C.GLOBAL_VARIABLES,
    C.PARAM_SWEEP,
    C.GLOBAL_PARAM_SWEEP,
  ]);

  const isListElement = useIsListElement(sectionId);

  return !isListElement && !isUneditableType;
}
