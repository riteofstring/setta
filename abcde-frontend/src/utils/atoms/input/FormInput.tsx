import { AuthInputTypes } from "./AuthInputTypes";

export function FormInput({
  label,
  id,
  name,
  placeholder,
  value,
  onChange,
  onBlur,
}: AuthInputTypes) {
  return (
    <div className="flex flex-col">
      <label className="text-xs select-none">{label}</label>
      <input
        id={id ? id : label}
        name={id ? id : name ? name : label}
        placeholder={placeholder ? placeholder : label}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        className="[border-width:0_0_2px_0] border-solid border-gray-100 py-2 focus-visible:border-blue-500"
      />
    </div>
  );
}
