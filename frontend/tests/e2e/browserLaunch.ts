export function resolveChromeExecutablePath(): string | undefined {
  return process.env.SETTA_CHROME_BIN ?? process.env.CHROME_BIN;
}

export function resolveBrowserLaunchArgs(): string[] {
  return [
    ...(process.platform === "darwin" ? ["--use-mock-keychain"] : []),
    ...parseChromeExtraArgs(process.env.CHROME_EXTRA_ARGS),
  ];
}

function parseChromeExtraArgs(value: string | undefined): string[] {
  const trimmed = value?.trim();
  if (!trimmed) {
    return [];
  }
  return trimmed.split(/\s+/);
}
