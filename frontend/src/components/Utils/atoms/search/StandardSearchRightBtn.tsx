import React from "react";

export const StandardSearchRightBtn = React.forwardRef<
  HTMLButtonElement,
  {
    rounded?: string;
    bg?: string;
    size?: string;
    icon?: React.ReactNode;
    iconHostClassName?: string;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(function StandardSearchRightBtn(
  { rounded, bg, size, icon, iconHostClassName, className, ...props },
  ref,
) {
  const classes = [
    "nodrag grid cursor-pointer place-items-center justify-center focus-visible:ring-2",
    bg || "bg-transparent",
    "text-setta-500",
    rounded || "rounded-full",
    "p-0",
    size || "h-10 w-10",
    "hover:bg-blue-500 hover:text-white dark:text-setta-500 dark:hover:bg-blue-700 dark:hover:text-setta-100",
    iconHostClassName,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button ref={ref} className={classes} {...props}>
      {icon}
    </button>
  );
});
