import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@renderer/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[11px] font-medium leading-none",
  {
    defaultVariants: {
      variant: "neutral",
    },
    variants: {
      variant: {
        danger: "border-zinc-700 bg-zinc-900 text-zinc-100",
        neutral: "border-zinc-200 bg-white text-zinc-700",
        success: "border-zinc-300 bg-zinc-100 text-zinc-900",
      },
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
