export function TextInputConfig() {
  return null;
}

export function TextInput({
  value,
  defaultVal,
  onChange,
  isDisabled,
  className,
}) {
  const _className = className + " border-b border-slate-700 text-xs";
  const classes =
    "nodrag border-0 border-b cursor-auto border-slate-400 border-solid text-sm dark:text-slate-300 font-code pb-1 focus-visible:border-blue-400";

  return value.map((v, i) => (
    <input
      key={i}
      placeholder={defaultVal}
      disabled={isDisabled}
      value={v.value}
      onChange={(e) => onChange(i, "raw", e.target.value)}
      className={classes}
    />
  ));
}
