import React from "react";

export const StandardSearchRightBtn = React.forwardRef<
  HTMLButtonElement,
  {
    rounded?: string;
    bg?: string;
    size?: string;
    icon: React.ReactNode;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(function StandardSearchRightBtn(
  { rounded, bg, size, icon, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`focus-visible:ring-2 grid place-items-center nodrag cursor-pointer flex justify-center ${
        bg || "bg-transparent"
      } text-setta-500 ${
        rounded || "rounded-full"
      } p-0 ${size || "w-10 h-10"} absolute right-0 hover:bg-blue-500 dark:hover:bg-blue-700 hover:text-white dark:text-setta-500 dark:hover:text-setta-100`}
      {...props}
    >
      {icon}
    </button>
  );
});
