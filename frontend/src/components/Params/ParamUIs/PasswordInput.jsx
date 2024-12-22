export function PasswordInput({ className, value, onChange, isDisabled }) {
  return (
    <input
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      isDisabled={isDisabled}
      type="password"
    />
  );
}
