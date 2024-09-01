import { TextInputCodeMirror } from "components/Utils/CodeMirror/TextInputCodeMirror";
import { useEffect, useState } from "react";
import { useCodeInfo, useParamShortcuts } from "state/definitions";

export function ParamNameInput({
  sectionId,
  paramInfoId,
  value,
  onBlur,
  hasChildren,
  setDidUpdate,
}) {
  const [liveValue, setLiveValue] = useState(value);

  function onChange(v) {
    setLiveValue(v);
    setDidUpdate(true);
  }

  useEffect(() => {
    setLiveValue(value ?? "");
  }, [value]);

  const isDisabled = useParamShortcuts((x) => x.isSelectingParams);
  const isSelected = useCodeInfo((x) => x.x[paramInfoId].isSelected);
  const bg = isSelected ? "bg-lime-400/50" : "";

  return (
    <>
      <TextInputCodeMirror
        sectionId={sectionId}
        paramInfoId={paramInfoId}
        value={liveValue}
        defaultVal={"Please Enter Key"}
        onChange={onChange}
        onBlur={() => onBlur(liveValue)}
        dummyCodeClassName={`${bg} min-w-0 self-end truncate placeholder:text-setta-300 dark:placeholder:text-setta-600 ${hasChildren ? "section-key-value grid-row-start-1" : "section-key"} nodrag peer ${!isDisabled ? "cursor-text select-text" : ""} break-words py-[.125rem] font-mono text-xs [tab-size:4] [word-break:break-word] dark:focus-visible:border-blue-400`}
        realCodeClassName={`${bg} nodrag cursor-text self-end select-text [&_*]:!outline-0 [&_.cm-activeLine]:!px-0 [&_.cm-activeLine]:!bg-setta-200/10 [&_.cm-content]:!py-0 [&_.cm-content]:!px-0 [&_.cm-line]:!px-0 [&_.cm-content]:text-xs min-w-0 truncate placeholder:text-setta-300 dark:placeholder:text-setta-600 py-[.125rem] ${hasChildren ? "section-key-value grid-row-start-1" : "section-key"} peer font-mono dark:focus-visible:border-blue-400`}
        color="green"
        language="python"
        keywordPositions={[]}
        setKeywordPositions={() => {}}
        initializeGenCode={false}
        autocomplete={false}
        isKeyName={true}
        isDisabled={isDisabled}
      />
      <span
        className={`${hasChildren ? "section-key-value grid-row-start-1" : "section-key"} border-box self-end border-b border-setta-100 peer-focus-within:border-blue-400 dark:border-setta-800`}
      />
    </>
  );
}
