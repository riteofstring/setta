import type { WorkspaceAvailability, WorkspaceSummary } from "@generated/backend";
import { AlertTriangle, X } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Virtuoso } from "react-virtuoso";

import { MasterSidebarLauncher } from "../features/global-master/app-shell-master-surface";
import { useConversationNavigatorStore } from "../stores/conversation-navigator-store";
import { useConversationPaneStore } from "../stores/conversation-pane-store";
import { hydrateConversationProjectionSnapshot } from "../stores/conversation-projection-runtime";
import { RuntimePicker, RuntimePickerAddButton } from "./runtime-picker";
import {
  defaultSidebarSections,
  SidebarAccordionSection,
  type SidebarSectionId,
  type SidebarSectionState,
} from "./sidebar-accordion";
import { ConversationSectionHeaderActions } from "./sidebar-header-actions";
import { EmptySectionSpace, SidebarSettingsButton } from "./sidebar-secondary-sections";
import { SettaLogoMark } from "./setta-logo-mark";
import {
  selectSidebarNavigationItems,
  type SidebarNavigationCommand,
  type SidebarNavigationItem,
} from "./workspace-sidebar-model";
import { SidebarNavigationRow } from "./workspace-sidebar-navigation-rows";
import type { ConversationPanePresentationRequest } from "../workspace-layout/conversation-pane-coordinator";

const sidebarNavigationMaxHeight = 480;
const sidebarNavigationRowHeight = 36;
const workspaceListOverscan = 6;
const noScrollAnchoringStyle = { overflowAnchor: "none" } satisfies CSSProperties;
const noop = () => {};

interface WorkspaceSidebarProps {
  activeWorkspaces: readonly WorkspaceSummary[];
  busy: boolean;
  clearConversationPresentationError?: () => void;
  clearWorkspaceError?: () => void;
  closeWorkspace: (id: string) => Promise<void>;
  conversationPresentationError?: string | null;
  createConversation: (workspaceId: string) => Promise<void>;
  openLocalFolder: () => Promise<void>;
  openMasterOverlay?: () => void;
  openSettingsPane: () => void;
  openWorkspacePath: (rootPath: string) => Promise<void>;
  presentConversation: (
    workspaceId: string,
    conversationId: string,
    title: string,
    viewAction: ConversationPanePresentationRequest["viewAction"],
  ) => Promise<void>;
  recentWorkspaces: readonly WorkspaceSummary[];
  removeRecent: (id: string) => Promise<void>;
  selectWorkspace: (id: string) => Promise<void>;
  selectedWorkspaceId: string;
  showFooterSettings?: boolean;
  showLogoHeader?: boolean;
  sidebarWidth?: number;
  masterUnavailable?: boolean;
  workspaceError?: string | null;
  workspaceAvailabilities: readonly WorkspaceAvailability[];
}

type NormalizedWorkspaceSidebarProps = Omit<
  WorkspaceSidebarProps,
  | "clearConversationPresentationError"
  | "clearWorkspaceError"
  | "conversationPresentationError"
  | "showFooterSettings"
  | "showLogoHeader"
  | "sidebarWidth"
  | "workspaceError"
> &
  Required<
    Pick<
      WorkspaceSidebarProps,
      | "clearConversationPresentationError"
      | "clearWorkspaceError"
      | "conversationPresentationError"
      | "showFooterSettings"
      | "showLogoHeader"
      | "sidebarWidth"
      | "workspaceError"
    >
  >;

export function WorkspaceSidebar(props: WorkspaceSidebarProps) {
  return <WorkspaceSidebarContent {...normalizeWorkspaceSidebarProps(props)} />;
}

function WorkspaceSidebarContent({
  activeWorkspaces,
  busy,
  clearConversationPresentationError,
  clearWorkspaceError,
  closeWorkspace,
  conversationPresentationError,
  createConversation,
  openLocalFolder,
  openMasterOverlay,
  openSettingsPane,
  openWorkspacePath,
  presentConversation,
  recentWorkspaces,
  removeRecent,
  selectWorkspace,
  selectedWorkspaceId,
  showFooterSettings,
  showLogoHeader,
  sidebarWidth,
  masterUnavailable = false,
  workspaceError,
  workspaceAvailabilities,
}: NormalizedWorkspaceSidebarProps) {
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useState<ReadonlySet<string>>(
    () => new Set(selectedWorkspaceId ? [selectedWorkspaceId] : []),
  );
  const [sections, setSections] =
    useState<Record<SidebarSectionId, SidebarSectionState>>(defaultSidebarSections);
  const [runtimePairingOpen, setRuntimePairingOpen] = useState(false);
  const subscribedConversationWorkspaces = useConversationNavigatorStore(
    (state) => state.workspaces,
  );
  const conversationWorkspaces =
    Object.keys(subscribedConversationWorkspaces).length > 0
      ? subscribedConversationWorkspaces
      : useConversationNavigatorStore.getState().workspaces;
  const loadMoreConversations = useConversationNavigatorStore((state) => state.loadMore);
  const subscribedConversationPanes = useConversationPaneStore((state) => state.workspaces);
  const conversationPanes =
    subscribedConversationPanes.size > 0
      ? subscribedConversationPanes
      : useConversationPaneStore.getState().workspaces;
  useEffect(() => {
    if (!selectedWorkspaceId) {
      return;
    }
    setExpandedWorkspaceIds((current) =>
      current.has(selectedWorkspaceId) ? current : new Set([...current, selectedWorkspaceId]),
    );
  }, [selectedWorkspaceId]);
  const visibleError = navigationError ?? conversationPresentationError ?? workspaceError;
  function dismissVisibleError() {
    if (navigationError) {
      setNavigationError(null);
    } else if (conversationPresentationError) {
      clearConversationPresentationError();
    } else {
      clearWorkspaceError();
    }
  }
  function setSectionOpen(sectionId: SidebarSectionId, open: boolean) {
    setSections((current) => ({ ...current, [sectionId]: { ...current[sectionId], open } }));
  }
  function setSectionHeight(sectionId: SidebarSectionId, height: number) {
    setSections((current) => ({
      ...current,
      [sectionId]: { ...current[sectionId], height, resized: true },
    }));
  }
  async function createSelectedConversation() {
    await createConversation(selectedWorkspaceId);
  }

  return (
    <aside
      className="setta-sidebar-surface relative flex h-full min-h-0 w-full min-w-0 flex-col text-sidebar-foreground"
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <SidebarLogoHeader visible={showLogoHeader} />
      <div className="setta-sidebar-content-shell shrink-0 px-1 pb-2">
        <WorkspaceMasterLauncher disabled={masterUnavailable} onOpen={openMasterOverlay} />
        <SidebarAccordionSection
          action={
            <RuntimePickerAddButton adding={runtimePairingOpen} setAdding={setRuntimePairingOpen} />
          }
          height={sections.runtime.height}
          onHeightChange={(height) => setSectionHeight("runtime", height)}
          onOpenChange={(open) => setSectionOpen("runtime", open)}
          open={sections.runtime.open}
          resized={sections.runtime.resized}
          testId="runtime-section"
          title="Runtime"
        >
          <RuntimePicker adding={runtimePairingOpen} setAdding={setRuntimePairingOpen} />
        </SidebarAccordionSection>
        <SidebarOperationError message={visibleError} onDismiss={dismissVisibleError} />
      </div>
      <div
        className="setta-sidebar-scroll-shell min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-1"
        data-testid="sidebar-scrollable-sections"
        style={noScrollAnchoringStyle}
      >
        <SidebarAccordionSection
          action={
            <ConversationSectionHeaderActions
              busy={busy}
              createConversation={createSelectedConversation}
              disabled={selectedWorkspaceId.length === 0}
              openLocalFolder={openLocalFolder}
            />
          }
          actionVisibility="always"
          height={sections.projects.height}
          onHeightChange={(height) => setSectionHeight("projects", height)}
          onOpenChange={(open) => setSectionOpen("projects", open)}
          open={sections.projects.open}
          resized={sections.projects.resized}
          testId="projects-section"
          title="Conversations"
        >
          {activeWorkspaces.length === 0 && recentWorkspaces.length === 0 ? (
            <EmptySectionSpace />
          ) : (
            <ConversationNavigationList
              activeWorkspaces={activeWorkspaces}
              busy={busy}
              conversationPanes={conversationPanes}
              conversationWorkspaces={conversationWorkspaces}
              expandedWorkspaceIds={expandedWorkspaceIds}
              loadMoreConversations={loadMoreConversations}
              onCommandError={setNavigationError}
              openWorkspacePath={openWorkspacePath}
              presentConversation={presentConversation}
              recentWorkspaces={recentWorkspaces}
              removeRecent={removeRecent}
              selectWorkspace={selectWorkspace}
              selectedWorkspaceId={selectedWorkspaceId}
              workspaceAvailabilities={workspaceAvailabilities}
              setExpandedWorkspaceIds={setExpandedWorkspaceIds}
              closeWorkspace={closeWorkspace}
            />
          )}
        </SidebarAccordionSection>
      </div>
      <SidebarFooterSettings onOpenSettings={openSettingsPane} visible={showFooterSettings} />
    </aside>
  );
}

function WorkspaceMasterLauncher({
  disabled,
  onOpen,
}: {
  disabled: boolean;
  onOpen: (() => void) | undefined;
}) {
  if (!onOpen) {
    return null;
  }
  return <MasterSidebarLauncher disabled={disabled} onOpen={onOpen} />;
}

function normalizeWorkspaceSidebarProps(
  props: WorkspaceSidebarProps,
): NormalizedWorkspaceSidebarProps {
  return {
    ...props,
    clearConversationPresentationError: props.clearConversationPresentationError ?? noop,
    clearWorkspaceError: props.clearWorkspaceError ?? noop,
    conversationPresentationError: props.conversationPresentationError ?? null,
    showFooterSettings: props.showFooterSettings ?? true,
    showLogoHeader: props.showLogoHeader ?? true,
    sidebarWidth: props.sidebarWidth ?? 220,
    workspaceError: props.workspaceError ?? null,
  };
}

function ConversationNavigationList({
  activeWorkspaces,
  busy,
  closeWorkspace,
  conversationPanes,
  conversationWorkspaces,
  expandedWorkspaceIds,
  loadMoreConversations,
  onCommandError,
  openWorkspacePath,
  presentConversation,
  recentWorkspaces,
  removeRecent,
  selectWorkspace,
  selectedWorkspaceId,
  workspaceAvailabilities,
  setExpandedWorkspaceIds,
}: Pick<
  WorkspaceSidebarProps,
  | "activeWorkspaces"
  | "busy"
  | "closeWorkspace"
  | "openWorkspacePath"
  | "presentConversation"
  | "recentWorkspaces"
  | "removeRecent"
  | "selectWorkspace"
  | "selectedWorkspaceId"
  | "workspaceAvailabilities"
> & {
  conversationPanes: ReturnType<typeof useConversationPaneStore.getState>["workspaces"];
  conversationWorkspaces: ReturnType<typeof useConversationNavigatorStore.getState>["workspaces"];
  expandedWorkspaceIds: ReadonlySet<string>;
  loadMoreConversations: (workspaceId: string) => Promise<void>;
  onCommandError: (message: string | null) => void;
  setExpandedWorkspaceIds: (update: (current: ReadonlySet<string>) => ReadonlySet<string>) => void;
}) {
  const [commandPending, setCommandPending] = useState(false);
  const items = useMemo(
    () =>
      selectSidebarNavigationItems({
        activeWorkspaces,
        conversationPanes,
        conversationWorkspaces,
        expandedWorkspaceIds,
        recentWorkspaces,
        selectedWorkspaceId,
        workspaceAvailabilities,
      }),
    [
      activeWorkspaces,
      conversationPanes,
      conversationWorkspaces,
      expandedWorkspaceIds,
      recentWorkspaces,
      selectedWorkspaceId,
      workspaceAvailabilities,
    ],
  );

  async function runCommand(command: SidebarNavigationCommand) {
    if (commandPending) {
      return;
    }
    setCommandPending(true);
    onCommandError(null);
    try {
      await executeSidebarNavigationCommand(command, {
        closeWorkspace,
        loadMoreConversations,
        openWorkspacePath,
        presentConversation,
        removeRecent,
        selectWorkspace,
        selectedWorkspaceId,
        setExpandedWorkspaceIds,
      });
    } catch (error) {
      onCommandError(errorMessage(error));
    } finally {
      setCommandPending(false);
    }
  }

  return (
    <div
      aria-label="Conversations"
      className="min-h-0 overflow-hidden"
      data-testid="active-workspace-list"
      style={sidebarNavigationListStyle(items.length)}
    >
      <VirtualWorkspaceList
        items={items}
        renderItem={(item) => (
          <SidebarNavigationRow busy={busy || commandPending} item={item} runCommand={runCommand} />
        )}
      />
    </div>
  );
}

interface SidebarCommandActions {
  closeWorkspace: WorkspaceSidebarProps["closeWorkspace"];
  loadMoreConversations: (workspaceId: string) => Promise<void>;
  openWorkspacePath: WorkspaceSidebarProps["openWorkspacePath"];
  presentConversation: WorkspaceSidebarProps["presentConversation"];
  removeRecent: WorkspaceSidebarProps["removeRecent"];
  selectWorkspace: WorkspaceSidebarProps["selectWorkspace"];
  selectedWorkspaceId: string;
  setExpandedWorkspaceIds: (update: (current: ReadonlySet<string>) => ReadonlySet<string>) => void;
}

async function executeSidebarNavigationCommand(
  command: SidebarNavigationCommand,
  actions: SidebarCommandActions,
): Promise<void> {
  switch (command.type) {
    case "archiveConversation":
      await archiveConversation(command);
      return;
    case "activateWorkspace":
      await activateWorkspace(command, actions);
      return;
    case "closeWorkspace":
      await actions.closeWorkspace(command.workspaceId);
      return;
    case "loadMoreConversations":
      await actions.loadMoreConversations(command.workspaceId);
      return;
    case "openRecentWorkspace":
      await actions.openWorkspacePath(command.rootPath);
      return;
    case "presentConversation":
      if (command.workspaceId !== actions.selectedWorkspaceId) {
        await actions.selectWorkspace(command.workspaceId);
      }
      await actions.presentConversation(
        command.workspaceId,
        command.conversationId,
        command.title,
        command.viewAction,
      );
      return;
    case "removeRecentWorkspace":
      await actions.removeRecent(command.workspaceId);
      return;
    default:
      assertNever(command);
  }
}

async function archiveConversation(
  command: Extract<SidebarNavigationCommand, { type: "archiveConversation" }>,
): Promise<void> {
  if (
    !window.confirm(
      `Archive "${command.title}"? It will leave the navigator and stop accepting new work.`,
    )
  ) {
    return;
  }
  const snapshot = await window.setta.conversations.archive({
    conversationId: command.conversationId,
    workspaceId: command.workspaceId,
  });
  hydrateConversationProjectionSnapshot(snapshot);
}

async function activateWorkspace(
  command: Extract<SidebarNavigationCommand, { type: "activateWorkspace" }>,
  actions: SidebarCommandActions,
): Promise<void> {
  actions.setExpandedWorkspaceIds((current) => {
    const next = new Set(current);
    if (command.nextExpanded) next.add(command.workspaceId);
    else next.delete(command.workspaceId);
    return next;
  });
  if (command.selectWorkspace) await actions.selectWorkspace(command.workspaceId);
}

function VirtualWorkspaceList({
  items,
  renderItem,
}: {
  items: SidebarNavigationItem[];
  renderItem: (item: SidebarNavigationItem) => ReactNode;
}) {
  return (
    <Virtuoso
      className="h-full min-h-0 overflow-y-auto overscroll-contain"
      data={items}
      data-testid="conversation-navigation-list"
      fixedItemHeight={sidebarNavigationRowHeight}
      initialItemCount={Math.min(
        items.length,
        Math.ceil(sidebarNavigationMaxHeight / sidebarNavigationRowHeight) + workspaceListOverscan,
      )}
      itemContent={(_, item) => (
        <div data-testid={sidebarItemTestId(item)} style={{ height: sidebarNavigationRowHeight }}>
          {renderItem(item)}
        </div>
      )}
      overscan={workspaceListOverscan * sidebarNavigationRowHeight}
      style={noScrollAnchoringStyle}
    />
  );
}

function SidebarLogoHeader({ visible }: { visible: boolean }) {
  return visible ? (
    <div
      className="setta-sidebar-logo-shell app-drag flex h-[50px] shrink-0 items-center justify-end px-4"
      data-setta-shell-title-bar="true"
      data-testid="sidebar-logo-shell"
    >
      <SettaLogoMark height={14} />
    </div>
  ) : null;
}

function SidebarFooterSettings({
  onOpenSettings,
  visible,
}: {
  onOpenSettings: () => void;
  visible: boolean;
}) {
  return visible ? (
    <div className="setta-sidebar-footer grid shrink-0 gap-0.5 px-1 py-1">
      <SidebarSettingsButton onOpenSettings={onOpenSettings} />
    </div>
  ) : null;
}

function SidebarOperationError({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  return message ? (
    <div
      className="mt-2 flex min-w-0 items-start gap-2 rounded-sm border border-destructive/35 bg-destructive/10 px-2 py-1.5 text-xs text-destructive"
      data-testid="workspace-operation-error"
      role="alert"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0 flex-1 break-words leading-4">{message}</div>
      <button aria-label="Dismiss workspace error" onClick={onDismiss} type="button">
        <X className="h-3 w-3" />
      </button>
    </div>
  ) : null;
}

function sidebarNavigationListStyle(itemCount: number): CSSProperties {
  return { height: Math.min(itemCount * sidebarNavigationRowHeight, sidebarNavigationMaxHeight) };
}

function sidebarItemTestId(item: SidebarNavigationItem) {
  switch (item.kind) {
    case "activeWorkspace":
      return "active-workspace-item";
    case "conversation":
      return "conversation-navigator-row";
    case "conversationStatus":
      return "conversation-status-item";
    case "loadMoreConversations":
      return "conversation-more-item";
    case "recentWorkspace":
      return "recent-workspace-item";
    default:
      return assertNever(item);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Conversation navigation failed";
}

function assertNever(value: never): never {
  throw new Error(`Unsupported sidebar value: ${JSON.stringify(value)}`);
}
