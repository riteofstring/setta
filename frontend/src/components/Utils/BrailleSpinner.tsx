import { useSyncExternalStore, type ComponentPropsWithoutRef } from "react";
import spinners from "unicode-animations";

const BRAILLE_SPINNER_NAME = "braille" as const;
const BRAILLE_SPINNER = spinners[BRAILLE_SPINNER_NAME];
const BRAILLE_SPINNER_FRAMES = [...BRAILLE_SPINNER.frames];
export const BRAILLE_SPINNER_RUNTIME_SIZE_CLASS_NAME = "text-[13px]";
export const BRAILLE_SPINNER_COMPACT_SIZE_CLASS_NAME = "text-[11px]";

let brailleSpinnerFrameIndex = 0;
let brailleSpinnerIntervalId: number | null = null;
const brailleSpinnerListeners = new Set<() => void>();

function emitBrailleSpinnerFrame(): void {
  brailleSpinnerFrameIndex =
    (brailleSpinnerFrameIndex + 1) % BRAILLE_SPINNER_FRAMES.length;
  brailleSpinnerListeners.forEach((listener) => {
    listener();
  });
}

function ensureBrailleSpinnerInterval(): void {
  if (brailleSpinnerIntervalId !== null) {
    return;
  }
  brailleSpinnerIntervalId = window.setInterval(
    emitBrailleSpinnerFrame,
    BRAILLE_SPINNER.interval,
  );
}

function subscribeToBrailleSpinner(listener: () => void): () => void {
  brailleSpinnerListeners.add(listener);
  ensureBrailleSpinnerInterval();
  return () => {
    brailleSpinnerListeners.delete(listener);
    if (brailleSpinnerListeners.size > 0 || brailleSpinnerIntervalId === null) {
      return;
    }
    window.clearInterval(brailleSpinnerIntervalId);
    brailleSpinnerIntervalId = null;
    brailleSpinnerFrameIndex = 0;
  };
}

function getBrailleSpinnerSnapshot(): number {
  return brailleSpinnerFrameIndex;
}

type BrailleSpinnerProps = Omit<ComponentPropsWithoutRef<"span">, "children">;

export function BrailleSpinner({
  className,
  "aria-hidden": ariaHidden,
  ...props
}: BrailleSpinnerProps) {
  const frameIndex = useSyncExternalStore(
    subscribeToBrailleSpinner,
    getBrailleSpinnerSnapshot,
    () => 0,
  );

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
