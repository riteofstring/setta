import type { CloudRuntimeProvisionResourceView } from "@shared/types";
import { AlertTriangle, Check, Cloud, Copy, Ellipsis } from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";

import { cn } from "../lib/utils";
import { FloatingMenu } from "./floating-menu";

export function CloudProvisionResourceList({
  busy,
  resources,
}: {
  busy: boolean;
  resources: CloudRuntimeProvisionResourceView[];
}) {
  if (resources.length === 0) {
    return null;
  }
  return (
    <section aria-label="Cloud resources" className="grid gap-0.5">
      <div className="px-2 pt-1 text-[10px] font-medium uppercase text-muted-foreground">
        Cloud resources
      </div>
      <ul className="grid gap-0.5">
        {resources.map((resource) => (
          <CloudProvisionResourceRow busy={busy} key={resource.recordId} resource={resource} />
        ))}
      </ul>
    </section>
  );
}

function CloudProvisionResourceRow({
  busy,
  resource,
}: {
  busy: boolean;
  resource: CloudRuntimeProvisionResourceView;
}) {
  return (
    <li className="group/runtime min-w-0">
      <article className="flex min-w-0 w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-accent/45 focus-within:bg-accent/45">
        <CloudResourceIcon resource={resource} />
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="truncate text-xs font-medium text-sidebar-foreground">
            {resource.runtimeName}
          </span>
          <span className="truncate text-[11px] text-muted-foreground">
            {resource.infrastructureProvider.displayName} / {resource.region} / {resource.status}
          </span>
          <span className="line-clamp-2 text-[11px] leading-4 text-muted-foreground">
            {resource.billingWarning ?? resource.statusMessage}
          </span>
        </span>
        <CloudProvisionResourceMenu busy={busy} resource={resource} />
      </article>
    </li>
  );
}

function CloudResourceIcon({ resource }: { resource: CloudRuntimeProvisionResourceView }) {
  if (
    resource.infrastructureProvider.id !== "unknown" &&
    resource.infrastructureProvider.iconUrl.trim() !== ""
  ) {
    return <RuntimeProviderIcon provider={resource.infrastructureProvider} />;
  }
  return <Cloud className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
}

function RuntimeProviderIcon({
  provider,
}: {
  provider: CloudRuntimeProvisionResourceView["infrastructureProvider"];
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <Cloud className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  }
  return (
    <span
      className="mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center overflow-hidden rounded-[2px]"
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

function CloudProvisionResourceMenu({
  busy,
  resource,
}: {
  busy: boolean;
  resource: CloudRuntimeProvisionResourceView;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useCloudResourceMenuDismissal(open, anchorRef, menuRef, setOpen);
  return (
    <span className="relative mt-0.5 grid h-5 w-5 shrink-0 place-items-center">
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Open cleanup options for ${resource.runtimeName}`}
        className={cn(
          "absolute inset-0 grid place-items-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:opacity-100 disabled:pointer-events-none disabled:opacity-20",
          open && "bg-accent text-foreground opacity-100",
        )}
        disabled={busy}
        onClick={() => setOpen((current) => !current)}
        ref={anchorRef}
        title={`Cleanup options for ${resource.runtimeName}`}
        type="button"
      >
        <Ellipsis className="h-3.5 w-3.5" />
      </button>
      <FloatingMenu
        align="right"
        anchorRef={anchorRef}
        ariaLabel={`Cleanup options for ${resource.runtimeName}`}
        className="w-72 rounded-sm border border-border bg-popover/95 p-1 shadow-xl shadow-black/35 backdrop-blur"
        menuRef={menuRef}
        open={open}
        role="menu"
      >
        <CloudProvisionResourceSummary resource={resource} />
        <RuntimeCommandCopyMenuItem
          command={resource.commands.inspect}
          label="Inspect"
          title={`Copy inspect command for ${resource.runtimeName}`}
        />
        <RuntimeCommandCopyMenuItem
          command={resource.commands.diagnose}
          label="Diagnose"
          title={`Copy diagnose command for ${resource.runtimeName}`}
        />
        <RuntimeCommandCopyMenuItem
          command={resource.commands.teardownPlan}
          label="Teardown plan"
          title={`Copy teardown plan command for ${resource.runtimeName}`}
        />
        <RuntimeCommandCopyMenuItem
          command={resource.commands.teardownApprove}
          label="Delete command"
          title={`Copy approved teardown command for ${resource.runtimeName}`}
        />
      </FloatingMenu>
    </span>
  );
}

function CloudProvisionResourceSummary({
  resource,
}: {
  resource: CloudRuntimeProvisionResourceView;
}) {
  return (
    <div className="grid gap-1 px-2 py-1.5 text-[11px] leading-4 text-muted-foreground">
      <span className="break-words text-popover-foreground">{resource.statusMessage}</span>
      <span className="break-words">{resource.cleanupSummary}</span>
      <span className="truncate font-mono">{resource.recordId}</span>
    </div>
  );
}

function RuntimeCommandCopyMenuItem({
  command,
  label,
  title,
}: {
  command: string | null;
  label: string;
  title: string;
}) {
  const commandClipboard = useClipboardCopyState();
  if (command === null) {
    return null;
  }
  return (
    <RuntimeCopyMenuItem
      ariaLabel={title}
      copyState={commandClipboard.copyState}
      idleTitle={title}
      label={label}
      onCopy={() => void commandClipboard.copyText(command)}
      value={command}
    />
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

function useCloudResourceMenuDismissal(
  open: boolean,
  anchorRef: RefObject<HTMLButtonElement | null>,
  menuRef: RefObject<HTMLDivElement | null>,
  setOpen: (open: boolean) => void,
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
      aria-label={label}
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

function ClipboardIcon({ copyState }: { copyState: ClipboardCopyState }) {
  if (copyState === "copied") {
    return <Check className="h-3.5 w-3.5" />;
  }
  if (copyState === "failed") {
    return <AlertTriangle className="h-3.5 w-3.5" />;
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
