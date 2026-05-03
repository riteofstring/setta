export function resolveChromeLaunchArgs(): string[] {
  return [
    ...(process.platform === "darwin" ? ["--use-mock-keychain"] : []),
    ...parseChromeExtraArgs(process.env.CHROME_EXTRA_ARGS),
  ];
}

function parseChromeExtraArgs(value: string | undefined): string[] {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return [];
  }
  return trimmedValue.split(/\s+/);
}
