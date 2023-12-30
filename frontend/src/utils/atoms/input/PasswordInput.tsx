import { useState } from "react";
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";
import { AuthInputTypes } from "./AuthInputTypes";

export function PasswordInput({
  label = "Password",
  id,
  name,
  placeholder,
  value,
  onChange,
  onBlur,
}: AuthInputTypes) {
  const [show, setShow] = useState(false);
  const handleClick = () => setShow(!show);
  return (
    <div className="flex flex-col">
      <label className="select-none text-xs">{label}</label>
      <div className="flex border-solid border-slate-100 [border-width:0_0_2px_0] [&:has(input:focus-visible)]:border-blue-500">
        <input
          id={id ? id : label}
          name={id ? id : name ? name : label}
          placeholder={placeholder ? placeholder : label}
          type={show ? "text" : "password"}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          className="flex-grow py-2"
        />
        <MenuBarButton type="button" onClick={handleClick}>
          {show ? "Hide" : "Show"}
        </MenuBarButton>
      </div>
    </div>
  );
}
