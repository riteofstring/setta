import { useEffect, useState } from "react";
import { TextInputCodeMirror } from "utils/CodeMirror/TextInputCodeMirror";

export function ParamNameInput({
  sectionId,
  paramInfoId,
  value,
  onBlur,
  hasChildren,
  onClick,
}) {
  const [liveValue, setLiveValue] = useState(value);

  useEffect(() => {
    setLiveValue(value ?? "");
  }, [value]);

  return (
    <TextInputCodeMirror
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      value={liveValue}
      defaultVal={"Please Enter Key"}
      onChange={setLiveValue}
      onBlur={() => onBlur(liveValue)}
      dummyCodeClassName={`mb-0 h-[calc(100%_-_1px)] min-h-[20px] min-w-0 truncate placeholder:text-setta-300 dark:placeholder:text-setta-600 ${hasChildren ? "card-value-full" : "card-key"} nodrag peer row-span-1 cursor-text select-text break-words pl-[6px] pr-[2px] font-mono font-mono text-xs [tab-size:4] [word-break:break-word] dark:focus-visible:border-blue-400`}
      realCodeClassName={`cursor-text select-text [&_.cm-activeLine]:rounded-md [&_.cm-content]:!py-0 [&_.cm-content]:text-xs first:[&_.cm-line>*]:mt-[3px] mb-0 h-[calc(100%_-_1px)] min-h-[20px] min-w-0 truncate placeholder:text-setta-300 dark:placeholder:text-setta-600 ${hasChildren ? "card-value-full" : "card-key"} peer row-span-1 font-mono dark:focus-visible:border-blue-400`}
    />
  );
}
