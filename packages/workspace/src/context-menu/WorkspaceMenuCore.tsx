import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEventHandler,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { WorkspaceCommandIconProps } from "../commands/workspaceCommandTypes";
import type { WorkspaceTextDirection } from "../styles/textDirection";
import { useWorkspaceScopeClassName } from "../styles/workspaceScope";
import { placeWorkspaceMenu, type WorkspaceMenuClientPoint } from "./workspaceMenuGeometry";
import { closeWorkspaceMenu } from "./workspaceMenuState";

export type WorkspaceMenuEntry = {
  id: string;
  label: string;
  icon?: ComponentType<WorkspaceCommandIconProps>;
  checked?: boolean;
  // Why a disabled entry refuses to run. Menus keep their accepted item text and expose the same
  // explanation the Inspector prints, through the item's pointer title and accessible description.
  description?: string;
  disabled: boolean;
  onSelect: () => void;
};

function getMenuEntryDescriptionId(entryId: string): string {
  return `setta-workspace-menu-reason-${entryId}`;
}

export function WorkspaceMenuEntryDescriptions({
  entries,
}: {
  entries: ReadonlyArray<WorkspaceMenuEntry>;
}) {
  const describedEntries = entries.filter((entry) => entry.description !== undefined);
  if (describedEntries.length === 0) {
    return null;
  }
  return (
    <div className="sr-only">
      {describedEntries.map((entry) => (
        <span id={getMenuEntryDescriptionId(entry.id)} key={entry.id}>
          {entry.description}
        </span>
      ))}
    </div>
  );
}

type WorkspaceMenuCoreProps = {
  ariaLabel: string;
  children: ReactNode;
  clientPoint: WorkspaceMenuClientPoint;
  direction: WorkspaceTextDirection;
  initialFocus: () => void;
  invocationSequence: number;
  kind: "item" | "pane" | "section";
  onKeyDownCapture?: KeyboardEventHandler<HTMLDivElement>;
};

export function WorkspaceMenuCore({
  ariaLabel,
  children,
  clientPoint,
  direction,
  initialFocus,
  invocationSequence,
  kind,
  onKeyDownCapture,
}: WorkspaceMenuCoreProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef(initialFocus);
  const scopeClassName = useWorkspaceScopeClassName();
  const [position, setPosition] = useState({ left: -9999, top: -9999, opacity: 0 });

  useLayoutEffect(() => {
    initialFocusRef.current = initialFocus;
  }, [initialFocus]);

  useLayoutEffect(() => {
    setPosition({ left: -9999, top: -9999, opacity: 0 });
    const frame = requestAnimationFrame(() => {
      const content = contentRef.current;
      if (!content) {
        throw new Error("Workspace menu content did not mount before placement.");
      }
      const rect = content.getBoundingClientRect();
      const next = placeWorkspaceMenu({
        invocation: clientPoint,
        menuWidth: rect.width,
        menuHeight: rect.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
      setPosition({ left: next.x, top: next.y, opacity: 1 });
      initialFocusRef.current();
    });
    return () => cancelAnimationFrame(frame);
  }, [clientPoint, invocationSequence]);

  return createPortal(
    <DropdownMenu.Root
      dir={direction}
      modal={false}
      onOpenChange={(open) => {
        if (!open) {
          closeWorkspaceMenu();
        }
      }}
      open={true}
    >
      <DropdownMenu.Content
        aria-label={ariaLabel}
        className={`${scopeClassName} setta-workspace-menu`}
        data-workspace-menu-kind={kind}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onKeyDownCapture={onKeyDownCapture}
        ref={contentRef}
        style={position}
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Root>,
    document.body,
  );
}

export function WorkspaceMenuItem({
  entry,
  registerElement,
}: {
  entry: WorkspaceMenuEntry;
  registerElement: (element: HTMLDivElement | null) => void;
}) {
  const Icon = entry.icon;
  const content = (
    <>
      {Icon ? (
        <span aria-hidden="true" className="setta-workspace-menu-item-icon">
          <Icon />
        </span>
      ) : null}
      <span>{entry.label}</span>
      {entry.checked === undefined ? null : (
        <DropdownMenu.ItemIndicator className="ms-auto inline-flex h-3.5 w-3.5 items-center justify-center">
          <svg
            aria-hidden="true"
            className="h-3 w-3"
            fill="none"
            focusable="false"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 16 16"
          >
            <path d="m3.5 8 3 3 6-6" />
          </svg>
        </DropdownMenu.ItemIndicator>
      )}
    </>
  );

  const descriptionProps =
    entry.description === undefined
      ? {}
      : {
          "aria-describedby": getMenuEntryDescriptionId(entry.id),
          title: entry.description,
        };

  if (entry.checked !== undefined) {
    return (
      <DropdownMenu.CheckboxItem
        checked={entry.checked}
        className="setta-workspace-menu-item"
        disabled={entry.disabled}
        onSelect={entry.onSelect}
        ref={registerElement}
        textValue={entry.label}
        {...descriptionProps}
      >
        {content}
      </DropdownMenu.CheckboxItem>
    );
  }

  return (
    <DropdownMenu.Item
      className="setta-workspace-menu-item"
      disabled={entry.disabled}
      onSelect={entry.onSelect}
      ref={registerElement}
      textValue={entry.label}
      {...descriptionProps}
    >
      {content}
    </DropdownMenu.Item>
  );
}

export function WorkspaceMenuLabel({ children }: { children: ReactNode }) {
  return <DropdownMenu.Label className="setta-workspace-menu-label">{children}</DropdownMenu.Label>;
}

export function WorkspaceMenuGroup({ children }: { children: ReactNode }) {
  return <DropdownMenu.Group className="setta-workspace-menu-group">{children}</DropdownMenu.Group>;
}

export function WorkspaceMenuSeparator() {
  return <DropdownMenu.Separator className="setta-workspace-menu-separator" />;
}

export function WorkspaceActionMenu({
  ariaLabel,
  clientPoint,
  direction,
  groups,
  initialFocus = "first",
  invocationSequence,
  kind,
}: {
  ariaLabel: string;
  clientPoint: WorkspaceMenuClientPoint;
  direction: WorkspaceTextDirection;
  groups: ReadonlyArray<{
    label?: string;
    entries: ReadonlyArray<WorkspaceMenuEntry>;
  }>;
  initialFocus?: "first" | "last";
  invocationSequence: number;
  kind: "item" | "section";
}) {
  const itemElementsRef = useRef(new Map<string, HTMLDivElement>());
  const entries = groups.flatMap((group) => group.entries);

  function focusInitialItem(): void {
    const candidates = initialFocus === "last" ? [...entries].reverse() : entries;
    const entry = candidates.find((candidate) => !candidate.disabled) ?? candidates[0];
    if (!entry) {
      throw new Error("Workspace action menu requires at least one entry.");
    }
    itemElementsRef.current.get(entry.id)?.focus({ preventScroll: true });
  }

  return (
    <WorkspaceMenuCore
      ariaLabel={ariaLabel}
      clientPoint={clientPoint}
      direction={direction}
      initialFocus={focusInitialItem}
      invocationSequence={invocationSequence}
      kind={kind}
    >
      {groups.map((group, groupIndex) => (
        <div key={`${group.label ?? "items"}-${groupIndex}`} role="presentation">
          {groupIndex > 0 ? <WorkspaceMenuSeparator /> : null}
          <WorkspaceMenuGroup>
            {group.label ? <WorkspaceMenuLabel>{group.label}</WorkspaceMenuLabel> : null}
            {group.entries.map((entry) => (
              <WorkspaceMenuItem
                entry={entry}
                key={entry.id}
                registerElement={(element) => {
                  if (element) {
                    itemElementsRef.current.set(entry.id, element);
                  } else {
                    itemElementsRef.current.delete(entry.id);
                  }
                }}
              />
            ))}
          </WorkspaceMenuGroup>
        </div>
      ))}
      <WorkspaceMenuEntryDescriptions entries={entries} />
    </WorkspaceMenuCore>
  );
}
