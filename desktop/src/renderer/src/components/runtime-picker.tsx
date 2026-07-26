import type { KnownRuntimeView, RuntimeConnectionStatus } from "@shared/types";
import {
  AlertTriangle,
  Check,
  Copy,
  Ellipsis,
  Loader2,
  Monitor,
  Plus,
  Power,
  Server,
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
        runtimes={state.runtimes}
        status={state.status}
      />
      <RuntimePairingForm state={state} />
      <RuntimePickerError error={state.error} />
    </section>
  );
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
  if (
    runtime.infrastructureProvider.id !== "unknown" &&
    runtime.infrastructureProvider.iconUrl.trim() !== ""
  ) {
    return <RuntimeProviderIcon provider={runtime.infrastructureProvider} />;
  }
  return <Server className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
}

function RuntimeProviderIcon({
  provider,
}: {
  provider: KnownRuntimeView["infrastructureProvider"];
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <Server className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  }
  return (
    <span
      className="grid h-3.5 w-3.5 shrink-0 place-items-center overflow-hidden rounded-[2px]"
      title={provider.displayName}
    >
      <img
        alt=""
        aria-hidden="true"
        className="h-3.5 w-3.5 object-contain opacity-70 grayscale"
        decoding="async"
        onError={() => setFailed(true)}
        referrerPolicy="no-referrer"
        src={provider.iconUrl}
      />
    </span>
  );
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
        {!runtime.isLocal ? (
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
