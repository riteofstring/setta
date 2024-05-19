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
      // variants="bg-white dark:bg-transparent"
      classes={classes}
      area={area}
    />
  );
}
// bg-white/50 dark:bg-runcoder-900 rounded-md
