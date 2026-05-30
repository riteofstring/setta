import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@renderer/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium leading-none",
  {
    defaultVariants: {
      variant: "neutral",
    },
    variants: {
      variant: {
        danger: "border-red-200 bg-red-50 text-red-700",
        neutral: "border-zinc-200 bg-white text-zinc-700",
        success: "border-emerald-200 bg-emerald-50 text-emerald-700",
      },
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
