import type {
  DeveloperHostedRuntimePhase,
  DeveloperHostedRuntimeReasonCode,
  DeveloperHostedRuntimeStatus,
} from "@generated/backend";
import type {
  KnownRuntimeView,
  RuntimeConnectionStatus,
  RuntimeRegistrySnapshot,
} from "@shared/types";
import {
  AlertTriangle,
  Check,
  Cloud,
  Copy,
  Ellipsis,
  Loader2,
  Monitor,
  Plus,
  Power,
  Server,
  Trash2,
} from "lucide-react";
import {
  type Dispatch,
  type FormEvent,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";

import { cn } from "../lib/utils";
import { runtimePickerControlsDisabled, useRuntimeStore } from "../stores/runtime-store";
import { FloatingMenu } from "./floating-menu";
import { SettaCompactInput } from "./setta-compact-input";
import { Button } from "./ui/button";

export const developerHostedOfflineDeletionWarning =
  "Automatic compute cutoff is armed. Keep this controller running for automatic deletion.";

interface RuntimePickerProps {
  adding?: boolean;
  setAdding?: Dispatch<SetStateAction<boolean>>;
}

export function RuntimePicker({
  adding: controlledAdding,
  setAdding: controlledSetAdding,
}: RuntimePickerProps = {}) {
  const [internalAdding, setInternalAdding] = useState(false);
  const state = useRuntimePickerState({
    adding: controlledAdding ?? internalAdding,
    setAdding: controlledSetAdding ?? setInternalAdding,
  });
  return (
    <section className="grid gap-1 px-1" data-testid="runtime-picker">
      <RuntimeList
        busy={state.busy}
        onRemove={(runtimeId) => void state.removeRuntime(runtimeId)}
        onSwitch={(runtimeId) => void state.switchRuntime(runtimeId)}
        runtimes={state.runtimes.filter((runtime) => !runtime.managedHosted)}
        status={state.status}
      />
      <DeveloperHostedRuntimeCard />
      <RuntimePairingForm state={state} />
      <RuntimePickerError error={state.error} />
    </section>
  );
}

function DeveloperHostedRuntimeCard() {
  const available = useRuntimeStore((state) => state.developerHostedAvailable);
  const destroy = useRuntimeStore((state) => state.destroyHostedRuntime);
  const operation = useRuntimeStore((state) => state.operation);
  const provision = useRuntimeStore((state) => state.provisionHostedRuntime);
  const snapshot = useRuntimeStore((state) => state.snapshot);
  const status = useRuntimeStore((state) => state.developerHostedStatus);
  const switchRuntime = useRuntimeStore((state) => state.switchRuntime);
  return (
    <DeveloperHostedRuntimeCardContent
      available={available}
      destroy={destroy}
      operation={operation}
      provision={provision}
      snapshot={snapshot}
      status={status}
      switchRuntime={switchRuntime}
    />
  );
}

function DeveloperHostedRuntimeCardContent({
  available,
  destroy,
  operation,
  provision,
  snapshot,
  status,
  switchRuntime,
}: {
  available: boolean;
  destroy: () => Promise<void>;
  operation: ReturnType<typeof useRuntimeStore.getState>["operation"];
  provision: () => Promise<void>;
  snapshot: RuntimeRegistrySnapshot | null;
  status: DeveloperHostedRuntimeStatus | null;
  switchRuntime: (runtimeId: string) => Promise<void>;
}) {
  if (!available) {
    return null;
  }
  if (!status) {
    return (
      <DeveloperHostedInactiveCard operation={operation} provision={provision} removed={false} />
    );
  }
  if (status.phase === "removed") {
    return (
      <DeveloperHostedInactiveCard operation={operation} provision={provision} removed={true} />
    );
  }
  const managedRuntime = snapshot?.runtimes.find((runtime) => runtime.managedHosted) ?? null;
  const presentation = developerHostedPresentation(status, managedRuntime, snapshot);
  const localRuntime = snapshot?.runtimes.find((runtime) => runtime.isLocal) ?? null;
  const busy = developerHostedActionsBusy(operation, snapshot);

  return (
    <article
      aria-label="Hosted developer runtime"
      className="grid gap-2 rounded-sm border border-border/70 px-2 py-2"
    >
      <div className="flex min-w-0 items-start gap-2">
        <span
          aria-hidden="true"
          className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", presentation.dotClass)}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">Hosted developer runtime</span>
          <span aria-live="polite" className="block text-xs text-muted-foreground" role="status">
            {presentation.label}
          </span>
        </span>
      </div>
      <DeveloperHostedDetails status={status} />
      <DeveloperHostedNotices presentation={presentation} status={status} />
      <DeveloperHostedActions
        busy={busy}
        destroy={destroy}
        localRuntime={localRuntime}
        managedRuntime={managedRuntime}
        operation={operation}
        status={status}
        switchRuntime={switchRuntime}
      />
    </article>
  );
}

function developerHostedActionsBusy(
  operation: ReturnType<typeof useRuntimeStore.getState>["operation"],
  snapshot: RuntimeRegistrySnapshot | null,
): boolean {
  if (operation !== null) {
    return true;
  }
  return Boolean(snapshot?.switching);
}

function DeveloperHostedInactiveCard({
  operation,
  provision,
  removed,
}: {
  operation: ReturnType<typeof useRuntimeStore.getState>["operation"];
  provision: () => Promise<void>;
  removed: boolean;
}) {
  return (
    <div className="grid gap-1 rounded-sm border border-border/70 px-2 py-2">
      {removed ? (
        <p className="text-xs text-muted-foreground" role="status">
          Hosted developer runtime · Removed
        </p>
      ) : null}
      <Button
        className="min-h-10 w-full justify-center"
        disabled={operation !== null}
        onClick={() => void provision()}
        type="button"
      >
        {operation === "provisioningHosted" ? (
          <Loader2
            aria-hidden="true"
            className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
          />
        ) : (
          <Cloud aria-hidden="true" className="h-3.5 w-3.5" />
        )}
        Provision hosted runtime
      </Button>
    </div>
  );
}

function DeveloperHostedDetails({ status }: { status: DeveloperHostedRuntimeStatus }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[11px] leading-4">
      <dt className="text-muted-foreground">Deletes</dt>
      <dd className="truncate text-right">{formatTimestamp(status.deletionScheduledAt)}</dd>
      <dt className="text-muted-foreground">Budget</dt>
      <dd className="text-right">{formatUSDMicros(status.enforcedBudgetUsdMicros)}</dd>
      <dt className="text-muted-foreground">Usage</dt>
      <dd className="text-right">
        {status.reportedUsageUsdMicros === null
          ? "Usage pending"
          : formatUSDMicros(status.reportedUsageUsdMicros)}
      </dd>
      <dt className="text-muted-foreground">Last connected</dt>
      <dd className="truncate text-right">
        {status.lastConnectedAt ? formatTimestamp(status.lastConnectedAt) : "Not yet"}
      </dd>
    </dl>
  );
}

function DeveloperHostedNotices({
  presentation,
  status,
}: {
  presentation: ReturnType<typeof developerHostedPresentation>;
  status: DeveloperHostedRuntimeStatus;
}) {
  return (
    <>
      {!status.automaticDeletionWhileOffline ? (
        <p className="text-[11px] leading-4 text-amber-300">
          {developerHostedOfflineDeletionWarning}
        </p>
      ) : null}
      {presentation.failure ? (
        <p className="text-[11px] leading-4 text-destructive" role="alert">
          {presentation.failure}
        </p>
      ) : null}
    </>
  );
}

function DeveloperHostedActions({
  busy,
  destroy,
  localRuntime,
  managedRuntime,
  operation,
  status,
  switchRuntime,
}: {
  busy: boolean;
  destroy: () => Promise<void>;
  localRuntime: KnownRuntimeView | null;
  managedRuntime: KnownRuntimeView | null;
  operation: ReturnType<typeof useRuntimeStore.getState>["operation"];
  status: DeveloperHostedRuntimeStatus;
  switchRuntime: (runtimeId: string) => Promise<void>;
}) {
  return (
    <div className="grid gap-1">
      {managedRuntime && !managedRuntime.active ? (
        <Button
          className="min-h-10 w-full"
          disabled={busy}
          onClick={() => void switchRuntime(managedRuntime.runtimeId)}
          type="button"
          variant="secondary"
        >
          Switch to hosted runtime
        </Button>
      ) : null}
      {managedRuntime?.active && localRuntime ? (
        <Button
          className="min-h-10 w-full"
          disabled={busy}
          onClick={() => void switchRuntime(localRuntime.runtimeId)}
          type="button"
          variant="secondary"
        >
          Switch to local runtime
        </Button>
      ) : null}
      <Button
        className="min-h-10 w-full border-destructive/50 text-destructive hover:bg-destructive/15"
        disabled={busy}
        onClick={() => confirmDeveloperHostedDestroy(destroy)}
        type="button"
        variant="secondary"
      >
        {operation === "destroyingHosted" ? (
          <Loader2
            aria-hidden="true"
            className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
          />
        ) : (
          <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
        )}
        {status.phase === "preparing" ? "Cancel provisioning" : "Destroy hosted runtime"}
      </Button>
    </div>
  );
}

function confirmDeveloperHostedDestroy(destroy: () => Promise<void>) {
  if (
    window.confirm("Destroy hosted runtime? Its filesystem and hosted Codex login will be deleted.")
  ) {
    void destroy();
  }
}

export function developerHostedPresentation(
  status: DeveloperHostedRuntimeStatus,
  runtime: KnownRuntimeView | null,
  snapshot: RuntimeRegistrySnapshot | null,
) {
  if (status.phase !== "connected") {
    return {
      dotClass: developerHostedPhaseDotClass(status.phase),
      failure: developerHostedFailure(status.reasonCode),
      label: developerHostedPhaseLabel(status.phase),
    };
  }
  if (!runtime?.active) {
    return { dotClass: "bg-zinc-500", failure: null, label: "Not selected" };
  }
  if (snapshot?.connection.status === "connected") {
    return { dotClass: "bg-emerald-400", failure: null, label: "Connected" };
  }
  return { dotClass: "bg-sky-400", failure: null, label: "Reconnecting" };
}

function developerHostedPhaseDotClass(phase: DeveloperHostedRuntimePhase): string {
  return (
    {
      connected: "bg-zinc-500",
      connecting: "bg-sky-400",
      destroying: "bg-sky-400",
      installing: "bg-sky-400",
      needs_attention: "bg-destructive",
      pairing: "bg-sky-400",
      preparing: "bg-sky-400",
      provisioning: "bg-sky-400",
      removed: "bg-zinc-500",
      retrying: "bg-sky-400",
    } satisfies Record<DeveloperHostedRuntimePhase, string>
  )[phase];
}

function developerHostedFailure(reason: DeveloperHostedRuntimeReasonCode | null): string | null {
  return reason === null ? null : developerHostedFailureCopy(reason);
}

function developerHostedPhaseLabel(phase: DeveloperHostedRuntimePhase): string {
  return (
    {
      connected: "Not selected",
      connecting: "Connecting",
      destroying: "Destroying",
      installing: "Installing Setta",
      needs_attention: "Needs attention",
      pairing: "Pairing",
      preparing: "Preparing",
      provisioning: "Provisioning",
      removed: "Removed",
      retrying: "Retrying",
    } satisfies Record<DeveloperHostedRuntimePhase, string>
  )[phase];
}

export function developerHostedFailureCopy(reason: DeveloperHostedRuntimeReasonCode): string {
  return (
    {
      budget_cutoff: "The spending limit stopped new work. Destroy the runtime when finished.",
      cleanup_pending: "Cleanup is still pending. Setta will keep retrying.",
      connection_failed: "Unable to connect. Check the controller and try again.",
      developer_feature_disabled: "Developer hosted access is not enabled.",
      health_check_failed: "Setta did not become healthy. Provisioning can be retried.",
      pairing_failed: "Secure pairing failed. Destroy or retry the runtime.",
      provider_identity_mismatch: "The provider identity did not match. No changes were made.",
      provider_unavailable: "The provider is unavailable. Setta will retry when safe.",
      provisioning_canceled: "Provisioning was canceled.",
      release_verification_failed: "The signed Setta release could not be verified.",
    } satisfies Record<DeveloperHostedRuntimeReasonCode, string>
  )[reason];
}

function formatUSDMicros(value: number): string {
  return new Intl.NumberFormat(undefined, {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value / 1_000_000);
}

function formatTimestamp(value: string): string {
  if (value === "") {
    return "Pending";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function RuntimePickerAddButton({ adding, setAdding }: Required<RuntimePickerProps>) {
  const clearError = useRuntimeStore((state) => state.clearError);
  const operation = useRuntimeStore((state) => state.operation);
  const snapshot = useRuntimeStore((state) => state.snapshot);
  const busy = runtimePickerControlsDisabled(snapshot, operation);
  return (
    <button
      aria-label="Add runtime"
      className={cn(
        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-20",
        adding && "bg-accent text-foreground",
      )}
      disabled={busy}
      onClick={() => {
        clearError();
        setAdding((current) => !current);
      }}
      title="Add runtime"
      type="button"
    >
      <Plus className="h-3.5 w-3.5" />
    </button>
  );
}

function useRuntimePickerState({
  adding,
  setAdding,
}: {
  adding: boolean;
  setAdding: Dispatch<SetStateAction<boolean>>;
}) {
  const addByPairingUrl = useRuntimeStore((state) => state.addByPairingUrl);
  const error = useRuntimeStore((state) => state.error);
  const operation = useRuntimeStore((state) => state.operation);
  const removeRuntime = useRuntimeStore((state) => state.removeRuntime);
  const snapshot = useRuntimeStore((state) => state.snapshot);
  const status = useRuntimeStore((state) => state.status);
  const switchRuntime = useRuntimeStore((state) => state.switchRuntime);
  const [pairingUrl, setPairingUrl] = useState("");
  const runtimes = snapshot?.runtimes ?? [];
  const busy = runtimePickerControlsDisabled(snapshot, operation);
  return {
    addByPairingUrl,
    adding,
    busy,
    error,
    operation,
    pairingUrl,
    removeRuntime,
    runtimes,
    setAdding,
    setPairingUrl,
    status,
    switchRuntime,
  };
}

type RuntimePickerState = ReturnType<typeof useRuntimePickerState>;

function RuntimePairingForm({ state }: { state: RuntimePickerState }) {
  if (!state.adding) {
    return null;
  }

  async function submitPairingURL(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = state.pairingUrl.trim();
    if (trimmed === "" || state.busy) {
      return;
    }
    await state.addByPairingUrl(trimmed);
    if (useRuntimeStore.getState().error === null) {
      state.setPairingUrl("");
      state.setAdding(false);
    }
  }

  return (
    <form className="grid gap-1 px-1 pt-1" onSubmit={submitPairingURL}>
      <SettaCompactInput
        aria-label="Runtime pairing URL"
        autoComplete="off"
        disabled={state.busy}
        onChange={(event) => state.setPairingUrl(event.target.value)}
        placeholder="setta://pair?rt=..."
        value={state.pairingUrl}
      />
      <Button
        className="w-fit"
        disabled={state.busy || state.pairingUrl.trim() === ""}
        size="sm"
        type="submit"
        variant="outline"
      >
        {state.operation === "adding" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Add
      </Button>
    </form>
  );
}

function RuntimePickerError({ error }: { error: string | null }) {
  if (!error) {
    return null;
  }
  return (
    <p
      className="mx-1 flex min-w-0 items-start gap-1.5 rounded-sm border border-destructive/35 bg-destructive/10 px-2 py-1.5 text-xs leading-4 text-destructive"
      data-testid="runtime-picker-error"
      role="alert"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1 break-words">{error}</span>
    </p>
  );
}

export function RuntimeList({
  busy,
  onRemove,
  onSwitch,
  runtimes,
  status,
}: {
  busy: boolean;
  onRemove: (runtimeId: string) => void;
  onSwitch: (runtimeId: string) => void;
  runtimes: KnownRuntimeView[];
  status: "idle" | "loading" | "ready" | "error";
}) {
  if (status === "loading" && runtimes.length === 0) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading runtimes
      </div>
    );
  }
  if (runtimes.length === 0) {
    return <div className="px-2 py-1 text-xs text-muted-foreground">No runtimes paired</div>;
  }
  return (
    <ul aria-label="Runtimes" className="grid gap-0.5">
      {runtimes.map((runtime) => (
        <RuntimeRow
          busy={busy}
          key={runtime.runtimeId}
          onRemove={onRemove}
          onSwitch={onSwitch}
          runtime={runtime}
        />
      ))}
    </ul>
  );
}

function RuntimeRow({
  busy,
  onRemove,
  onSwitch,
  runtime,
}: {
  busy: boolean;
  onRemove: (runtimeId: string) => void;
  onSwitch: (runtimeId: string) => void;
  runtime: KnownRuntimeView;
}) {
  return (
    <li className="group/runtime min-w-0" key={runtime.runtimeId}>
      <article
        className={cn(
          "flex min-w-0 w-full items-center gap-1 rounded-sm px-1 py-1 transition-colors hover:bg-accent/45 focus-within:bg-accent/45",
          runtime.active && "bg-accent/55 hover:bg-accent/55 focus-within:bg-accent/55",
        )}
      >
        <button
          aria-label={`Switch to ${runtime.displayName}`}
          aria-pressed={runtime.active}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-1 py-1 text-left outline-none disabled:pointer-events-none"
          disabled={busy || runtime.active}
          onClick={() => onSwitch(runtime.runtimeId)}
          type="button"
        >
          <RuntimeIcon runtime={runtime} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-sidebar-foreground">
              {runtime.displayName}
            </span>
          </span>
        </button>
        <RuntimeRowStatusAction busy={busy} onRemove={onRemove} runtime={runtime} />
      </article>
    </li>
  );
}

function RuntimeIcon({ runtime }: { runtime: KnownRuntimeView | null }) {
  if (!runtime) {
    return <Server className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  }
  if (runtime.isLocal) {
    return <Monitor className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  }
  return <Server className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
}

function RuntimeRowStatusAction({
  busy,
  onRemove,
  runtime,
}: {
  busy: boolean;
  onRemove: (runtimeId: string) => void;
  runtime: KnownRuntimeView;
}) {
  const [open, setOpen] = useState(false);
  const [copyState, setCopyState] = useState<"copied" | "failed" | "idle">("idle");
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const copyResetRef = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const address = runtimeAddress(runtime.baseUrl);

  useEffect(() => {
    if (!open) {
      return;
    }

    function closeOnOutsidePress(event: PointerEvent) {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("pointerdown", closeOnOutsidePress);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePress);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(
    () => () => {
      if (copyResetRef.current !== null) {
        window.clearTimeout(copyResetRef.current);
      }
    },
    [],
  );

  async function copyAddress() {
    if (copyResetRef.current !== null) {
      window.clearTimeout(copyResetRef.current);
      copyResetRef.current = null;
    }
    try {
      await navigator.clipboard.writeText(address);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    copyResetRef.current = window.setTimeout(() => {
      setCopyState("idle");
      copyResetRef.current = null;
    }, 1500);
  }

  return (
    <span className="relative grid h-5 w-5 shrink-0 place-items-center">
      <RuntimeDot
        className={cn(
          "transition-opacity duration-75",
          open ? "opacity-0" : "group-hover/runtime:opacity-0 group-focus-within/runtime:opacity-0",
        )}
        status={runtime.connectionStatus}
      />
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Open options for ${runtime.displayName}`}
        className={cn(
          "absolute inset-0 grid place-items-center rounded-sm text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground focus-visible:opacity-100 disabled:pointer-events-none disabled:opacity-20 group-hover/runtime:opacity-100 group-focus-within/runtime:opacity-100",
          open && "bg-accent text-foreground opacity-100",
        )}
        disabled={busy}
        onClick={() => setOpen((current) => !current)}
        ref={anchorRef}
        title={`Options for ${runtime.displayName}`}
        type="button"
      >
        <Ellipsis className="h-3.5 w-3.5" />
      </button>
      <FloatingMenu
        align="right"
        anchorRef={anchorRef}
        ariaLabel={`Options for ${runtime.displayName}`}
        className="w-64 rounded-sm border border-border bg-popover/95 p-1 shadow-xl shadow-black/35 backdrop-blur"
        menuRef={menuRef}
        open={open}
        role="menu"
      >
        <div
          aria-label="Runtime address"
          className="grid grid-cols-[minmax(0,1fr)_1.75rem] items-center gap-1 px-2 py-1.5"
          role="none"
        >
          <span className="grid min-w-0 gap-0.5">
            <span className="truncate text-[10px] font-medium uppercase text-muted-foreground">
              Address
            </span>
            <span className="truncate font-mono text-[11px] text-popover-foreground">
              {address}
            </span>
          </span>
          <button
            aria-label={`Copy address for ${runtime.displayName}`}
            className={cn(
              "grid h-7 w-7 place-items-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground",
              copyState === "copied" && "text-emerald-400",
              copyState === "failed" && "text-destructive",
            )}
            onClick={() => void copyAddress()}
            role="menuitem"
            title={
              copyState === "copied"
                ? "Copied"
                : copyState === "failed"
                  ? "Copy failed"
                  : `Copy ${address}`
            }
            type="button"
          >
            {copyState === "copied" ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
        {canCloseRuntime(runtime) ? (
          <button
            className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-xs text-destructive hover:bg-destructive/15 hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
            disabled={busy}
            onClick={() => {
              setOpen(false);
              onRemove(runtime.runtimeId);
            }}
            role="menuitem"
            type="button"
          >
            <Power className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Close</span>
          </button>
        ) : null}
      </FloatingMenu>
    </span>
  );
}

function canCloseRuntime(runtime: KnownRuntimeView): boolean {
  return !runtime.isLocal && !runtime.managedHosted;
}

function runtimeAddress(baseUrl: string) {
  return new URL(baseUrl).host;
}

function RuntimeDot({
  className,
  status,
}: {
  className?: string;
  status: RuntimeConnectionStatus;
}) {
  return (
    <span
      aria-label={runtimeStatusLabel(status)}
      className={cn("h-2 w-2 shrink-0 rounded-full", runtimeStatusColor(status), className)}
      role="status"
    />
  );
}

function runtimeStatusLabel(status: RuntimeConnectionStatus) {
  return (
    {
      connected: "Connected",
      connecting: "Connecting",
      disconnected: "Offline",
      incompatible: "Incompatible",
      mismatched: "Wrong runtime",
      revoked: "Revoked",
      unreachable: "Unreachable",
    } satisfies Record<RuntimeConnectionStatus, string>
  )[status];
}

function runtimeStatusColor(status: RuntimeConnectionStatus) {
  switch (status) {
    case "connected":
      return "bg-emerald-400";
    case "connecting":
      return "bg-sky-400";
    case "disconnected":
      return "bg-zinc-500";
    case "incompatible":
      return "bg-amber-400";
    case "mismatched":
    case "revoked":
    case "unreachable":
      return "bg-destructive";
    default:
      return assertNever(status);
  }
}

function assertNever(value: never): never {
  throw new Error(`unsupported runtime status: ${String(value)}`);
}
