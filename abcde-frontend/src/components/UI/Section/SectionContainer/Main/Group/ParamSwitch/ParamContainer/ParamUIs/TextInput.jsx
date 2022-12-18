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
  const _className =
    className + " border-b border-gray-700 text-xs max-w-[10rem]";

  return (
    <input
      placeholder={defaultVal}
      disabled={isDisabled}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => onBlur(e.target.value)}
      // className={_className}
      className="border-0 border-b focus:border-b-2 border-gray-200 border-solid text-xs max-w-[10rem] pb-1 focus:border-blue-300"
    />
  );
}
