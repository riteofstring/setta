import type {
  BackendHealth,
  ChatGPTPlanType,
  ProviderAccountSummary,
  WorkspaceSession,
  WorkspaceSummary,
} from "@generated/backend";
import { chatGPTPlanTypeValues } from "@generated/backend";
import {
  CircleAlert,
  CircleCheck,
  FolderOpen,
  KeyRound,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  type Dispatch,
  type FormEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  BackendEventStreamStatus,
  BackendProcessStatus,
  RuntimeVersions,
} from "@shared/types";
import { ChatPanel } from "./components/chat-panel";
import { WorkspaceSidebar } from "./components/workspace-sidebar";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Separator } from "./components/ui/separator";
import {
  type WorkspaceOperationKind,
  type WorkspaceOperation,
  type WorkspaceStatus,
  useWorkspaceStore,
} from "./stores/workspace-store";
import { useChatStore } from "./stores/chat-store";

interface BackendState {
  eventStream: BackendEventStreamStatus;
  health: BackendHealth | null;
  healthMessage: string;
  process: BackendProcessStatus;
}

const initialBackendState: BackendState = {
  eventStream: { message: "Event stream stopped", status: "stopped" },
  health: null,
  healthMessage: "",
  process: { message: "Starting backend", status: "starting" },
};

export function App() {
  const { backend, refreshHealth } = useBackendState();
  const runtime = useRuntimeVersions();
  const workspace = useWorkspaceViewState();

  useEffect(() => {
    return window.setta.chat.onEvent((event) => {
      useChatStore.getState().handleEvent(event);
    });
  }, []);

  return (
    <div className="grid h-screen min-h-0 grid-rows-[56px_minmax(0,1fr)] overflow-hidden bg-zinc-50 text-zinc-950">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-5">
        <div className="flex items-center gap-4">
          <h1 className="text-base font-semibold">Setta</h1>
          <BackendBadge backend={backend} />
          <EventStreamBadge status={backend.eventStream} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">Electron {runtime.electron}</span>
          <Button aria-label="Refresh backend health" onClick={() => void refreshHealth()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </header>
      <main className="grid min-h-0 min-w-0 grid-cols-[260px_1fr] overflow-hidden">
        <aside className="flex min-h-0 flex-col border-r border-zinc-200 bg-white">
          <WorkspaceSidebar
            activeWorkspaces={workspace.activeWorkspaces}
            busy={workspace.busy}
            closeWorkspace={workspace.closeWorkspace}
            openLocalFolder={workspace.openLocalFolder}
            recentWorkspaces={workspace.recentWorkspaces}
            removeRecent={workspace.removeRecent}
            reorderWorkspaces={workspace.reorderWorkspaces}
            selectWorkspace={workspace.selectWorkspace}
            selectedWorkspaceId={workspace.selectedWorkspaceId}
          />
          <Separator className="my-5" />
          <ProviderAccountsPanel
            backendOnline={backend.process.status === "online" || backend.health?.ok === true}
          />
          <Separator className="my-5" />
          <dl className="space-y-3 px-4 pb-5 text-xs">
            <div>
              <dt className="text-zinc-500">Backend</dt>
              <dd className="mt-1 break-words font-medium text-zinc-800">
                {backend.healthMessage || backend.process.message}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Runtime</dt>
              <dd className="mt-1 text-zinc-800">Node {runtime.node}</dd>
            </div>
          </dl>
        </aside>
        <section className="grid min-h-0 min-w-0 grid-rows-[132px_minmax(0,1fr)] overflow-hidden">
          <WorkspacePanel
            error={workspace.error}
            openLocalFolder={workspace.openLocalFolder}
            operation={workspace.operation}
            selectedWorkspace={workspace.selectedWorkspace}
            status={workspace.status}
          />
          <ChatPanel workspace={workspace.selectedWorkspace} />
        </section>
      </main>
    </div>
  );
}

function useBackendState() {
  const [backend, setBackend] = useState<BackendState>(initialBackendState);
  const refreshHealth = useCallback(async () => {
    setBackend((current) => ({ ...current, health: null, healthMessage: "Checking" }));
    try {
      const health = await window.setta.backend.health();
      setBackend((current) => ({
        ...current,
        health,
        healthMessage: `${health.name} ${health.version}`,
      }));
    } catch (error) {
      setBackend((current) => ({
        ...current,
        health: null,
        healthMessage: error instanceof Error ? error.message : "Backend unavailable",
      }));
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);
  useEffect(() => {
    return window.setta.backend.onProcessStatus((process) => {
      setBackend((current) => ({ ...current, process }));
    });
  }, []);
  useEffect(() => {
    return window.setta.backend.onEventStreamStatus((eventStream) => {
      setBackend((current) => ({ ...current, eventStream }));
      if (eventStream.status === "resyncing") {
        void useChatStore.getState().resyncActiveConversation();
      }
    });
  }, []);

  return { backend, refreshHealth };
}

function useRuntimeVersions() {
  const [versions, setVersions] = useState<RuntimeVersions | null>(null);
  useEffect(() => {
    void window.setta.app.versions().then(setVersions);
  }, []);
  return {
    electron: versions?.electron ?? "--",
    node: versions?.node ?? "--",
  };
}

function useWorkspaceViewState() {
  const closeWorkspace = useWorkspaceStore((state) => state.closeWorkspace);
  const error = useWorkspaceStore((state) => state.error);
  const loadSession = useWorkspaceStore((state) => state.loadSession);
  const openLocalFolder = useWorkspaceStore((state) => state.openLocalFolder);
  const operation = useWorkspaceStore((state) => state.operation);
  const removeRecent = useWorkspaceStore((state) => state.removeRecent);
  const reorderWorkspaces = useWorkspaceStore((state) => state.reorderWorkspaces);
  const selectWorkspace = useWorkspaceStore((state) => state.selectWorkspace);
  const session = useWorkspaceStore((state) => state.session);
  const status = useWorkspaceStore((state) => state.status);
  const selectedWorkspace = useSelectedWorkspace(session);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  return {
    activeWorkspaces: session?.activeWorkspaces ?? [],
    busy: operation !== null || status === "loading",
    closeWorkspace,
    error,
    openLocalFolder,
    operation,
    recentWorkspaces: session?.recentWorkspaces ?? [],
    removeRecent,
    reorderWorkspaces,
    selectWorkspace,
    selectedWorkspace,
    selectedWorkspaceId: session?.selectedWorkspaceId ?? "",
    status,
  };
}

function useSelectedWorkspace(session: WorkspaceSession | null) {
  return useMemo(() => {
    return (
      session?.activeWorkspaces.find((workspace) => workspace.id === session.selectedWorkspaceId) ??
      null
    );
  }, [session]);
}

interface ProviderAccountForm {
  accessToken: string;
  accountId: string;
  planType: string;
}

const emptyProviderAccountForm: ProviderAccountForm = {
  accessToken: "",
  accountId: "",
  planType: "plus",
};

function useProviderAccountState(backendOnline: boolean) {
  const [account, setAccount] = useState<ProviderAccountSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<ProviderAccountForm>(emptyProviderAccountForm);

  const loadAccounts = useCallback(async () => {
    if (!backendOnline) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const accounts = await window.setta.providerAccounts.list();
      setAccount(codexChatGPTAccount(accounts.accounts));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Account state unavailable");
    } finally {
      setBusy(false);
    }
  }, [backendOnline]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const beginEdit = () => {
    setForm({
      accessToken: "",
      accountId: account?.accountId ?? "",
      planType: account?.planType ?? emptyProviderAccountForm.planType,
    });
    setEditing(true);
    setError("");
  };

  const saveAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const accounts = await window.setta.providerAccounts.saveChatGPTAuth({
        accessToken: form.accessToken,
        accountId: form.accountId,
        planType: requireChatGPTPlanType(form.planType),
      });
      setAccount(codexChatGPTAccount(accounts.accounts));
      setEditing(false);
      setForm(emptyProviderAccountForm);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const clearAuth = async () => {
    setBusy(true);
    setError("");
    try {
      const accounts = await window.setta.providerAccounts.clearChatGPTAuth({});
      setAccount(codexChatGPTAccount(accounts.accounts));
      setEditing(false);
      setForm(emptyProviderAccountForm);
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "Clear failed");
    } finally {
      setBusy(false);
    }
  };

  return {
    account,
    beginEdit,
    busy,
    clearAuth,
    editing,
    error,
    form,
    saveAuth,
    setEditing,
    setForm,
  };
}

function ProviderAccountsPanel({ backendOnline }: { backendOnline: boolean }) {
  const accountState = useProviderAccountState(backendOnline);
  const configured = accountState.account?.configured ?? false;
  return (
    <section className="px-4 text-xs" data-testid="provider-accounts-panel">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-950">Accounts</h2>
        <Badge data-testid="provider-accounts-status" variant={configured ? "success" : "neutral"}>
          {configured ? "Configured" : "Empty"}
        </Badge>
      </div>
      <div className="mt-3 min-w-0">
        <div className="flex items-center gap-2 font-medium text-zinc-800">
          <KeyRound className="h-4 w-4 shrink-0 text-zinc-500" />
          <span className="truncate">Codex ChatGPT</span>
        </div>
        <div className="mt-1 truncate text-zinc-500" data-testid="provider-account-summary">
          <ProviderAccountSummaryText account={accountState.account} configured={configured} />
        </div>
      </div>
      {accountState.editing ? (
        <ProviderAccountEditor
          busy={accountState.busy}
          form={accountState.form}
          saveAuth={accountState.saveAuth}
          setEditing={accountState.setEditing}
          setForm={accountState.setForm}
        />
      ) : (
        <ProviderAccountActions
          backendOnline={backendOnline}
          beginEdit={accountState.beginEdit}
          busy={accountState.busy}
          clearAuth={accountState.clearAuth}
          configured={configured}
        />
      )}
      <ProviderAccountError error={accountState.error} />
    </section>
  );
}

function ProviderAccountSummaryText({
  account,
  configured,
}: {
  account: ProviderAccountSummary | null;
  configured: boolean;
}) {
  return configured
    ? accountSummary(account)
    : account?.diagnostic || "ChatGPT auth is not configured";
}

function ProviderAccountEditor({
  busy,
  form,
  saveAuth,
  setEditing,
  setForm,
}: {
  busy: boolean;
  form: ProviderAccountForm;
  saveAuth: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  setEditing: (editing: boolean) => void;
  setForm: Dispatch<SetStateAction<ProviderAccountForm>>;
}) {
  return (
    <form className="mt-3 space-y-2" onSubmit={(event) => void saveAuth(event)}>
      <label className="block text-zinc-600">
        Access token
        <input
          className="mt-1 h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-950 outline-none focus:border-zinc-400"
          data-testid="provider-account-access-token"
          onChange={(event) =>
            setForm((current) => ({ ...current, accessToken: event.target.value }))
          }
          type="password"
          value={form.accessToken}
        />
      </label>
      <label className="block text-zinc-600">
        Account ID
        <input
          className="mt-1 h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-950 outline-none focus:border-zinc-400"
          data-testid="provider-account-account-id"
          onChange={(event) =>
            setForm((current) => ({ ...current, accountId: event.target.value }))
          }
          value={form.accountId}
        />
      </label>
      <label className="block text-zinc-600">
        Plan
        <select
          className="mt-1 h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-950 outline-none focus:border-zinc-400"
          data-testid="provider-account-plan-type"
          onChange={(event) => setForm((current) => ({ ...current, planType: event.target.value }))}
          value={form.planType}
        >
          {chatGPTPlanTypeValues.map((planType) => (
            <option key={planType} value={planType}>
              {planType}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          aria-label="Save ChatGPT account"
          className="h-8 px-2 text-xs"
          disabled={
            busy ||
            form.accessToken === "" ||
            form.accountId === "" ||
            !isChatGPTPlanType(form.planType)
          }
          type="submit"
          variant="primary"
        >
          <Save className="h-3.5 w-3.5" />
          Save
        </Button>
        <Button
          aria-label="Cancel ChatGPT account edit"
          className="h-8 px-2 text-xs"
          disabled={busy}
          onClick={() => {
            setEditing(false);
            setForm(emptyProviderAccountForm);
          }}
          type="button"
        >
          <X className="h-3.5 w-3.5" />
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ProviderAccountActions({
  backendOnline,
  beginEdit,
  busy,
  clearAuth,
  configured,
}: {
  backendOnline: boolean;
  beginEdit: () => void;
  busy: boolean;
  clearAuth: () => Promise<void>;
  configured: boolean;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Button
        aria-label="Configure ChatGPT account"
        className="h-8 px-2 text-xs"
        disabled={busy || !backendOnline}
        onClick={beginEdit}
      >
        <KeyRound className="h-3.5 w-3.5" />
        Configure
      </Button>
      {configured ? (
        <Button
          aria-label="Clear ChatGPT account"
          className="h-8 px-2 text-xs"
          disabled={busy}
          onClick={() => void clearAuth()}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear
        </Button>
      ) : null}
    </div>
  );
}

function ProviderAccountError({ error }: { error: string }) {
  if (error === "") {
    return null;
  }
  return (
    <div className="mt-2 break-words text-red-700" data-testid="provider-accounts-error">
      {error}
    </div>
  );
}

function codexChatGPTAccount(accounts: ProviderAccountSummary[]) {
  return (
    accounts.find(
      (candidate) => candidate.provider === "codex" && candidate.authMode === "chatgpt",
    ) ?? null
  );
}

function requireChatGPTPlanType(value: string): ChatGPTPlanType {
  const planType = chatGPTPlanTypeValues.find((candidate) => candidate === value);
  if (!planType) {
    throw new Error(`Unsupported ChatGPT plan type: ${value}`);
  }
  return planType;
}

function isChatGPTPlanType(value: string): value is ChatGPTPlanType {
  return chatGPTPlanTypeValues.some((candidate) => candidate === value);
}

function accountSummary(account: ProviderAccountSummary | null) {
  if (!account) {
    return "";
  }
  const plan = account.planType ? ` ${account.planType}` : "";
  return `${account.accountId}${plan}`;
}

export function WorkspacePanel({
  error,
  openLocalFolder,
  operation,
  selectedWorkspace,
  status,
}: {
  error: string | null;
  openLocalFolder: () => Promise<void>;
  operation: WorkspaceOperation;
  selectedWorkspace: WorkspaceSummary | null;
  status: WorkspaceStatus;
}) {
  const busy = operation !== null || status === "loading";
  return (
    <div id="workspace" className="border-b border-zinc-200 bg-white p-4">
      <div className="flex h-full items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-zinc-950">Workspace</h2>
            {status === "loading" ? <Badge variant="neutral">Loading</Badge> : null}
            {operation ? <Badge variant="neutral">{operationLabel(operation)}</Badge> : null}
          </div>
          {selectedWorkspace ? (
            <div className="mt-5 min-w-0">
              <div className="truncate text-xl font-semibold">{selectedWorkspace.displayName}</div>
              <div
                className="mt-2 truncate text-sm text-zinc-500"
                data-testid="selected-workspace-path"
              >
                {selectedWorkspace.rootPath}
              </div>
            </div>
          ) : (
            <div className="mt-5">
              <div className="text-xl font-semibold">No workspace open</div>
              <Button
                className="mt-4"
                disabled={busy}
                onClick={() => void openLocalFolder()}
                variant="primary"
              >
                <FolderOpen className="h-4 w-4" />
                Open Folder
              </Button>
            </div>
          )}
          {error ? (
            <div
              className="mt-4 max-w-3xl rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              data-testid="workspace-error"
            >
              {error}
            </div>
          ) : null}
        </div>
        <Badge variant={selectedWorkspace ? "success" : "neutral"}>
          {selectedWorkspace ? "Active" : "Empty"}
        </Badge>
      </div>
    </div>
  );
}

const operationLabels = {
  closing: "Closing",
  opening: "Opening",
  removingRecent: "Removing",
  reordering: "Reordering",
  selecting: "Selecting",
} satisfies Record<WorkspaceOperationKind, string>;

function operationLabel(operation: WorkspaceOperationKind) {
  return operationLabels[operation];
}

function BackendBadge({ backend }: { backend: BackendState }) {
  if (backend.process.status === "online") {
    return (
      <Badge data-testid="backend-status" variant="success">
        <CircleCheck className="h-3.5 w-3.5" />
        Online
      </Badge>
    );
  }
  if (backend.process.status === "offline" || backend.process.status === "failed") {
    return (
      <Badge data-testid="backend-status" variant="danger">
        <CircleAlert className="h-3.5 w-3.5" />
        {backend.process.status === "failed" ? "Failed" : "Offline"}
      </Badge>
    );
  }
  return <Badge data-testid="backend-status">Starting</Badge>;
}

function EventStreamBadge({ status }: { status: BackendEventStreamStatus }) {
  if (status.status === "connected") {
    return <Badge variant="success">Stream</Badge>;
  }
  if (status.status === "reconnecting" || status.status === "resyncing") {
    return (
      <Badge variant="neutral">
        {status.status === "resyncing" ? "Resyncing" : "Reconnecting"}
      </Badge>
    );
  }
  if (status.status === "connecting") {
    return <Badge variant="neutral">Connecting</Badge>;
  }
  return <Badge variant="neutral">Stream stopped</Badge>;
}
