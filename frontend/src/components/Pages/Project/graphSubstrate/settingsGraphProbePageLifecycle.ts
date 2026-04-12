export type SettingsGraphPageLifecycleDiagnostic = {
  browserConnected: boolean | null;
  openPageCount: number;
  pageClosed: boolean;
  pageUrl: string;
};

export function isSettingsGraphPageLifecycleClosureError(
  error: unknown,
): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("Target page, context or browser has been closed") ||
    error.message.includes("Target closed") ||
    error.message.includes("Browser has been closed") ||
    error.message.includes("Context closed")
  );
}

export function canRecoverSettingsGraphClosedPage(
  diagnostic: SettingsGraphPageLifecycleDiagnostic,
): boolean {
  return (
    diagnostic.browserConnected === true &&
    diagnostic.pageClosed &&
    diagnostic.pageUrl.length > 0
  );
}

export function formatSettingsGraphPageLifecycleDiagnostic(
  diagnostic: SettingsGraphPageLifecycleDiagnostic,
): string {
  return JSON.stringify(diagnostic);
}
