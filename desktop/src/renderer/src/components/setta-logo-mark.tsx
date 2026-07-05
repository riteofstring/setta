import type { CSSProperties } from "react";

import settaLogo from "../../../../img/logo/logo.svg";
import { cn } from "../lib/utils";

interface SettaLogoMarkProps {
  className?: string;
  height: number;
}

export function SettaLogoMark({ className, height }: SettaLogoMarkProps) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={cn("inline-block shrink-0 object-contain", className)}
      draggable={false}
      src={settaLogo}
      style={
        {
          height: `${height}px`,
          width: `${(height * 237) / 99}px`,
        } as CSSProperties
      }
    />
  );
}
