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
    <TextInputCodeMirror
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      value={liveValue}
      defaultVal={"Please Enter Key"}
      onChange={setLiveValue}
      onBlur={() => onBlur(liveValue)}
      className={`mb-0 h-[calc(100%_-_1px)] min-h-[20px] min-w-0 truncate placeholder:text-setta-300 dark:placeholder:text-setta-600 ${hasChildren ? "card-value-full" : "card-key"} row-span-1 font-mono dark:focus-visible:border-blue-400`}
      // variants="bg-white dark:bg-transparent"
      // classes={classes}
      // area={area}
    />
  );
}
