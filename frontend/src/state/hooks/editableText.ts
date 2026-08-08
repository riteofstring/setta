import { useEffect, useRef, useState } from "react";

export function resolveEditableOnBlurRawValue({
  latestValue,
  eventOrValue,
}: {
  latestValue: string;
  eventOrValue: React.FocusEvent<HTMLInputElement> | string;
}): string {
  // Some callers (e.g. CodeMirror) can't provide an <input> blur event. In
  // those cases, passing a string is convenient, but it can be stale if the
  // component blurs immediately after a fast onChange. Prefer the latest value
  // captured by onChange.
  if (typeof eventOrValue === "string") {
    return latestValue;
  }
  return eventOrValue.target.value;
}

export function useEditableOnSubmit(
  initialValue: string,
  onSetTitle: (x: string) => void,
  condition: (x: string) => boolean | Promise<boolean>,
  allowEmpty = false,
  normalize: (x: string) => string = (x) => x,
) {
  const [inputValue, setInputValue] = useState(initialValue);
  const blurTriggeredByEscapeKey = useRef(false);
  const latestValueRef = useRef(initialValue);

  function onChange(e: React.ChangeEvent<HTMLInputElement> | string) {
    if (typeof e === "string") {
      latestValueRef.current = e;
      setInputValue(e);
    } else {
      latestValueRef.current = e.target.value;
      setInputValue(e.target.value);
    }
  }

  async function onBlur(event: React.FocusEvent<HTMLInputElement> | string) {
    if (blurTriggeredByEscapeKey.current) {
      blurTriggeredByEscapeKey.current = false;
      return;
    }
    const rawValue = resolveEditableOnBlurRawValue({
      latestValue: latestValueRef.current,
      eventOrValue: event,
    });
    latestValueRef.current = rawValue;
    const v = normalize(rawValue);
    if (v !== rawValue) {
      latestValueRef.current = v;
      setInputValue(v);
    }
    if ((allowEmpty || v != "") && v != initialValue && (await condition(v))) {
      latestValueRef.current = v;
      onSetTitle(v);
    } else {
      latestValueRef.current = initialValue;
      setInputValue(initialValue);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.code === "Escape") {
      blurTriggeredByEscapeKey.current = true;
      event.currentTarget.blur();
      latestValueRef.current = initialValue;
      setInputValue(initialValue);
    } else if (event.code === "Enter") {
      event.currentTarget.blur();
    }
  }

  useEffect(() => {
    latestValueRef.current = initialValue;
    setInputValue(initialValue);
  }, [initialValue]);

  return { inputValue, onChange, onBlur, onKeyDown, blurTriggeredByEscapeKey };
}
