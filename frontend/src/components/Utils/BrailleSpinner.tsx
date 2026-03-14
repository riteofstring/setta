import { useEffect, useState, type ComponentPropsWithoutRef } from "react";
import spinners from "unicode-animations";

const BRAILLE_SPINNER_NAME = "braille" as const;
const BRAILLE_SPINNER = spinners[BRAILLE_SPINNER_NAME];
export const BRAILLE_SPINNER_FRAMES = [...BRAILLE_SPINNER.frames];
export const BRAILLE_SPINNER_INTERVAL_MS = BRAILLE_SPINNER.interval;
export const BRAILLE_SPINNER_RUNTIME_SIZE_CLASS_NAME = "text-[13px]";
export const BRAILLE_SPINNER_COMPACT_SIZE_CLASS_NAME = "text-[11px]";

type BrailleSpinnerProps = Omit<ComponentPropsWithoutRef<"span">, "children">;

export function BrailleSpinner({
  className,
  "aria-hidden": ariaHidden,
  ...props
}: BrailleSpinnerProps) {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setFrameIndex(
        (currentFrameIndex) =>
          (currentFrameIndex + 1) % BRAILLE_SPINNER_FRAMES.length,
      );
    }, BRAILLE_SPINNER_INTERVAL_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const hasAccessibleName =
    props["aria-label"] !== undefined || props["aria-labelledby"] !== undefined;
  const resolvedAriaHidden =
    ariaHidden ?? (hasAccessibleName ? undefined : true);

  return (
    <span
      {...props}
      aria-hidden={resolvedAriaHidden}
      data-unicode-spinner={BRAILLE_SPINNER_NAME}
      className={`inline-flex min-w-[1ch] select-none items-center justify-center font-mono tabular-nums leading-none ${
        className ?? ""
      }`.trim()}
    >
      {BRAILLE_SPINNER_FRAMES[frameIndex]}
    </span>
  );
}
