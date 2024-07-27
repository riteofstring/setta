import { TextInputCodeMirror } from "utils/CodeMirror/TextInputCodeMirror";

export function TextInputConfig() {
  return null;
}

export function TextInput({
  sectionId,
  paramInfoId,
  value,
  defaultVal,
  onChange,
  isDisabled,
}) {
  return (
    <TextInputCodeMirror
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      value={value}
      defaultVal={defaultVal}
      onChange={onChange}
      dummyCodeClassName="card-value nodrag cursor-text select-text break-words pl-[6px] pr-[2px] font-mono text-xs [tab-size:4] [word-break:break-word]"
      realCodeClassName="nodrag [&_*]:!outline-0 cursor-text select-text [&_.cm-activeLine]:rounded-md [&_.cm-content]:!py-0 [&_.cm-content]:text-xs first:[&_.cm-line>*]:mt-[3px] card-value"
    />
  );
}
// bg-white/50 dark:bg-setta-900 rounded-md
