import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@renderer/lib/utils";

const buttonVariants = cva(
  "inline-flex h-7 items-center justify-center gap-1.5 rounded-sm border px-2 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    defaultVariants: {
      variant: "secondary",
    },
    variants: {
      variant: {
        primary: "border-zinc-950 bg-zinc-950 text-white hover:bg-zinc-800",
        secondary: "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50",
      },
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant }), className)} {...props} />;
}
