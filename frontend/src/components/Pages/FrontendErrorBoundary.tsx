import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useEffect,
} from "react";
import { addBackendLogEvent } from "state/actions/backendLogEvents";
import {
  NULL_PROJECT_CONFIG_ID,
  useProjectState,
} from "state/definitions";
import type { SettaBackendLogEvent } from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import { getNowTimestamp } from "utils/timestamps";

type FrontendErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

type FrontendErrorSource =
  | "react-error-boundary"
  | "window-error"
  | "unhandledrejection";

type FrontendErrorPayload = {
  source: FrontendErrorSource;
  error: unknown;
  detail?: string;
};

export function FrontendErrorBoundary({
  children,
}: FrontendErrorBoundaryProps) {
  useFrontendErrorListeners();
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

class ErrorBoundary extends Component<
  FrontendErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: FrontendErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const message = error.message || "Unexpected error";
    return { hasError: true, message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const componentStack = info.componentStack.trim();
    logFrontendError({
      source: "react-error-boundary",
      error,
      detail: componentStack ? `Component stack:\n${componentStack}` : undefined,
    });
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback message={this.state.message} />;
    }
    return this.props.children;
  }
}

function ErrorFallback({ message }: { message: string }) {
  const displayMessage = message || "Unexpected error";
  return (
    <div className="app-shell flex min-h-screen min-w-full flex-col items-center justify-center gap-4 bg-setta-light px-6 text-setta-700 dark:bg-setta-dark dark:text-setta-100">
      <div className="text-sm uppercase tracking-[0.3em] text-red-500">
        Frontend error
      </div>
      <div className="max-w-2xl whitespace-pre-wrap text-center text-xs text-setta-500 dark:text-setta-300">
        {displayMessage}
      </div>
      <button
        type="button"
        className="rounded border border-setta-200 bg-white px-3 py-1 text-xs text-setta-600 hover:bg-setta-50 dark:border-setta-800 dark:bg-setta-900 dark:text-setta-200 dark:hover:bg-setta-800"
        onClick={() => window.location.reload()}
      >
        Reload
      </button>
    </div>
  );
}

function useFrontendErrorListeners() {
  useEffect(() => {
    function handleWindowError(event: ErrorEvent) {
      const location = formatErrorLocation(
        event.filename,
        event.lineno,
        event.colno,
      );
      const detail = location ? `Source: ${location}` : undefined;
      logFrontendError({
        source: "window-error",
        error: event.error ?? event.message,
        detail,
      });
    }

    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      logFrontendError({
        source: "unhandledrejection",
        error: event.reason,
      });
    }

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);
}

function logFrontendError(payload: FrontendErrorPayload) {
  const message = formatFrontendErrorMessage(payload);
  const event: SettaBackendLogEvent = {
    id: createNewId(),
    projectConfigId: getActiveProjectConfigId(),
    severity: "error",
    message,
    timestamp: getNowTimestamp(),
  };
  addBackendLogEvent(event);
}

function formatFrontendErrorMessage({
  source,
  error,
  detail,
}: FrontendErrorPayload): string {
  const lines = [`Frontend error (${source}): ${formatErrorMessage(error)}`];
  if (detail) {
    lines.push(detail);
  }
  const stack = formatErrorStack(error);
  if (stack) {
    lines.push(stack);
  }
  return lines.join("\n");
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || "Unexpected error";
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) {
      return message;
    }
  }
  return String(error);
}

function formatErrorStack(error: unknown): string | null {
  if (error instanceof Error && error.stack) {
    return error.stack;
  }
  return null;
}

function formatErrorLocation(
  filename?: string,
  lineNumber?: number,
  columnNumber?: number,
): string | null {
  if (!filename) {
    return null;
  }
  let location = filename;
  if (typeof lineNumber === "number") {
    location = `${location}:${lineNumber}`;
    if (typeof columnNumber === "number") {
      location = `${location}:${columnNumber}`;
    }
  }
  return location;
}

function getActiveProjectConfigId(): string | null {
  const projectConfigId = useProjectState.getState().projectConfig?.id;
  if (!projectConfigId || projectConfigId === NULL_PROJECT_CONFIG_ID) {
    return null;
  }
  return projectConfigId;
}
