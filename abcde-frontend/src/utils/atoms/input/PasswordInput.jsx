import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";

export function PasswordInput({
  label = "Password",
  id,
  name,
  placeholder,
  show,
  value,
  onChange,
  onBlur,
  onClick,
}) {
  console.log("show: ", show);
  return (
    <div className="flex flex-col">
      <label className="text-xs select-none">{label}</label>
      <div className="[&:has(input:focus-visible)]:border-blue-500 flex [border-width:0_0_2px_0] border-solid border-gray-100">
        <input
          id={id ? id : label}
          name={id ? id : name ? name : label}
          placeholder={placeholder ? placeholder : label}
          type={show ? "text" : "password"}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          className="py-2 flex-grow"
        />
        <MenuBarButton type="button" onClick={onClick}>
          {show ? "Hide" : "Show"}
        </MenuBarButton>
      </div>
    </div>
  );
}
