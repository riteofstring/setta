import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@renderer/lib/utils";

const buttonVariants = cva(
  "inline-flex h-7 items-center justify-center gap-1.5 rounded-sm border px-2 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    defaultVariants: {
      variant: "secondary",
    },
    variants: {
      variant: {
        primary: "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
        secondary:
          "border-border bg-card text-card-foreground hover:bg-accent hover:text-accent-foreground",
      },
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, type = "button", variant, ...props },
  ref,
) {
  return (
    <button
      className={cn(buttonVariants({ variant }), className)}
      ref={ref}
      type={type}
      {...props}
    />
  );
});
