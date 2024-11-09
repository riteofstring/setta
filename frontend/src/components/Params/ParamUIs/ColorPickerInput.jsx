export function ColorPickerInputConfig() {
  return null;
}

export function ColorPickerInput({ value, onChange, wrapperClassName }) {
  return (
    <div className={wrapperClassName}>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-8 min-w-8 cursor-pointer rounded-full p-0"
      />
    </div>
  );
}
