import type { ChatGPTPlanType, ProviderAccountSummary } from "@generated/backend";
import { chatGPTPlanTypeValues } from "@generated/backend";
import { KeyRound, Save, Trash2, X } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

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

export function ProviderAccountsPanel() {
  const accountState = useProviderAccountState();
  const configured = accountState.account?.configured ?? false;
  return (
    <section className="grid gap-3" data-testid="provider-accounts-panel">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <KeyRound className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
          <h3 className="truncate text-xs font-semibold text-zinc-100">Codex ChatGPT</h3>
        </div>
        <Badge
          className="border-zinc-600 bg-zinc-800 text-zinc-300"
          data-testid="provider-accounts-status"
          variant={configured ? "success" : "neutral"}
        >
          {configured ? "Configured" : "Empty"}
        </Badge>
      </div>
      <div className="truncate text-xs text-zinc-400" data-testid="provider-account-summary">
        <ProviderAccountSummaryText account={accountState.account} configured={configured} />
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

function useProviderAccountState() {
  const [account, setAccount] = useState<ProviderAccountSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<ProviderAccountForm>(emptyProviderAccountForm);
  const mutationSequenceRef = useRef(0);

  const loadAccounts = useCallback(async () => {
    const sequenceAtStart = mutationSequenceRef.current;
    setError("");
    try {
      const accounts = await window.setta.providerAccounts.list();
      if (sequenceAtStart === mutationSequenceRef.current) {
        setAccount(codexChatGPTAccount(accounts.accounts));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Account state unavailable");
    }
  }, []);

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
    mutationSequenceRef.current += 1;
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
    mutationSequenceRef.current += 1;
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
  setForm: (next: (current: ProviderAccountForm) => ProviderAccountForm) => void;
}) {
  return (
    <form className="grid gap-2" onSubmit={(event) => void saveAuth(event)}>
      <label className="block text-[11px] text-zinc-400">
        Access token
        <input
          className="mt-1 h-7 w-full rounded-sm border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100 outline-none focus:border-zinc-500"
          data-testid="provider-account-access-token"
          onChange={(event) =>
            setForm((current) => ({ ...current, accessToken: event.target.value }))
          }
          type="password"
          value={form.accessToken}
        />
      </label>
      <label className="block text-[11px] text-zinc-400">
        Account ID
        <input
          className="mt-1 h-7 w-full rounded-sm border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100 outline-none focus:border-zinc-500"
          data-testid="provider-account-account-id"
          onChange={(event) =>
            setForm((current) => ({ ...current, accountId: event.target.value }))
          }
          value={form.accountId}
        />
      </label>
      <label className="block text-[11px] text-zinc-400">
        Plan
        <select
          className="mt-1 h-7 w-full rounded-sm border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100 outline-none focus:border-zinc-500"
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
          className="border-zinc-700 bg-zinc-100 text-zinc-950 hover:bg-white"
          data-testid="provider-account-save"
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
          className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          disabled={busy}
          onClick={() => {
            setEditing(false);
            setForm(() => emptyProviderAccountForm);
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
  beginEdit,
  busy,
  clearAuth,
  configured,
}: {
  beginEdit: () => void;
  busy: boolean;
  clearAuth: () => Promise<void>;
  configured: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        aria-label="Configure ChatGPT account"
        className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
        data-testid="provider-account-configure"
        disabled={busy}
        onClick={beginEdit}
      >
        <KeyRound className="h-3.5 w-3.5" />
        Configure
      </Button>
      {configured ? (
        <Button
          aria-label="Clear ChatGPT account"
          className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          data-testid="provider-account-clear"
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
    <div className="break-words text-xs text-red-400" data-testid="provider-accounts-error">
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
