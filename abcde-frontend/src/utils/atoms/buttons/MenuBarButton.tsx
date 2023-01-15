import { ButtonHTMLAttributes, forwardRef } from "react";
import { Button } from "./Button";

interface MenuBarButtonTypes extends ButtonHTMLAttributes<HTMLButtonElement> {
  onClick?: any;
  children?: any;
  theRest?: any;
}

export const twClasses =
  "bg-white hover:bg-gray-100 text-xs font-bold text-gray-700 py-1 px-2 rounded-md gap-1 select-none self-center";

export const MenuBarButton = forwardRef<HTMLButtonElement, MenuBarButtonTypes>(
  ({ onClick, children, type, ...theRest }, ref) => {
    return (
      <Button
        twClasses={twClasses}
        {...theRest}
        ref={ref}
        type={type}
        onClick={onClick}
      >
        {children}
      </Button>
    );
  }
);
