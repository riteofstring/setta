export function resolveChromeExecutablePath(): string | undefined {
  return process.env.SETTA_CHROME_BIN ?? process.env.CHROME_BIN;
}

export function resolveBrowserLaunchArgs(): string[] {
  return uniqueBrowserArgs([
    ...(process.platform === "darwin" ? ["--use-mock-keychain"] : []),
    "--enable-blink-features=CanvasDrawElement",
    "--enable-unsafe-webgpu",
    "--enable-webgpu-developer-features",
    ...parseChromeExtraArgs(process.env.CHROME_EXTRA_ARGS),
  ]);
}

function parseChromeExtraArgs(value: string | undefined): string[] {
  const trimmed = value?.trim();
  if (!trimmed) {
    return [];
  }
  return trimmed.split(/\s+/);
}

function uniqueBrowserArgs(args: readonly string[]): string[] {
  return [...new Set(args)];
}
