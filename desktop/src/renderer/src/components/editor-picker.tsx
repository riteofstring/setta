import type { InstalledEditorApp } from "@shared/types";
import { ChevronDown, Code2, LoaderCircle } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { useEffect, useRef, useState } from "react";

import { cn } from "../lib/utils";
import { FloatingMenu } from "./floating-menu";

type EditorPickerState =
  | { editors: InstalledEditorApp[]; status: "loading" }
  | { editors: InstalledEditorApp[]; status: "ready" }
  | { editors: InstalledEditorApp[]; message: string; status: "error" };

interface EditorPickerButtonState {
  disabled: boolean;
  opening: boolean;
  title: string;
}

export function EditorPicker({ rootPath }: { rootPath: string }) {
  const state = useInstalledEditors();
  const [selectedEditorId, setSelectedEditorId] = useState("");
  const [open, setOpen] = useState(false);
  const [openingEditorId, setOpeningEditorId] = useState("");
  const [openError, setOpenError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selectedEditor = selectedEditorForState(state, selectedEditorId);
  const buttonState = editorPickerButtonState({
    openError,
    openingEditorId,
    rootPath,
    selectedEditor,
    state,
  });
  const openEditor = useEditorOpener({
    openingEditorId,
    rootPath,
    setOpenError,
    setOpeningEditorId,
  });

  useEffect(() => {
    setSelectedEditorId((current) => nextSelectedEditorId(current, state.editors));
  }, [state.editors]);

  useCloseOnOutside(open, rootRef, menuRef, () => setOpen(false));

  return (
    <div className="relative" ref={rootRef}>
      <div className="inline-flex h-6 overflow-hidden rounded-sm border border-zinc-700 bg-zinc-800 text-zinc-300 shadow-sm shadow-black/20">
        <EditorOpenButton editor={selectedEditor} onOpenEditor={openEditor} state={buttonState} />
        <button
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="Choose editor"
          className="grid h-6 w-6 place-items-center border-l border-zinc-700 text-zinc-400 outline-none hover:bg-zinc-700 hover:text-white focus-visible:bg-zinc-700 focus-visible:text-white disabled:pointer-events-none disabled:opacity-40"
          disabled={!rootPath}
          onClick={() => setOpen((current) => !current)}
          title="Choose editor"
          type="button"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
      {open ? (
        <EditorPickerMenu
          anchorRef={rootRef}
          menuRef={menuRef}
          onOpenEditor={openEditor}
          onSelectEditor={setSelectedEditorId}
          onSetOpen={setOpen}
          selectedEditorId={selectedEditor?.id ?? ""}
          state={state}
        />
      ) : null}
    </div>
  );
}

function EditorOpenButton({
  editor,
  onOpenEditor,
  state,
}: {
  editor: InstalledEditorApp | null;
  onOpenEditor: (editor: InstalledEditorApp | null) => Promise<void>;
  state: EditorPickerButtonState;
}) {
  return (
    <button
      aria-label={state.title}
      className="grid h-6 w-7 place-items-center outline-none hover:bg-zinc-700 hover:text-white focus-visible:bg-zinc-700 focus-visible:text-white disabled:pointer-events-none disabled:opacity-40"
      disabled={state.disabled}
      onClick={() => void onOpenEditor(editor)}
      title={state.title}
      type="button"
    >
      {state.opening ? (
        <LoaderCircle className="h-4 w-4 animate-spin" />
      ) : (
        <EditorIcon editor={editor} />
      )}
    </button>
  );
}

function useInstalledEditors(): EditorPickerState {
  const [state, setState] = useState<EditorPickerState>({ editors: [], status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ editors: current.editors, status: "loading" }));
    void window.setta.app
      .installedEditors()
      .then((editors) => {
        if (!cancelled) {
          setState({ editors, status: "ready" });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            editors: [],
            message: error instanceof Error ? error.message : "Unable to read installed editors",
            status: "error",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

function useCloseOnOutside(
  open: boolean,
  rootRef: RefObject<HTMLDivElement | null>,
  menuRef: RefObject<HTMLDivElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const closeOnPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        onClose();
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuRef, onClose, open, rootRef]);
}

function useEditorOpener({
  openingEditorId,
  rootPath,
  setOpenError,
  setOpeningEditorId,
}: {
  openingEditorId: string;
  rootPath: string;
  setOpenError: (message: string | null) => void;
  setOpeningEditorId: (editorId: string) => void;
}) {
  return async (editor: InstalledEditorApp | null) => {
    if (!rootPath || !editor || openingEditorId) {
      return;
    }
    setOpenError(null);
    setOpeningEditorId(editor.id);
    try {
      await window.setta.app.openWorkspaceInEditor(editor.id, rootPath);
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : `Unable to open ${editor.displayName}`);
    } finally {
      setOpeningEditorId("");
    }
  };
}

function selectedEditorForState(state: EditorPickerState, selectedEditorId: string) {
  return state.editors.find((editor) => editor.id === selectedEditorId) ?? state.editors[0] ?? null;
}

function nextSelectedEditorId(currentEditorId: string, editors: InstalledEditorApp[]) {
  return currentEditorId && editors.some((editor) => editor.id === currentEditorId)
    ? currentEditorId
    : (editors[0]?.id ?? "");
}

function editorPickerButtonState({
  openError,
  openingEditorId,
  rootPath,
  selectedEditor,
  state,
}: {
  openError: string | null;
  openingEditorId: string;
  rootPath: string;
  selectedEditor: InstalledEditorApp | null;
  state: EditorPickerState;
}): EditorPickerButtonState {
  const opening = selectedEditor !== null && openingEditorId === selectedEditor.id;
  return {
    disabled: !rootPath || state.status === "loading" || selectedEditor === null || opening,
    opening,
    title:
      openError ??
      (selectedEditor
        ? `Open workspace in ${selectedEditor.displayName}`
        : editorPickerStatus(state)),
  };
}

function EditorPickerMenu({
  anchorRef,
  menuRef,
  onOpenEditor,
  onSelectEditor,
  onSetOpen,
  selectedEditorId,
  state,
}: {
  anchorRef: RefObject<HTMLDivElement | null>;
  menuRef: RefObject<HTMLDivElement | null>;
  onOpenEditor: (editor: InstalledEditorApp) => Promise<void>;
  onSelectEditor: (editorId: string) => void;
  onSetOpen: (open: boolean) => void;
  selectedEditorId: string;
  state: EditorPickerState;
}) {
  return (
    <FloatingMenu
      align="right"
      anchorRef={anchorRef}
      className="w-52 rounded-sm border border-zinc-700 bg-zinc-900/95 p-1.5 text-xs text-zinc-100 shadow-2xl shadow-black/45 backdrop-blur"
      menuRef={menuRef}
      open
      placement="bottom"
      role="menu"
    >
      {state.status === "ready" && state.editors.length > 0 ? (
        state.editors.map((editor) => (
          <EditorMenuItem
            editor={editor}
            key={editor.id}
            onOpenEditor={onOpenEditor}
            onSelectEditor={onSelectEditor}
            onSetOpen={onSetOpen}
            selected={selectedEditorId === editor.id}
          />
        ))
      ) : (
        <div className="px-2 py-2 text-xs text-zinc-500">{editorPickerStatus(state)}</div>
      )}
    </FloatingMenu>
  );
}

function EditorMenuItem({
  editor,
  onOpenEditor,
  onSelectEditor,
  onSetOpen,
  selected,
}: {
  editor: InstalledEditorApp;
  onOpenEditor: (editor: InstalledEditorApp) => Promise<void>;
  onSelectEditor: (editorId: string) => void;
  onSetOpen: (open: boolean) => void;
  selected: boolean;
}) {
  return (
    <button
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-zinc-200 outline-none transition-colors hover:bg-zinc-800 hover:text-white focus-visible:bg-zinc-800 focus-visible:text-white focus-visible:shadow-[inset_0_0_0_1px_rgba(161,161,170,0.5)]",
        selected ? "bg-zinc-800/70 text-white shadow-[inset_0_-1px_0_rgba(212,212,216,0.35)]" : "",
      )}
      onClick={() => {
        onSelectEditor(editor.id);
        onSetOpen(false);
        void onOpenEditor(editor);
      }}
      role="menuitem"
      type="button"
    >
      <EditorIcon editor={editor} />
      <span className="truncate">{editor.displayName}</span>
    </button>
  );
}

function EditorIcon({ editor }: { editor: InstalledEditorApp | null }) {
  if (editor?.iconDataUrl.trim()) {
    return (
      <img
        alt=""
        className="h-4 w-4 shrink-0 rounded-[3px]"
        draggable={false}
        src={editor.iconDataUrl}
      />
    );
  }
  if (editor) {
    return <EditorFallbackIcon editorId={editor.id} />;
  }
  return <Code2 className="h-3.5 w-3.5 shrink-0" />;
}

function EditorFallbackIcon({ editorId }: { editorId: string }) {
  const icon = editorFallbackIcons[editorId] ?? defaultEditorFallbackIcon;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid h-4 w-4 shrink-0 place-items-center overflow-hidden rounded-[3px] border text-[9px] font-semibold leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]",
        icon.className,
      )}
    >
      {icon.mark}
    </span>
  );
}

interface EditorFallbackIconDefinition {
  className: string;
  mark: ReactNode;
}

const defaultEditorFallbackIcon = {
  className: "border-zinc-600 bg-zinc-800 text-zinc-300",
  mark: <Code2 className="h-3 w-3" />,
} satisfies EditorFallbackIconDefinition;

const editorFallbackIcons: Record<string, EditorFallbackIconDefinition> = {
  "android-studio": {
    className: "border-emerald-400/40 bg-emerald-600/90 text-white",
    mark: "A",
  },
  cursor: {
    className: "border-zinc-600 bg-zinc-950 text-zinc-200",
    mark: "C",
  },
  default: defaultEditorFallbackIcon,
  finder: {
    className: "border-sky-300/40 bg-sky-500/90 text-white",
    mark: "F",
  },
  ghostty: {
    className: "border-indigo-300/40 bg-indigo-600/90 text-white",
    mark: ">",
  },
  terminal: {
    className: "border-zinc-600 bg-zinc-950 text-zinc-100",
    mark: ">",
  },
  vscode: {
    className: "border-sky-300/40 bg-sky-600/90 text-white",
    mark: "<>",
  },
  zed: {
    className: "border-zinc-500/60 bg-zinc-800 text-zinc-100",
    mark: "Z",
  },
};

function editorPickerStatus(state: EditorPickerState) {
  switch (state.status) {
    case "loading":
      return "Reading editors";
    case "ready":
      return "No editors found";
    case "error":
      return state.message;
    default:
      return assertNever(state);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled editor picker state: ${String(value)}`);
}
