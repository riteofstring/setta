export function FileNameInput({ value, placeholder, onChange }) {
  return (
    <input
      className="w-full flex-grow cursor-auto border-b border-solid border-runcoder-300 bg-transparent py-1 text-runcoder-500 placeholder-runcoder-200 outline-0 [border-width:0_0_1px_0] focus-visible:border-blue-300 dark:border-runcoder-600 dark:text-runcoder-200 dark:placeholder-runcoder-600"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
