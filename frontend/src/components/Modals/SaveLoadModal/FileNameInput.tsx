export function FileNameInput({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (newValue: string) => void;
}) {
  return (
    <input
      className="h-8 w-full flex-grow cursor-auto rounded-md border border-setta-200 bg-white px-2 text-xs text-setta-700 placeholder-setta-300 outline-0 focus:border-blue-500 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200 dark:placeholder-setta-600"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
