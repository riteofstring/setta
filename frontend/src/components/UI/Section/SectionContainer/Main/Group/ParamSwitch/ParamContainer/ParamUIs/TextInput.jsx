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
  className,
  classes,
  variants,
  area = "card-value",
}) {
  return (
    <TextInputCodeMirror
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      value={value}
      defaultVal={defaultVal}
      onChange={onChange}
      className={"nodrag"}
    />
  );
}
