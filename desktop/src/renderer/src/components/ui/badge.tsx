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
        danger: "border-status-critical bg-status-critical text-status-critical-foreground",
        neutral: "border-border bg-card text-card-foreground",
        success: "border-status-success bg-status-success text-status-success-foreground",
      },
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
