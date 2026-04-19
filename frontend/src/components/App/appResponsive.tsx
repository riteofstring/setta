import React from "react";

type AppBreakpoint = "base" | "sm" | "md" | "lg" | "xl" | "2xl";

const BREAKPOINTS: Array<{ name: AppBreakpoint; minWidth: number }> = [
  { name: "2xl", minWidth: 1536 },
  { name: "xl", minWidth: 1280 },
  { name: "lg", minWidth: 1024 },
  { name: "md", minWidth: 768 },
  { name: "sm", minWidth: 640 },
  { name: "base", minWidth: 0 },
];

const BREAKPOINT_FALLBACK: Record<AppBreakpoint, AppBreakpoint[]> = {
  "2xl": ["2xl", "xl", "lg", "md", "sm", "base"],
  xl: ["xl", "lg", "md", "sm", "base"],
  lg: ["lg", "md", "sm", "base"],
  md: ["md", "sm", "base"],
  sm: ["sm", "base"],
  base: ["base"],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolveBreakpoint(width: number): AppBreakpoint {
  for (const bp of BREAKPOINTS) {
    if (width >= bp.minWidth) {
      return bp.name;
    }
  }
  return "base";
}

const AppBreakpointContext = React.createContext<AppBreakpoint>("base");

export function AppBreakpointProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [breakpoint, setBreakpoint] = React.useState<AppBreakpoint>(() => {
    if (typeof window === "undefined") {
      return "base";
    }
    return resolveBreakpoint(window.innerWidth);
  });

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = resolveBreakpoint(window.innerWidth);
        setBreakpoint((prev) => (prev === next ? prev : next));
      });
    };

    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <AppBreakpointContext.Provider value={breakpoint}>
      {children}
    </AppBreakpointContext.Provider>
  );
}

export function useAppBreakpoint(): AppBreakpoint {
  return React.useContext(AppBreakpointContext);
}

export function resolveResponsiveValue(
  value: unknown,
  breakpoint: AppBreakpoint,
): unknown {
  if (!isRecord(value)) {
    return value;
  }
  const keys = Object.keys(value);
  if (keys.length === 0) {
    return undefined;
  }
  const hasBreakpointKey = keys.some((key) =>
    Object.prototype.hasOwnProperty.call(BREAKPOINT_FALLBACK, key),
  );
  if (!hasBreakpointKey) {
    return value;
  }
  for (const key of BREAKPOINT_FALLBACK[breakpoint]) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      return value[key];
    }
  }
  return undefined;
}
