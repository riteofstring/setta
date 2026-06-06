import type { CodexAccountState, CodexLoginState } from "@generated/backend";
import { KeyRound, LogIn, LogOut, RefreshCw, X } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";

import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

export function CodexAccountPanel() {
  const account = useCodexAccountState();
  return (
    <section className="grid gap-3" data-testid="codex-account-panel">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <KeyRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <h3 className="truncate text-xs font-semibold text-foreground">Codex Account</h3>
        </div>
        <Badge
          className="border-border bg-muted text-muted-foreground"
          data-testid="codex-account-status"
          variant={accountBadgeVariant(account.state)}
        >
          {accountStatusLabel(account.state)}
        </Badge>
      </div>

      <div
        className="break-words text-xs text-muted-foreground"
        data-testid="codex-account-summary"
      >
        {accountSummary(account.state)}
      </div>

      <CodexAccountActions
        busy={account.busy}
        cancelLogin={account.cancelLogin}
        logout={account.logout}
        refresh={account.refresh}
        startAPIKeyLogin={account.startAPIKeyLogin}
        startDeviceLogin={account.startDeviceLogin}
        startLogin={account.startLogin}
        state={account.state}
      />
      <CodexLoginDetails login={account.state.login} />
      <CodexAccountError error={account.error} />
    </section>
  );
}

function useCodexAccountState() {
  const [state, setState] = useState<CodexAccountState>(emptyCodexAccountState());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setState(await window.setta.codexAccount.read());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Codex account state unavailable");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return window.setta.chat.onEvent((event) => {
      if (event.type === "codex.account.changed") {
        void load();
      }
    });
  }, [load]);

  const mutate = async (action: () => Promise<CodexAccountState>) => {
    setBusy(true);
    setError("");
    try {
      setState(await action());
    } catch (mutationError) {
      setError(
        mutationError instanceof Error ? mutationError.message : "Codex account action failed",
      );
    } finally {
      setBusy(false);
    }
  };

  const startLogin = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await window.setta.codexAccount.startLogin({ apiKey: "", type: "chatgpt" });
      setState(result.state);
      if (result.login.authUrl !== "") {
        await window.setta.app.openExternalUrl(result.login.authUrl);
      }
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Codex login failed");
    } finally {
      setBusy(false);
    }
  };

  const startDeviceLogin = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await window.setta.codexAccount.startLogin({
        apiKey: "",
        type: "chatgptDeviceCode",
      });
      setState(result.state);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Codex device login failed");
    } finally {
      setBusy(false);
    }
  };

  const startAPIKeyLogin = async (apiKey: string) => {
    await mutate(async () => {
      const result = await window.setta.codexAccount.startLogin({ apiKey, type: "apiKey" });
      return result.state;
    });
  };

  const cancelLogin = async (loginId: string) => {
    await mutate(() => window.setta.codexAccount.cancelLogin({ loginId }));
  };

  const logout = async () => {
    await mutate(() => window.setta.codexAccount.logout({}));
  };

  const refresh = async () => {
    await mutate(() => window.setta.codexAccount.refresh({ refreshToken: false }));
  };

  return {
    busy,
    cancelLogin,
    error,
    logout,
    refresh,
    startAPIKeyLogin,
    startDeviceLogin,
    startLogin,
    state,
  };
}

function CodexAccountActions({
  busy,
  cancelLogin,
  logout,
  refresh,
  startAPIKeyLogin,
  startDeviceLogin,
  startLogin,
  state,
}: {
  busy: boolean;
  cancelLogin: (loginId: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  startAPIKeyLogin: (apiKey: string) => Promise<void>;
  startDeviceLogin: () => Promise<void>;
  startLogin: () => Promise<void>;
  state: CodexAccountState;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {state.status === "signed_in" ? (
          <Button
            aria-label="Sign out of Codex"
            className="border-border bg-muted text-muted-foreground hover:bg-accent"
            data-testid="codex-account-logout"
            disabled={busy}
            onClick={() => void logout()}
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </Button>
        ) : (
          <Button
            aria-label="Sign in to Codex with ChatGPT"
            className="border-border bg-secondary text-foreground hover:bg-card"
            data-testid="codex-account-login"
            disabled={busy || state.status === "login_in_progress"}
            onClick={() => void startLogin()}
            variant="primary"
          >
            <LogIn className="h-3.5 w-3.5" />
            Sign in
          </Button>
        )}
        {state.status !== "signed_in" ? (
          <Button
            aria-label="Start Codex device login"
            className="border-border bg-muted text-muted-foreground hover:bg-accent"
            data-testid="codex-account-device-login"
            disabled={busy || state.status === "login_in_progress"}
            onClick={() => void startDeviceLogin()}
          >
            <KeyRound className="h-3.5 w-3.5" />
            Device code
          </Button>
        ) : null}
        {state.login?.status === "in_progress" && state.login.loginId !== "" ? (
          <Button
            aria-label="Cancel Codex login"
            className="border-border bg-muted text-muted-foreground hover:bg-accent"
            data-testid="codex-account-cancel-login"
            disabled={busy}
            onClick={() => void cancelLogin(state.login?.loginId ?? "")}
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </Button>
        ) : null}
        <Button
          aria-label="Refresh Codex account state"
          className="border-border bg-muted text-muted-foreground hover:bg-accent"
          data-testid="codex-account-refresh"
          disabled={busy}
          onClick={() => void refresh()}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>
      {state.status !== "signed_in" ? (
        <CodexAPIKeyForm busy={busy} startAPIKeyLogin={startAPIKeyLogin} />
      ) : null}
    </div>
  );
}

function CodexAPIKeyForm({
  busy,
  startAPIKeyLogin,
}: {
  busy: boolean;
  startAPIKeyLogin: (apiKey: string) => Promise<void>;
}) {
  const [apiKey, setAPIKey] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await startAPIKeyLogin(apiKey);
    setAPIKey("");
  };

  return (
    <form className="flex min-w-0 gap-2" onSubmit={(event) => void submit(event)}>
      <input
        aria-label="OpenAI API key"
        className="h-7 min-w-0 flex-1 rounded-sm border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-ring"
        data-testid="codex-account-api-key"
        onChange={(event) => setAPIKey(event.target.value)}
        type="password"
        value={apiKey}
      />
      <Button
        aria-label="Use OpenAI API key for Codex"
        className="border-border bg-muted text-muted-foreground hover:bg-accent"
        data-testid="codex-account-api-key-login"
        disabled={busy || apiKey === ""}
        type="submit"
      >
        <KeyRound className="h-3.5 w-3.5" />
        Use key
      </Button>
    </form>
  );
}

function CodexLoginDetails({ login }: { login: CodexLoginState | null }) {
  if (!login || login.status !== "in_progress") {
    return null;
  }
  if (login.type === "chatgptDeviceCode") {
    return (
      <div
        className="grid gap-1 text-xs text-muted-foreground"
        data-testid="codex-account-device-code"
      >
        <div className="font-mono text-foreground">{login.userCode}</div>
        {login.verificationUrl !== "" ? (
          <button
            className="w-fit text-left text-muted-foreground underline decoration-border underline-offset-2 hover:text-foreground"
            onClick={() => void window.setta.app.openExternalUrl(login.verificationUrl)}
            type="button"
          >
            {login.verificationUrl}
          </button>
        ) : null}
      </div>
    );
  }
  return null;
}

function CodexAccountError({ error }: { error: string }) {
  if (error === "") {
    return null;
  }
  return (
    <div className="break-words text-xs text-status-critical" data-testid="codex-account-error">
      {error}
    </div>
  );
}

function accountBadgeVariant(state: CodexAccountState) {
  if (state.status === "signed_in") {
    return "success";
  }
  if (state.status === "unavailable") {
    return "danger";
  }
  return "neutral";
}

function accountStatusLabel(state: CodexAccountState) {
  switch (state.status) {
    case "signed_in":
      return "Signed in";
    case "login_in_progress":
      return "Pending";
    case "unavailable":
      return "Unavailable";
    case "unauthenticated":
      return "Signed out";
    default:
      return assertNever(state.status);
  }
}

function accountSummary(state: CodexAccountState) {
  if (state.status === "unavailable") {
    return state.diagnostic || "Codex app-server unavailable";
  }
  if (state.status === "login_in_progress") {
    return "Waiting for Codex sign-in";
  }
  if (!state.account) {
    return state.requiresOpenaiAuth
      ? "Codex is not signed in"
      : "Codex can run without OpenAI auth";
  }
  if (state.account.type === "apiKey") {
    return "Using OpenAI API key";
  }
  const plan = state.account.planType ? ` · ChatGPT ${state.account.planType}` : "";
  return state.account.email !== "" ? `${state.account.email}${plan}` : `ChatGPT${plan}`;
}

function emptyCodexAccountState(): CodexAccountState {
  return {
    account: null,
    diagnostic: "",
    login: null,
    requiresOpenaiAuth: true,
    status: "unavailable",
  };
}

function assertNever(value: never): never {
  throw new Error(`Unsupported Codex account state: ${value}`);
}
