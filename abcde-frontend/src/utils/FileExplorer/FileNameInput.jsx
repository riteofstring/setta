export default function FileNameInput({ value, placeholder, onChange }) {
  return (
    <input
      className="mt-5 w-full"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
