import type { LaunchOptions } from "@playwright/test";

const CANVAS_DRAW_ELEMENT_FLAG = "--enable-blink-features=CanvasDrawElement";

export function getCanvasFlowChromiumLaunchOptions(): LaunchOptions {
  const args = parseChromeExtraArgs(process.env.CHROME_EXTRA_ARGS);
  if (!hasCanvasDrawElementFlag(args)) {
    args.push(CANVAS_DRAW_ELEMENT_FLAG);
  }

  const options: LaunchOptions = {
    args,
  };
  if (process.env.CHROME_BIN) {
    options.executablePath = process.env.CHROME_BIN;
    return options;
  }
  options.channel = process.env.SETTA_E2E_BROWSER_CHANNEL ?? "chrome";
  return options;
}

function parseChromeExtraArgs(value: string | undefined): string[] {
  return value?.trim() ? value.trim().split(/\s+/) : [];
}

function hasCanvasDrawElementFlag(args: string[]): boolean {
  return args.some(
    (arg) =>
      arg === CANVAS_DRAW_ELEMENT_FLAG ||
      (arg.startsWith("--enable-blink-features=") &&
        arg.includes("CanvasDrawElement")),
  );
}
