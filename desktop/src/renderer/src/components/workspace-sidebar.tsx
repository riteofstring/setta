import type { Run, WorkspaceSummary } from "@generated/backend";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Virtuoso } from "react-virtuoso";

import { cn } from "../lib/utils";
import { useChatStore } from "../stores/chat-store";
import { useWorkflowDefinitionStore } from "../stores/workflow-definition-store";
import {
  defaultSidebarSections,
  SidebarAccordionSection,
  type SidebarSectionId,
  type SidebarSectionState,
} from "./sidebar-accordion";
import {
  selectSidebarNavigationItems,
  type SidebarNavigationCommand,
  type SidebarNavigationItem,
} from "./workspace-sidebar-model";
import { EmptySectionSpace, SidebarSettingsButton } from "./sidebar-secondary-sections";
import { ProjectFolderButton } from "./sidebar-header-actions";
import { SidebarShortcuts } from "./sidebar-shortcuts";
import {
  conversationCorruptionLabels,
  SidebarNavigationRow,
  sidebarWorkspaceDiagnostics,
  type SidebarWorkspaceConversationState,
  type SidebarWorkspaceWorkflowDefinitionState,
} from "./workspace-sidebar-navigation-rows";

const chatHistoryLimit = 80;
const sidebarNavigationMaxHeight = 360;
const sidebarNavigationRowHeight = 28;
const workspaceListOverscan = 6;
const noScrollAnchoringStyle = { overflowAnchor: "none" } satisfies CSSProperties;

interface WorkspaceSidebarProps {
  activeRun: Run | null;
  activeWorkspaces: WorkspaceSummary[];
  busy: boolean;
  chromeInsetTop?: boolean;
  closeWorkspace: (id: string) => Promise<void>;
  createConversation: (title?: string) => Promise<void>;
  createWorkspaceConversation: (workspaceId: string, title?: string) => Promise<void>;
  openLocalFolder: () => Promise<void>;
  openWorkflowGraphPane: () => void;
  openWorkspacePath: (rootPath: string) => Promise<void>;
  openSettingsPane: () => void;
  recentWorkspaces: WorkspaceSummary[];
  removeRecent: (id: string) => Promise<void>;
  selectConversation: (conversationId: string, workspaceId?: string) => Promise<void>;
  selectWorkspace: (id: string) => Promise<void>;
  selectedConversationId: string;
  selectedWorkspaceId: string;
  sidebarWidth?: number;
}

interface VirtualWorkspaceListProps {
  items: SidebarNavigationItem[];
  renderItem: (item: SidebarNavigationItem) => ReactNode;
  rowHeight: number;
  testId: string;
}

export function WorkspaceSidebar({
  activeRun,
  activeWorkspaces,
  busy,
  chromeInsetTop = false,
  closeWorkspace,
  createConversation,
  createWorkspaceConversation,
  openLocalFolder,
  openWorkflowGraphPane,
  openWorkspacePath,
  openSettingsPane,
  recentWorkspaces,
  removeRecent,
  selectConversation,
  selectWorkspace,
  selectedConversationId,
  selectedWorkspaceId,
  sidebarWidth = 220,
}: WorkspaceSidebarProps) {
  const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useState<ReadonlySet<string>>(
    () => new Set(selectedWorkspaceId ? [selectedWorkspaceId] : []),
  );
  const subscribedWorkspaceConversationLists = useChatStore(
    (state) => state.conversationListsByWorkspaceId,
  );
  const currentWorkspaceConversationLists = useChatStore.getState().conversationListsByWorkspaceId;
  const workspaceConversationLists =
    Object.keys(subscribedWorkspaceConversationLists).length > 0
      ? subscribedWorkspaceConversationLists
      : currentWorkspaceConversationLists;
  const ensureWorkspaceConversationList = useChatStore(
    (state) => state.ensureWorkspaceConversationList,
  );
  const clearClosedWorkspaceConversationLists = useChatStore(
    (state) => state.clearClosedWorkspaceConversationLists,
  );
  const subscribedWorkspaceWorkflowDefinitionLists = useWorkflowDefinitionStore(
    (state) => state.workflowDefinitionsByWorkspaceId,
  );
  const currentWorkspaceWorkflowDefinitionLists =
    useWorkflowDefinitionStore.getState().workflowDefinitionsByWorkspaceId;
  const workspaceWorkflowDefinitionLists =
    Object.keys(subscribedWorkspaceWorkflowDefinitionLists).length > 0
      ? subscribedWorkspaceWorkflowDefinitionLists
      : currentWorkspaceWorkflowDefinitionLists;
  const selectedWorkflowDefinitionIdsByWorkspaceId = useWorkflowDefinitionStore(
    (state) => state.selectedDefinitionIdsByWorkspaceId,
  );
  const ensureWorkspaceWorkflowDefinitions = useWorkflowDefinitionStore(
    (state) => state.ensureWorkspaceWorkflowDefinitions,
  );
  const createWorkflowDefinition = useWorkflowDefinitionStore(
    (state) => state.createWorkflowDefinition,
  );
  const selectWorkflowDefinition = useWorkflowDefinitionStore(
    (state) => state.selectWorkflowDefinition,
  );
  const clearClosedWorkspaceWorkflowDefinitions = useWorkflowDefinitionStore(
    (state) => state.clearClosedWorkspaceWorkflowDefinitions,
  );
  const chatCreateBusy = useChatStore((state) => state.operation === "creating");
  const conversationSelectionBusy = useChatStore((state) => state.operation === "loading");
  const activeWorkspaceIds = useMemo(
    () => new Set(activeWorkspaces.map((workspace) => workspace.id)),
    [activeWorkspaces],
  );
  const inactiveRecentWorkspaces = useMemo(
    () => recentWorkspaces.filter((workspace) => !activeWorkspaceIds.has(workspace.id)),
    [activeWorkspaceIds, recentWorkspaces],
  );
  const projectsEmpty = activeWorkspaces.length === 0 && inactiveRecentWorkspaces.length === 0;
  const [sections, setSections] =
    useState<Record<SidebarSectionId, SidebarSectionState>>(defaultSidebarSections);

  useEffect(() => {
    if (selectedWorkspaceId) {
      setExpandedWorkspaceIds((current) => {
        if (current.has(selectedWorkspaceId)) {
          return current;
        }
        return new Set([...current, selectedWorkspaceId]);
      });
    }
  }, [selectedWorkspaceId]);

  useEffect(() => {
    clearClosedWorkspaceConversationLists(activeWorkspaces.map((workspace) => workspace.id));
    clearClosedWorkspaceWorkflowDefinitions(activeWorkspaces.map((workspace) => workspace.id));
  }, [
    activeWorkspaces,
    clearClosedWorkspaceConversationLists,
    clearClosedWorkspaceWorkflowDefinitions,
  ]);

  useEffect(() => {
    for (const workspace of activeWorkspaces) {
      if (!expandedWorkspaceIds.has(workspace.id) || workspace.id === selectedWorkspaceId) {
        continue;
      }
      const list = workspaceConversationLists[workspace.id];
      if (list?.loading || (list && list.error === null)) {
        continue;
      }
      void ensureWorkspaceConversationList(workspace.id);
    }
  }, [
    activeWorkspaces,
    ensureWorkspaceConversationList,
    expandedWorkspaceIds,
    selectedWorkspaceId,
    workspaceConversationLists,
  ]);

  useEffect(() => {
    for (const workspace of activeWorkspaces) {
      if (!expandedWorkspaceIds.has(workspace.id)) {
        continue;
      }
      const list = workspaceWorkflowDefinitionLists[workspace.id];
      if (list?.loading || (list && list.error === null)) {
        continue;
      }
      void ensureWorkspaceWorkflowDefinitions(workspace.id);
    }
  }, [
    activeWorkspaces,
    ensureWorkspaceWorkflowDefinitions,
    expandedWorkspaceIds,
    workspaceWorkflowDefinitionLists,
  ]);

  function setWorkspaceExpanded(workspaceId: string, expanded: boolean) {
    setExpandedWorkspaceIds((current) => {
      const next = new Set(current);
      if (expanded) {
        next.add(workspaceId);
      } else {
        next.delete(workspaceId);
      }
      return next;
    });
  }

  function setSectionOpen(sectionId: SidebarSectionId, open: boolean) {
    setSections((current) => ({
      ...current,
      [sectionId]: { ...current[sectionId], open },
    }));
  }

  function setSectionHeight(sectionId: SidebarSectionId, height: number) {
    setSections((current) => ({
      ...current,
      [sectionId]: { ...current[sectionId], height, resized: true },
    }));
  }

  return (
    <aside
      className="flex h-full min-h-0 w-full min-w-0 flex-col bg-[#202124] text-zinc-100"
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <div
        className={cn("shrink-0 px-1 pb-2", chromeInsetTop && "pt-10")}
        data-testid="sidebar-shortcuts-shell"
      >
        <SidebarAccordionSection
          height={sections.shortcuts.height}
          onHeightChange={(height) => setSectionHeight("shortcuts", height)}
          onOpenChange={(open) => setSectionOpen("shortcuts", open)}
          open={sections.shortcuts.open}
          resized={sections.shortcuts.resized}
          testId="shortcuts-section"
          title="Shortcuts"
        >
          <SidebarShortcuts
            busy={busy || chatCreateBusy}
            createConversation={createConversation}
            hasWorkspace={selectedWorkspaceId !== ""}
          />
        </SidebarAccordionSection>
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-1"
        data-testid="sidebar-scrollable-sections"
        style={noScrollAnchoringStyle}
      >
        <div className="grid gap-2">
          <SidebarAccordionSection
            action={<ProjectFolderButton busy={busy} openLocalFolder={openLocalFolder} />}
            height={sections.projects.height}
            onHeightChange={(height) => setSectionHeight("projects", height)}
            onOpenChange={(open) => setSectionOpen("projects", open)}
            open={sections.projects.open}
            resized={sections.projects.resized}
            testId="projects-section"
            title="Projects"
          >
            {projectsEmpty ? (
              <EmptySectionSpace />
            ) : (
              <>
                <ProjectNavigationList
                  activeRun={activeRun}
                  busy={busy}
                  chatCreateBusy={chatCreateBusy}
                  conversationSelectionBusy={conversationSelectionBusy}
                  closeWorkspace={closeWorkspace}
                  createWorkspaceConversation={createWorkspaceConversation}
                  createWorkflowDefinition={createWorkflowDefinition}
                  expandedWorkspaceIds={expandedWorkspaceIds}
                  openWorkflowGraphPane={openWorkflowGraphPane}
                  openWorkspacePath={openWorkspacePath}
                  recentWorkspaces={recentWorkspaces}
                  removeRecent={removeRecent}
                  selectConversation={selectConversation}
                  selectWorkflowDefinition={selectWorkflowDefinition}
                  selectWorkspace={selectWorkspace}
                  selectedConversationId={selectedConversationId}
                  selectedWorkflowDefinitionIdsByWorkspaceId={
                    selectedWorkflowDefinitionIdsByWorkspaceId
                  }
                  selectedWorkspaceId={selectedWorkspaceId}
                  setWorkspaceExpanded={setWorkspaceExpanded}
                  workspaceConversationLists={workspaceConversationLists}
                  workspaceWorkflowDefinitionLists={workspaceWorkflowDefinitionLists}
                  activeWorkspaces={activeWorkspaces}
                />
              </>
            )}
          </SidebarAccordionSection>
        </div>
      </div>
      <div className="grid shrink-0 gap-0.5 px-1 py-1" data-testid="sidebar-memory-footer">
        <SidebarSettingsButton onOpenSettings={openSettingsPane} />
      </div>
    </aside>
  );
}

function ProjectNavigationList({
  activeRun,
  activeWorkspaces,
  busy,
  chatCreateBusy,
  conversationSelectionBusy,
  closeWorkspace,
  createWorkspaceConversation,
  createWorkflowDefinition,
  expandedWorkspaceIds,
  openWorkflowGraphPane,
  openWorkspacePath,
  recentWorkspaces,
  removeRecent,
  selectConversation,
  selectWorkflowDefinition,
  selectWorkspace,
  selectedConversationId,
  selectedWorkflowDefinitionIdsByWorkspaceId,
  selectedWorkspaceId,
  setWorkspaceExpanded,
  workspaceConversationLists,
  workspaceWorkflowDefinitionLists,
}: {
  activeRun: Run | null;
  activeWorkspaces: WorkspaceSummary[];
  busy: boolean;
  chatCreateBusy: boolean;
  conversationSelectionBusy: boolean;
  closeWorkspace: (id: string) => Promise<void>;
  createWorkspaceConversation: (workspaceId: string, title?: string) => Promise<void>;
  createWorkflowDefinition: (workspaceId: string, name?: string) => Promise<unknown>;
  expandedWorkspaceIds: ReadonlySet<string>;
  openWorkflowGraphPane: () => void;
  openWorkspacePath: (rootPath: string) => Promise<void>;
  recentWorkspaces: WorkspaceSummary[];
  removeRecent: (id: string) => Promise<void>;
  selectConversation: (conversationId: string, workspaceId?: string) => Promise<void>;
  selectWorkflowDefinition: (workspaceId: string, definitionId: string) => void;
  selectWorkspace: (id: string) => Promise<void>;
  selectedConversationId: string;
  selectedWorkflowDefinitionIdsByWorkspaceId: Record<string, string | undefined>;
  selectedWorkspaceId: string;
  setWorkspaceExpanded: (workspaceId: string, expanded: boolean) => void;
  workspaceConversationLists: Record<string, SidebarWorkspaceConversationState | undefined>;
  workspaceWorkflowDefinitionLists: Record<
    string,
    SidebarWorkspaceWorkflowDefinitionState | undefined
  >;
}) {
  const [visibleConversationLimit, setVisibleConversationLimit] = useState(chatHistoryLimit);
  const items = useMemo(
    () =>
      selectSidebarNavigationItems({
        activeWorkspaces,
        expandedWorkspaceIds,
        recentWorkspaces,
        selectedConversationId,
        selectedWorkflowDefinitionIdsByWorkspaceId,
        selectedWorkspaceId,
        visibleConversationLimit,
        workspaceConversationLists,
        workspaceWorkflowDefinitionLists,
      }),
    [
      activeWorkspaces,
      expandedWorkspaceIds,
      recentWorkspaces,
      selectedConversationId,
      selectedWorkflowDefinitionIdsByWorkspaceId,
      selectedWorkspaceId,
      visibleConversationLimit,
      workspaceConversationLists,
      workspaceWorkflowDefinitionLists,
    ],
  );
  const corruptionLabelsByConversationId = useMemo(
    () => conversationCorruptionLabels(sidebarWorkspaceDiagnostics(workspaceConversationLists)),
    [workspaceConversationLists],
  );

  if (items.length === 0) {
    return null;
  }

  async function runCommand(command: SidebarNavigationCommand) {
    switch (command.type) {
      case "activateWorkspace":
        await runActivateWorkspaceCommand(command);
        return;
      case "createWorkspaceConversation":
        await runCreateWorkspaceConversationCommand(command);
        return;
      case "createWorkspaceWorkflow":
        await runCreateWorkspaceWorkflowCommand(command);
        return;
      case "selectWorkflowDefinition":
        await runSelectWorkflowDefinitionCommand(command);
        return;
      default:
        await runBasicNavigationCommand(command);
    }
  }

  async function runActivateWorkspaceCommand(
    command: Extract<SidebarNavigationCommand, { type: "activateWorkspace" }>,
  ) {
    setWorkspaceExpanded(command.workspaceId, command.nextExpanded);
    if (command.selectWorkspace) {
      await selectWorkspace(command.workspaceId);
    }
  }

  async function runCreateWorkspaceConversationCommand(
    command: Extract<SidebarNavigationCommand, { type: "createWorkspaceConversation" }>,
  ) {
    setWorkspaceExpanded(command.workspaceId, true);
    if (command.workspaceId !== selectedWorkspaceId) {
      await selectWorkspace(command.workspaceId);
    }
    await createWorkspaceConversation(command.workspaceId);
  }

  async function runCreateWorkspaceWorkflowCommand(
    command: Extract<SidebarNavigationCommand, { type: "createWorkspaceWorkflow" }>,
  ) {
    setWorkspaceExpanded(command.workspaceId, true);
    if (command.workspaceId !== selectedWorkspaceId) {
      await selectWorkspace(command.workspaceId);
    }
    await createWorkflowDefinition(command.workspaceId);
    openWorkflowGraphPane();
  }

  async function runSelectWorkflowDefinitionCommand(
    command: Extract<SidebarNavigationCommand, { type: "selectWorkflowDefinition" }>,
  ) {
    if (command.workspaceId !== selectedWorkspaceId) {
      await selectWorkspace(command.workspaceId);
    }
    selectWorkflowDefinition(command.workspaceId, command.definitionId);
    openWorkflowGraphPane();
  }

  async function runBasicNavigationCommand(
    command: Exclude<
      SidebarNavigationCommand,
      Extract<
        SidebarNavigationCommand,
        {
          type:
            | "activateWorkspace"
            | "createWorkspaceConversation"
            | "createWorkspaceWorkflow"
            | "selectWorkflowDefinition";
        }
      >
    >,
  ) {
    switch (command.type) {
      case "closeWorkspace":
        await closeWorkspace(command.workspaceId);
        return;
      case "openRecentWorkspace":
        await openWorkspacePath(command.rootPath);
        return;
      case "removeRecentWorkspace":
        await removeRecent(command.workspaceId);
        return;
      case "selectConversation":
        if (command.workspaceId !== selectedWorkspaceId) {
          await selectWorkspace(command.workspaceId);
        }
        await selectConversation(command.conversationId, command.workspaceId);
        return;
      case "showMoreConversations":
        setVisibleConversationLimit((current) => current + chatHistoryLimit);
        return;
      default:
        assertNever(command);
    }
  }

  return (
    <div
      className="min-h-0 overflow-hidden"
      aria-label="Projects"
      data-testid="active-workspace-list"
      style={sidebarNavigationListStyle(items.length)}
    >
      <VirtualWorkspaceList
        items={items}
        renderItem={(item) => (
          <SidebarNavigationRow
            activeRun={activeRun}
            busy={busy}
            chatCreateBusy={chatCreateBusy}
            conversationSelectionBusy={conversationSelectionBusy}
            workspaceConversationLists={workspaceConversationLists}
            workspaceWorkflowDefinitionLists={workspaceWorkflowDefinitionLists}
            corruptionLabelsByConversationId={corruptionLabelsByConversationId}
            item={item}
            runCommand={runCommand}
          />
        )}
        rowHeight={sidebarNavigationRowHeight}
        testId="sidebar-navigation-list"
      />
    </div>
  );
}

function VirtualWorkspaceList({ items, renderItem, rowHeight, testId }: VirtualWorkspaceListProps) {
  return (
    <Virtuoso
      className="h-full min-h-0 overflow-y-auto overscroll-contain"
      data={items}
      data-testid={testId}
      fixedItemHeight={rowHeight}
      initialItemCount={Math.min(
        items.length,
        Math.ceil(sidebarNavigationMaxHeight / rowHeight) + workspaceListOverscan,
      )}
      itemContent={(_, item) => (
        <div
          data-testid={sidebarItemTestId(item)}
          style={{ height: rowHeight, ...noScrollAnchoringStyle }}
        >
          {renderItem(item)}
        </div>
      )}
      overscan={workspaceListOverscan * rowHeight}
      style={noScrollAnchoringStyle}
    />
  );
}

function sidebarNavigationListStyle(itemCount: number): CSSProperties {
  return {
    height: Math.min(itemCount * sidebarNavigationRowHeight, sidebarNavigationMaxHeight),
  };
}

function sidebarItemTestId(item: SidebarNavigationItem) {
  switch (item.kind) {
    case "activeWorkspace":
      return "active-workspace-item";
    case "conversation":
      return "conversation-sidebar-item";
    case "emptyConversationList":
      return "conversation-empty-item";
    case "emptyWorkflowList":
      return "workflow-empty-item";
    case "moreConversations":
      return "conversation-more-item";
    case "recentWorkspace":
      return "recent-workspace-item";
    case "workflowDefinition":
      return "workflow-definition-item";
    default:
      return assertNever(item);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported sidebar navigation item: ${JSON.stringify(value)}`);
}
