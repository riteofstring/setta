import type {
  AddExistingMachineSSHRuntimeRequest,
  KnownRuntimeView,
  RuntimeConnectionStatus,
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
  QrCode,
  Server,
} from "lucide-react";
import {
  type Dispatch,
  type FormEvent,
  type RefObject,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";

import { cn } from "../lib/utils";
import { runtimePickerControlsDisabled, useRuntimeStore } from "../stores/runtime-store";
import { FloatingMenu } from "./floating-menu";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { RuntimeCloudWizard } from "./runtime-cloud-wizard";

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
        onCreateDevicePairing={state.createDevicePairing}
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

type RuntimeAddMode = "cloud" | "pairing-url" | "ssh";
type RuntimeSSHField = keyof AddExistingMachineSSHRuntimeRequest;

const emptySSHRuntimeRequest: AddExistingMachineSSHRuntimeRequest = {
  installerSha256: "",
  minisignPublicKey: "",
  releaseBaseUrl: "",
  runtimeName: "",
  settaVersion: "",
  sshTarget: "",
  tailscaleAuthKey: "",
};

function useRuntimePickerState({
  adding,
  setAdding,
}: {
  adding: boolean;
  setAdding: Dispatch<SetStateAction<boolean>>;
}) {
  const addExistingMachineOverSSH = useRuntimeStore((state) => state.addExistingMachineOverSSH);
  const addByPairingUrl = useRuntimeStore((state) => state.addByPairingUrl);
  const createDevicePairing = useRuntimeStore((state) => state.createDevicePairing);
  const error = useRuntimeStore((state) => state.error);
  const operation = useRuntimeStore((state) => state.operation);
  const removeRuntime = useRuntimeStore((state) => state.removeRuntime);
  const snapshot = useRuntimeStore((state) => state.snapshot);
  const status = useRuntimeStore((state) => state.status);
  const switchRuntime = useRuntimeStore((state) => state.switchRuntime);
  const [addMode, setAddMode] = useState<RuntimeAddMode>("pairing-url");
  const [pairingUrl, setPairingUrl] = useState("");
  const [sshRequest, setSSHRequest] =
    useState<AddExistingMachineSSHRuntimeRequest>(emptySSHRuntimeRequest);
  const runtimes = snapshot?.runtimes ?? [];
  const busy = runtimePickerControlsDisabled(snapshot, operation);
  function setSSHField(field: RuntimeSSHField, value: string) {
    setSSHRequest((current) => ({ ...current, [field]: value }));
  }
  return {
    addExistingMachineOverSSH,
    addByPairingUrl,
    addMode,
    adding,
    busy,
    createDevicePairing,
    error,
    operation,
    pairingUrl,
    removeRuntime,
    runtimes,
    setAddMode,
    setAdding,
    setPairingUrl,
    setSSHField,
    setSSHRequest,
    sshRequest,
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
    <div className="grid gap-1 px-1 pt-1">
      <RuntimeAddModeControl mode={state.addMode} setMode={state.setAddMode} />
      {state.addMode === "pairing-url" ? (
        <form className="grid gap-1" onSubmit={submitPairingURL}>
          <Input
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
            type="submit"
          >
            {state.operation === "adding" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Add
          </Button>
        </form>
      ) : state.addMode === "ssh" ? (
        <RuntimeSSHForm state={state} />
      ) : (
        <RuntimeCloudWizard busy={state.busy} />
      )}
    </div>
  );
}

function RuntimeAddModeControl({
  mode,
  setMode,
}: {
  mode: RuntimeAddMode;
  setMode: Dispatch<SetStateAction<RuntimeAddMode>>;
}) {
  return (
    <div
      aria-label="Runtime add mode"
      className="grid grid-cols-3 gap-0.5 rounded-sm bg-muted p-0.5"
      role="group"
    >
      <button
        aria-label="Add runtime by pairing URL"
        aria-pressed={mode === "pairing-url"}
        className={cn(
          "inline-flex h-7 min-w-0 items-center justify-center gap-1 rounded-sm px-2 text-xs text-muted-foreground hover:text-foreground",
          mode === "pairing-url" && "bg-background text-foreground shadow-xs",
        )}
        onClick={() => setMode("pairing-url")}
        type="button"
      >
        <QrCode className="h-3.5 w-3.5" />
        <span className="min-w-0 truncate">Pairing URL</span>
      </button>
      <button
        aria-label="Add runtime on my cloud"
        aria-pressed={mode === "cloud"}
        className={cn(
          "inline-flex h-7 min-w-0 items-center justify-center gap-1 rounded-sm px-2 text-xs text-muted-foreground hover:text-foreground",
          mode === "cloud" && "bg-background text-foreground shadow-xs",
        )}
        onClick={() => setMode("cloud")}
        type="button"
      >
        <Cloud className="h-3.5 w-3.5" />
        <span className="min-w-0 truncate">On my cloud</span>
      </button>
      <button
        aria-label="Add runtime from existing machine over SSH"
        aria-pressed={mode === "ssh"}
        className={cn(
          "inline-flex h-7 min-w-0 items-center justify-center gap-1 rounded-sm px-2 text-xs text-muted-foreground hover:text-foreground",
          mode === "ssh" && "bg-background text-foreground shadow-xs",
        )}
        onClick={() => setMode("ssh")}
        type="button"
      >
        <Server className="h-3.5 w-3.5" />
        <span className="min-w-0 truncate">Existing machine over SSH</span>
      </button>
    </div>
  );
}

function RuntimeSSHForm({ state }: { state: RuntimePickerState }) {
  async function submitSSH(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.busy || !sshRequestComplete(state.sshRequest)) {
      return;
    }
    await state.addExistingMachineOverSSH(state.sshRequest);
    if (useRuntimeStore.getState().error === null) {
      state.setSSHRequest(emptySSHRuntimeRequest);
      state.setAdding(false);
    }
  }

  return (
    <form className="grid gap-1" onSubmit={submitSSH}>
      <Input
        aria-label="SSH target"
        autoComplete="off"
        disabled={state.busy}
        onChange={(event) => state.setSSHField("sshTarget", event.target.value)}
        placeholder="ssh://ubuntu@example.com"
        value={state.sshRequest.sshTarget}
      />
      <div className="grid grid-cols-2 gap-1">
        <Input
          aria-label="Runtime name"
          autoComplete="off"
          disabled={state.busy}
          onChange={(event) => state.setSSHField("runtimeName", event.target.value)}
          placeholder="setta-gpu-box"
          value={state.sshRequest.runtimeName ?? ""}
        />
        <Input
          aria-label="Setta version"
          autoComplete="off"
          disabled={state.busy}
          onChange={(event) => state.setSSHField("settaVersion", event.target.value)}
          placeholder="v1.2.3"
          value={state.sshRequest.settaVersion}
        />
      </div>
      <Input
        aria-label="Tailscale auth key"
        autoComplete="off"
        disabled={state.busy}
        onChange={(event) => state.setSSHField("tailscaleAuthKey", event.target.value)}
        placeholder="tskey-auth-..."
        type="password"
        value={state.sshRequest.tailscaleAuthKey}
      />
      <Input
        aria-label="Release base URL"
        autoComplete="off"
        disabled={state.busy}
        onChange={(event) => state.setSSHField("releaseBaseUrl", event.target.value)}
        placeholder="https://downloads.example.test/setta/v1.2.3"
        value={state.sshRequest.releaseBaseUrl}
      />
      <Input
        aria-label="Installer SHA-256"
        autoComplete="off"
        disabled={state.busy}
        onChange={(event) => state.setSSHField("installerSha256", event.target.value)}
        placeholder="installer sha256"
        value={state.sshRequest.installerSha256}
      />
      <Input
        aria-label="Minisign public key"
        autoComplete="off"
        disabled={state.busy}
        onChange={(event) => state.setSSHField("minisignPublicKey", event.target.value)}
        placeholder="RWQ..."
        value={state.sshRequest.minisignPublicKey}
      />
      <Button
        className="w-fit"
        disabled={state.busy || !sshRequestComplete(state.sshRequest)}
        type="submit"
      >
        {state.operation === "adding" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Install
      </Button>
    </form>
  );
}

function sshRequestComplete(request: AddExistingMachineSSHRuntimeRequest): boolean {
  return (
    request.sshTarget.trim() !== "" &&
    request.tailscaleAuthKey.trim() !== "" &&
    request.settaVersion.trim() !== "" &&
    request.releaseBaseUrl.trim() !== "" &&
    request.installerSha256.trim() !== "" &&
    request.minisignPublicKey.trim() !== ""
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
  onCreateDevicePairing,
  onRemove,
  onSwitch,
  runtimes,
  status,
}: {
  busy: boolean;
  onCreateDevicePairing: () => Promise<{ pairingUrl: string }>;
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
          onCreateDevicePairing={onCreateDevicePairing}
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
  onCreateDevicePairing,
  onRemove,
  onSwitch,
  runtime,
}: {
  busy: boolean;
  onCreateDevicePairing: () => Promise<{ pairingUrl: string }>;
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
        <RuntimeRowStatusAction
          busy={busy}
          onCreateDevicePairing={onCreateDevicePairing}
          onRemove={onRemove}
          runtime={runtime}
        />
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
  onCreateDevicePairing,
  onRemove,
  runtime,
}: {
  busy: boolean;
  onCreateDevicePairing: () => Promise<{ pairingUrl: string }>;
  onRemove: (runtimeId: string) => void;
  runtime: KnownRuntimeView;
}) {
  const [open, setOpen] = useState(false);
  const [pairingURL, setPairingURL] = useState<string | null>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const addressClipboard = useClipboardCopyState();
  const pairingClipboard = useClipboardCopyState();
  const address = runtimeAddress(runtime.baseUrl);
  const canPairPhone = runtime.active && runtime.connectionStatus === "connected";

  useRuntimeMenuDismissal(open, anchorRef, menuRef, setOpen);

  async function copyPairingURL() {
    if (pairingURL) {
      await pairingClipboard.copyText(pairingURL);
    }
  }

  async function createPhonePairing() {
    if (!canPairPhone) {
      return;
    }
    try {
      const pairing = await onCreateDevicePairing();
      setPairingURL(pairing.pairingUrl);
    } catch {
      setPairingURL(null);
    }
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
        <RuntimePairPhoneMenuItem
          busy={busy}
          canPairPhone={canPairPhone}
          onCreate={() => void createPhonePairing()}
        />
        <RuntimePairingURLMenuItem
          copyState={pairingClipboard.copyState}
          displayName={runtime.displayName}
          onCopy={() => void copyPairingURL()}
          pairingURL={pairingURL}
        />
        <RuntimeAddressMenuItem
          address={address}
          copyState={addressClipboard.copyState}
          displayName={runtime.displayName}
          onCopy={() => void addressClipboard.copyText(address)}
        />
        <RuntimeRemoveMenuItem
          busy={busy}
          isLocal={runtime.isLocal}
          onRemove={() => {
            setOpen(false);
            onRemove(runtime.runtimeId);
          }}
        />
      </FloatingMenu>
    </span>
  );
}

type ClipboardCopyState = "copied" | "failed" | "idle";

function useClipboardCopyState() {
  const [copyState, setCopyState] = useState<ClipboardCopyState>("idle");
  const resetRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetRef.current !== null) {
        window.clearTimeout(resetRef.current);
      }
    },
    [],
  );

  async function copyText(text: string) {
    if (resetRef.current !== null) {
      window.clearTimeout(resetRef.current);
      resetRef.current = null;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    resetRef.current = window.setTimeout(() => {
      setCopyState("idle");
      resetRef.current = null;
    }, 1500);
  }

  return { copyState, copyText };
}

function useRuntimeMenuDismissal(
  open: boolean,
  anchorRef: RefObject<HTMLButtonElement | null>,
  menuRef: RefObject<HTMLDivElement | null>,
  setOpen: Dispatch<SetStateAction<boolean>>,
) {
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
  }, [anchorRef, menuRef, open, setOpen]);
}

function RuntimePairPhoneMenuItem({
  busy,
  canPairPhone,
  onCreate,
}: {
  busy: boolean;
  canPairPhone: boolean;
  onCreate: () => void;
}) {
  if (!canPairPhone) {
    return null;
  }
  return (
    <button
      className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-xs text-popover-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      disabled={busy}
      onClick={onCreate}
      role="menuitem"
      type="button"
    >
      <PairPhoneIcon busy={busy} />
      <span className="truncate">Pair phone</span>
    </button>
  );
}

function PairPhoneIcon({ busy }: { busy: boolean }) {
  if (busy) {
    return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />;
  }
  return <QrCode className="h-3.5 w-3.5 shrink-0" />;
}

function RuntimePairingURLMenuItem({
  copyState,
  displayName,
  onCopy,
  pairingURL,
}: {
  copyState: ClipboardCopyState;
  displayName: string;
  onCopy: () => void;
  pairingURL: string | null;
}) {
  if (!pairingURL) {
    return null;
  }
  return (
    <RuntimeCopyMenuItem
      ariaLabel={`Copy phone pairing URL for ${displayName}`}
      copyState={copyState}
      idleTitle="Copy phone pairing URL"
      label="Phone"
      onCopy={onCopy}
      value={pairingURL}
    />
  );
}

function RuntimeAddressMenuItem({
  address,
  copyState,
  displayName,
  onCopy,
}: {
  address: string;
  copyState: ClipboardCopyState;
  displayName: string;
  onCopy: () => void;
}) {
  return (
    <RuntimeCopyMenuItem
      ariaLabel={`Copy address for ${displayName}`}
      copyState={copyState}
      idleTitle={`Copy ${address}`}
      label="Address"
      onCopy={onCopy}
      value={address}
    />
  );
}

function RuntimeCopyMenuItem({
  ariaLabel,
  copyState,
  idleTitle,
  label,
  onCopy,
  value,
}: {
  ariaLabel: string;
  copyState: ClipboardCopyState;
  idleTitle: string;
  label: string;
  onCopy: () => void;
  value: string;
}) {
  return (
    <div
      aria-label={label === "Phone" ? "Phone pairing URL" : "Runtime address"}
      className="grid grid-cols-[minmax(0,1fr)_1.75rem] items-center gap-1 px-2 py-1.5"
      role="none"
    >
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate text-[10px] font-medium uppercase text-muted-foreground">
          {label}
        </span>
        <span className="truncate font-mono text-[11px] text-popover-foreground">{value}</span>
      </span>
      <button
        aria-label={ariaLabel}
        className={copyButtonClassName(copyState)}
        onClick={onCopy}
        role="menuitem"
        title={copyButtonTitle(copyState, idleTitle)}
        type="button"
      >
        <ClipboardIcon copyState={copyState} />
      </button>
    </div>
  );
}

function RuntimeRemoveMenuItem({
  busy,
  isLocal,
  onRemove,
}: {
  busy: boolean;
  isLocal: boolean;
  onRemove: () => void;
}) {
  if (isLocal) {
    return null;
  }
  return (
    <button
      className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-xs text-destructive hover:bg-destructive/15 hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
      disabled={busy}
      onClick={onRemove}
      role="menuitem"
      type="button"
    >
      <Power className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">Close</span>
    </button>
  );
}

function ClipboardIcon({ copyState }: { copyState: ClipboardCopyState }) {
  if (copyState === "copied") {
    return <Check className="h-3.5 w-3.5" />;
  }
  return <Copy className="h-3.5 w-3.5" />;
}

function copyButtonClassName(copyState: ClipboardCopyState) {
  return cn(
    "grid h-7 w-7 place-items-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground",
    copyState === "copied" && "text-emerald-400",
    copyState === "failed" && "text-destructive",
  );
}

function copyButtonTitle(copyState: ClipboardCopyState, idleTitle: string) {
  switch (copyState) {
    case "copied":
      return "Copied";
    case "failed":
      return "Copy failed";
    case "idle":
      return idleTitle;
  }
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
