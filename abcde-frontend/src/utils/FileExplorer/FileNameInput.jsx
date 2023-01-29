export function FileNameInput({ value, placeholder, onChange }) {
  return (
    <input
      className="flex-grow outline-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-gray-300 focus-visible:border-blue-300 py-1 w-full"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
