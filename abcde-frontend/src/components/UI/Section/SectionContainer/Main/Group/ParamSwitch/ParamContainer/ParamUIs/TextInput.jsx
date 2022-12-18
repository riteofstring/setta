export function TextInputConfig() {
  return null;
}

export default function TextInput({
  value,
  defaultVal,
  onChange,
  onBlur,
  isDisabled,
  className,
}) {
  const _className = className + " text-xs max-w-[10rem]";

  return (
    <input
      placeholder={defaultVal}
      disabled={isDisabled}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => onBlur(e.target.value)}
      className={_className}
    />
  );
}
