import { AppShell } from "components/Pages/AppShell";
import { useEffect } from "react";
import { initializeServerMode } from "state/actions/serverMode";
import { useServerMode } from "state/definitions";
import {
  resolveModeElementForServerMode,
  type ModeRouteElements,
} from "./modeRouteResolver";

export function ModeWrappedRouteBoundary({
  ide,
  share,
  app,
  launcher,
}: ModeRouteElements) {
  const { mode, modeResolved, modeError } = useServerMode((x) => x);

  useEffect(() => {
    if (!modeResolved) {
      void initializeServerMode();
    }
  }, [modeResolved]);

  if (!modeResolved) {
    return (
      <AppShell
        isLoading
        loadingContent={
          <div className="flex flex-col items-center gap-3 text-xs text-setta-500 dark:text-setta-200">
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-setta-500/70 border-t-transparent dark:border-setta-600 dark:border-t-transparent" />
            <p>Checking server mode...</p>
          </div>
        }
      >
        <div />
      </AppShell>
    );
  }

  if (modeError) {
    return (
      <AppShell isLoading={false} loadingContent={null}>
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-10">
          <div className="w-full max-w-xl rounded-2xl border border-setta-200 bg-white p-6 text-setta-900 shadow-sm dark:border-setta-800 dark:bg-setta-950 dark:text-setta-50">
            <h1 className="text-base font-semibold">Unable to load app</h1>
            <p className="mt-2 text-sm text-setta-600 dark:text-setta-300">
              {modeError}
            </p>
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                className="rounded-lg bg-setta-900 px-4 py-2 text-sm font-semibold text-white hover:bg-setta-800 dark:bg-setta-200 dark:text-setta-950 dark:hover:bg-setta-300"
                onClick={() => {
                  useServerMode.setState({
                    mode: null,
                    modeResolved: false,
                    modeError: null,
                  });
                }}
              >
                Retry
              </button>
              <p className="text-xs text-setta-500 dark:text-setta-400">
                Make sure the backend is running and reachable.
              </p>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return resolveModeElementForServerMode(mode, {
    ide,
    share,
    app,
    launcher,
  });
}
