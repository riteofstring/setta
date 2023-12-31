import { ButtonHTMLAttributes, forwardRef } from "react";
import { Button } from "./Button";

interface MenuBarButtonTypes extends ButtonHTMLAttributes<HTMLButtonElement> {
  onClick?: any;
  children?: any;
  theRest?: any;
}

const twClasses =
  "bg-white dark:bg-transparent hover:bg-slate-100 dark:hover:bg-runcoder-900 text-xs font-semibold text-runcoder-700 dark:text-runcoder-100 py-1 px-2 rounded-md gap-1 select-none self-center";

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
