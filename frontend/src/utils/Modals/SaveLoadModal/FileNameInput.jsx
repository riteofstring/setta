export function FileNameInput({ value, placeholder, onChange }) {
  return (
    <input
      className="w-full flex-grow cursor-auto border-solid border-runcoder-300 bg-transparent py-1 outline-0 [border-width:0_0_1px_0] focus-visible:border-blue-300 dark:border-runcoder-800"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
