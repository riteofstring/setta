import type { CSSProperties } from "react";

import settaLogo from "../../../../img/logo/logo.svg";
import { cn } from "../lib/utils";

interface SettaLogoMarkProps {
  className?: string;
  height: number;
}

export function SettaLogoMark({ className, height }: SettaLogoMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block shrink-0 bg-[color:var(--setta-logo)]", className)}
      style={
        {
          "--setta-logo-height": `${height}px`,
          height: "var(--setta-logo-height)",
          mask: `url(${settaLogo}) center / contain no-repeat`,
          WebkitMask: `url(${settaLogo}) center / contain no-repeat`,
          width: `calc(var(--setta-logo-height) * 237 / 99)`,
        } as CSSProperties
      }
    />
  );
}
