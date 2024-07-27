import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonTypes extends ButtonHTMLAttributes<HTMLButtonElement> {
  twClasses?: string;
  grid?: boolean;
  as?: string;
  type?: React.ButtonHTMLAttributes<HTMLButtonElement>["type"];
  onClick?: any;
  children?: any;
  theRest?: any;
}

export const Button = forwardRef<HTMLButtonElement, ButtonTypes>(
  (props, ref) => {
    const {
      twClasses = "",
      grid = false,
      type,
      onClick,
      children,
      ...theRest
    } = props;
    const gridStatus = grid
      ? "grid place-items-center"
      : "inline-flex items-center";

    const classes = `focus-visible:ring-2 ${gridStatus} nodrag cursor-pointer ${twClasses} `;

    return (
      <button
        className={classes}
        {...theRest}
        ref={ref}
        type={type}
        onClick={onClick}
      >
        {children}
      </button>
    );
  },
);
