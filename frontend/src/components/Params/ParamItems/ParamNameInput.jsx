import { useEffect, useState } from "react";
import { TextInputCodeMirror } from "components/Utils/CodeMirror/TextInputCodeMirror";

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
    <>
      <TextInputCodeMirror
        sectionId={sectionId}
        paramInfoId={paramInfoId}
        value={liveValue}
        defaultVal={"Please Enter Key"}
        onChange={setLiveValue}
        onBlur={() => onBlur(liveValue)}
        dummyCodeClassName={`min-w-0 truncate placeholder:text-setta-300 dark:placeholder:text-setta-600 ${hasChildren ? "section-key-value grid-row-start-1" : "section-key"} nodrag peer cursor-text select-text break-words pl-[6px] pr-[2px] py-1 font-mono text-xs [tab-size:4] [word-break:break-word] dark:focus-visible:border-blue-400`}
        realCodeClassName={`cursor-text select-text [&_*]:!outline-0 [&_.cm-activeLine]:rounded-md [&_.cm-content]:!py-0 [&_.cm-content]:text-xs first:[&_.cm-line>*]:mt-[3px] min-w-0 truncate placeholder:text-setta-300 dark:placeholder:text-setta-600 py-1 ${hasChildren ? "section-key-value grid-row-start-1" : "section-key"} peer font-mono dark:focus-visible:border-blue-400`}
      />
      <span
        className={`${hasChildren ? "section-key-value grid-row-start-1" : "section-key"} border-box self-end border-b border-setta-300 peer-focus-within:border-blue-400 dark:border-setta-700`}
      />
    </>
  );
}
