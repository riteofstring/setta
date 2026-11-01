import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
} from "../interaction.js";
import {
  getElementTextDirection,
  type WorkspaceTextDirection,
} from "../styles/textDirection.js";
import { useWorkspaceScopeClassName } from "../styles/workspaceScope.js";
import { useWorkspaceHost } from "../workspaceHostContext.js";
import { registerWorkspaceHostElement } from "../workspaceHostInternals.js";

export type WorkspaceDropdownMenuItem = Readonly<{
  disabled?: boolean;
  id: string;
  label: string;
  onSelect: () => void;
}>;

export type WorkspaceDropdownMenuGroup = Readonly<{
  items: ReadonlyArray<WorkspaceDropdownMenuItem>;
  label?: string;
}>;

export type WorkspaceDropdownMenuProps = {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  groups: ReadonlyArray<WorkspaceDropdownMenuGroup>;
  selectedItemId?: string;
  title?: string;
};

function WorkspaceDropdownMenuEntry({
  item,
  selectedItemId,
}: {
  item: WorkspaceDropdownMenuItem;
  selectedItemId: string | undefined;
}) {
  if (selectedItemId === undefined) {
    return (
      <DropdownMenu.Item
        className="setta-workspace-menu-item"
        disabled={item.disabled}
        onSelect={item.onSelect}
        textValue={item.label}
      >
        <span>{item.label}</span>
      </DropdownMenu.Item>
    );
  }
  return (
    <DropdownMenu.RadioItem
      className="setta-workspace-menu-item"
      disabled={item.disabled}
      onSelect={item.onSelect}
      textValue={item.label}
      value={item.id}
    >
      <span>{item.label}</span>
      <DropdownMenu.ItemIndicator className="setta-workspace-menu-item-indicator">
        <svg aria-hidden="true" fill="none" viewBox="0 0 16 16">
          <path d="m3.5 8 3 3 6-6" />
        </svg>
      </DropdownMenu.ItemIndicator>
    </DropdownMenu.RadioItem>
  );
}

export function WorkspaceDropdownMenu({
  ariaLabel,
  children,
  className,
  groups,
  selectedItemId,
  title,
}: WorkspaceDropdownMenuProps) {
  const host = useWorkspaceHost();
  const unregisterContentRef = useRef<(() => void) | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const scopeClassName = useWorkspaceScopeClassName();
  const [direction, setDirection] = useState<WorkspaceTextDirection>("ltr");
  const [open, setOpen] = useState(false);

  const setContentRef = useCallback(
    (content: HTMLDivElement | null) => {
      unregisterContentRef.current?.();
      unregisterContentRef.current = null;
      if (content !== null) {
        unregisterContentRef.current = registerWorkspaceHostElement(
          host,
          content,
        );
      }
    },
    [host],
  );

  useLayoutEffect(
    () => () => {
      unregisterContentRef.current?.();
      unregisterContentRef.current = null;
    },
    [host],
  );

  return (
    <DropdownMenu.Root
      dir={direction}
      modal={false}
      onOpenChange={(nextOpen) => {
        if (nextOpen && triggerRef.current !== null) {
          setDirection(getElementTextDirection(triggerRef.current));
        }
        setOpen(nextOpen);
      }}
      open={open}
    >
      <DropdownMenu.Trigger
        aria-label={ariaLabel}
        className={`setta-workspace-dropdown-menu-trigger ${className ?? ""}`}
        data-setta-workspace-touch-target="compact"
        ref={triggerRef}
        title={title ?? ariaLabel}
        type="button"
      >
        <span className="setta-workspace-dropdown-menu-trigger-content">
          {children}
        </span>
        <svg
          aria-hidden="true"
          className="setta-workspace-dropdown-menu-trigger-chevron"
          fill="none"
          focusable="false"
          viewBox="0 0 16 16"
        >
          <path d="m4 6 4 4 4-4" />
        </svg>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          aria-label={ariaLabel}
          className={`${scopeClassName} setta-workspace-menu setta-workspace-dropdown-menu ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} ${NO_WHEEL_CLASS_NAME}`}
          collisionPadding={8}
          data-workspace-menu-kind="dropdown"
          loop
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus({ preventScroll: true });
          }}
          ref={setContentRef}
          sideOffset={6}
        >
          <DropdownMenu.RadioGroup value={selectedItemId ?? ""}>
            {groups.map((group, groupIndex) => (
              <div
                key={`${group.label ?? "items"}-${groupIndex}`}
                role="presentation"
              >
                {groupIndex > 0 ? (
                  <DropdownMenu.Separator className="setta-workspace-menu-separator" />
                ) : null}
                <DropdownMenu.Group className="setta-workspace-menu-group">
                  {group.label ? (
                    <DropdownMenu.Label className="setta-workspace-menu-label">
                      {group.label}
                    </DropdownMenu.Label>
                  ) : null}
                  {group.items.map((item) => (
                    <WorkspaceDropdownMenuEntry
                      item={item}
                      key={item.id}
                      selectedItemId={selectedItemId}
                    />
                  ))}
                </DropdownMenu.Group>
              </div>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
