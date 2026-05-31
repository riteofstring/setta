import {
  AppWindow,
  Database,
  FolderOpen,
  Globe2,
  GitBranch,
  Keyboard,
  MessageSquareText,
  PanelRightOpen,
  Plug,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type SettingsSectionId =
  | "shell"
  | "chat"
  | "projects"
  | "views"
  | "integrations"
  | "shortcuts"
  | "storage";

const settingsSections = [
  { icon: AppWindow, id: "shell", label: "Shell" },
  { icon: MessageSquareText, id: "chat", label: "Chat" },
  { icon: FolderOpen, id: "projects", label: "Projects" },
  { icon: PanelRightOpen, id: "views", label: "Views" },
  { icon: Plug, id: "integrations", label: "Integrations" },
  { icon: Keyboard, id: "shortcuts", label: "Shortcuts" },
  { icon: Database, id: "storage", label: "Storage" },
] satisfies {
  icon: typeof AppWindow;
  id: SettingsSectionId;
  label: string;
}[];

const defaultChoices = {
  approvalMode: "ask",
  assistantMessages: "unboxed",
  browserProfile: "project",
  canvasEngine: "xyflow",
  chatPane: "open",
  density: "compact",
  editor: "vscode",
  folderClick: "reveal",
  launchView: "canvas",
  leftPane: "open",
  logRetention: "30",
  permissionScope: "workspace",
  rightTabs: "collapse",
  sendKey: "return",
  theme: "system",
  updateChannel: "stable",
  userMessages: "compact",
  webTarget: "embedded",
} satisfies Record<string, string>;

const defaultSwitches = {
  approvalHistory: true,
  automations: true,
  copyEditHover: true,
  crashReports: false,
  gitMetadata: true,
  localHistory: true,
  mcpServers: true,
  nativeTitleBar: true,
  plugins: true,
  restorePanes: true,
  voiceInput: false,
} satisfies Record<string, boolean>;

type ChoiceKey = keyof typeof defaultChoices;
type SwitchKey = keyof typeof defaultSwitches;

export function SettingsPanel() {
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("shell");
  const [choices, setChoices] = useState<Record<ChoiceKey, string>>(defaultChoices);
  const [switches, setSwitches] = useState<Record<SwitchKey, boolean>>(defaultSwitches);

  const updateChoice = (key: ChoiceKey, value: string) => {
    setChoices((current) => ({ ...current, [key]: value }));
  };
  const updateSwitch = (key: SwitchKey, value: boolean) => {
    setSwitches((current) => ({ ...current, [key]: value }));
  };

  return (
    <section
      className="flex h-full min-h-0 flex-col bg-zinc-100 text-zinc-950"
      data-testid="settings-panel"
    >
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-zinc-200 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Settings2 className="h-4 w-4 shrink-0 text-zinc-500" />
          <h1 className="truncate text-sm font-semibold">Settings</h1>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge className="h-5 border-zinc-300 bg-zinc-50 px-1.5 text-[10px]" variant="neutral">
            Local
          </Badge>
          <Button
            className="h-6 border-zinc-300 bg-zinc-50 px-2 text-[11px] text-zinc-600 hover:bg-white"
            onClick={() => {
              setChoices(defaultChoices);
              setSwitches(defaultSwitches);
            }}
            type="button"
          >
            Reset
          </Button>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[148px_minmax(0,1fr)]">
        <SettingsNav activeSection={activeSection} onSelect={setActiveSection} />
        <form
          className="min-h-0 overflow-y-auto px-4 py-3"
          onSubmit={(event) => event.preventDefault()}
        >
          <SettingsContent
            activeSection={activeSection}
            choices={choices}
            switches={switches}
            updateChoice={updateChoice}
            updateSwitch={updateSwitch}
          />
        </form>
      </div>
    </section>
  );
}

function SettingsNav({
  activeSection,
  onSelect,
}: {
  activeSection: SettingsSectionId;
  onSelect: (section: SettingsSectionId) => void;
}) {
  return (
    <nav
      aria-label="Settings sections"
      className="min-h-0 overflow-y-auto border-r border-zinc-200 px-1.5 py-2"
    >
      {settingsSections.map((section) => (
        <SettingsNavButton
          active={activeSection === section.id}
          icon={section.icon}
          key={section.id}
          label={section.label}
          onClick={() => onSelect(section.id)}
        />
      ))}
    </nav>
  );
}

function SettingsNavButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof AppWindow;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-7 w-full min-w-0 items-center gap-2 rounded-sm px-2 text-left text-xs",
        active
          ? "bg-zinc-900 text-zinc-50"
          : "text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-950",
      )}
      onClick={onClick}
      type="button"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function SettingsContent({
  activeSection,
  choices,
  switches,
  updateChoice,
  updateSwitch,
}: {
  activeSection: SettingsSectionId;
  choices: Record<ChoiceKey, string>;
  switches: Record<SwitchKey, boolean>;
  updateChoice: (key: ChoiceKey, value: string) => void;
  updateSwitch: (key: SwitchKey, value: boolean) => void;
}) {
  switch (activeSection) {
    case "shell":
      return (
        <ShellSettings
          choices={choices}
          switches={switches}
          updateChoice={updateChoice}
          updateSwitch={updateSwitch}
        />
      );
    case "chat":
      return (
        <ChatSettings
          choices={choices}
          switches={switches}
          updateChoice={updateChoice}
          updateSwitch={updateSwitch}
        />
      );
    case "projects":
      return (
        <ProjectSettings
          choices={choices}
          switches={switches}
          updateChoice={updateChoice}
          updateSwitch={updateSwitch}
        />
      );
    case "views":
      return <ViewSettings choices={choices} updateChoice={updateChoice} />;
    case "integrations":
      return (
        <IntegrationSettings
          choices={choices}
          switches={switches}
          updateChoice={updateChoice}
          updateSwitch={updateSwitch}
        />
      );
    case "shortcuts":
      return <ShortcutSettings />;
    case "storage":
      return (
        <StorageSettings
          choices={choices}
          switches={switches}
          updateChoice={updateChoice}
          updateSwitch={updateSwitch}
        />
      );
    default:
      return assertNever(activeSection);
  }
}

function ShellSettings({ choices, switches, updateChoice, updateSwitch }: SettingsEditorProps) {
  return (
    <SettingsArticle icon={<AppWindow className="h-4 w-4" />} title="Shell">
      <SettingGroup title="Appearance">
        <SettingRow label="Theme">
          <SegmentedControl
            onChange={(value) => updateChoice("theme", value)}
            options={[
              { label: "System", value: "system" },
              { label: "Dark", value: "dark" },
              { label: "Light", value: "light" },
            ]}
            value={choices.theme}
          />
        </SettingRow>
        <SettingRow label="Density">
          <SegmentedControl
            onChange={(value) => updateChoice("density", value)}
            options={[
              { label: "Compact", value: "compact" },
              { label: "Comfort", value: "comfort" },
            ]}
            value={choices.density}
          />
        </SettingRow>
        <SettingRow label="Native title bar">
          <ToggleSwitch
            checked={switches.nativeTitleBar}
            label="Native title bar"
            onChange={(value) => updateSwitch("nativeTitleBar", value)}
          />
        </SettingRow>
      </SettingGroup>
      <SettingGroup title="Startup">
        <SettingRow label="Restore panes">
          <ToggleSwitch
            checked={switches.restorePanes}
            label="Restore panes"
            onChange={(value) => updateSwitch("restorePanes", value)}
          />
        </SettingRow>
        <SettingRow label="Update channel">
          <SegmentedControl
            onChange={(value) => updateChoice("updateChannel", value)}
            options={[
              { label: "Stable", value: "stable" },
              { label: "Preview", value: "preview" },
            ]}
            value={choices.updateChannel}
          />
        </SettingRow>
      </SettingGroup>
    </SettingsArticle>
  );
}

function ChatSettings({ choices, switches, updateChoice, updateSwitch }: SettingsEditorProps) {
  return (
    <SettingsArticle icon={<MessageSquareText className="h-4 w-4" />} title="Chat">
      <SettingGroup title="Assistant">
        <SettingRow label="Assistant name">
          <Input
            aria-label="Assistant name"
            className="h-7 max-w-56 border-zinc-300 bg-white px-2 text-xs"
            defaultValue="Setta"
          />
        </SettingRow>
        <SettingRow label="Approval mode">
          <SegmentedControl
            onChange={(value) => updateChoice("approvalMode", value)}
            options={[
              { label: "Ask", value: "ask" },
              { label: "Notify", value: "notify" },
              { label: "Manual", value: "manual" },
            ]}
            value={choices.approvalMode}
          />
        </SettingRow>
        <SettingRow label="Permission scope">
          <SegmentedControl
            onChange={(value) => updateChoice("permissionScope", value)}
            options={[
              { label: "Workspace", value: "workspace" },
              { label: "Project", value: "project" },
            ]}
            value={choices.permissionScope}
          />
        </SettingRow>
      </SettingGroup>
      <SettingGroup title="Transcript">
        <SettingRow label="Assistant messages">
          <SegmentedControl
            onChange={(value) => updateChoice("assistantMessages", value)}
            options={[
              { label: "Unboxed", value: "unboxed" },
              { label: "Boxed", value: "boxed" },
            ]}
            value={choices.assistantMessages}
          />
        </SettingRow>
        <SettingRow label="User messages">
          <SegmentedControl
            onChange={(value) => updateChoice("userMessages", value)}
            options={[
              { label: "Compact", value: "compact" },
              { label: "Comfort", value: "comfort" },
            ]}
            value={choices.userMessages}
          />
        </SettingRow>
        <SettingRow label="Copy and edit on hover">
          <ToggleSwitch
            checked={switches.copyEditHover}
            label="Copy and edit on hover"
            onChange={(value) => updateSwitch("copyEditHover", value)}
          />
        </SettingRow>
      </SettingGroup>
      <SettingGroup title="Composer">
        <SettingRow label="Send key">
          <SegmentedControl
            onChange={(value) => updateChoice("sendKey", value)}
            options={[
              { label: "Return", value: "return" },
              { label: "Cmd Return", value: "cmd-return" },
            ]}
            value={choices.sendKey}
          />
        </SettingRow>
        <SettingRow label="Voice input">
          <ToggleSwitch
            checked={switches.voiceInput}
            label="Voice input"
            onChange={(value) => updateSwitch("voiceInput", value)}
          />
        </SettingRow>
      </SettingGroup>
    </SettingsArticle>
  );
}

function ProjectSettings({ choices, switches, updateChoice, updateSwitch }: SettingsEditorProps) {
  return (
    <SettingsArticle icon={<FolderOpen className="h-4 w-4" />} title="Projects">
      <SettingGroup title="Folders">
        <SettingRow label="Default project path">
          <Input
            aria-label="Default project path"
            className="h-7 max-w-72 border-zinc-300 bg-white px-2 text-xs"
            defaultValue="~/Documents/_projects"
          />
        </SettingRow>
        <SettingRow label="Folder click">
          <SegmentedControl
            onChange={(value) => updateChoice("folderClick", value)}
            options={[
              { label: "Reveal chats", value: "reveal" },
              { label: "Select only", value: "select" },
            ]}
            value={choices.folderClick}
          />
        </SettingRow>
        <SettingRow label="Recent project limit">
          <Input
            aria-label="Recent project limit"
            className="h-7 max-w-20 border-zinc-300 bg-white px-2 text-xs"
            defaultValue="40"
          />
        </SettingRow>
      </SettingGroup>
      <SettingGroup title="Git and editor">
        <SettingRow label="Git metadata">
          <ToggleSwitch
            checked={switches.gitMetadata}
            label="Git metadata"
            onChange={(value) => updateSwitch("gitMetadata", value)}
          />
        </SettingRow>
        <SettingRow label="Editor">
          <SegmentedControl
            onChange={(value) => updateChoice("editor", value)}
            options={[
              { label: "VS Code", value: "vscode" },
              { label: "Cursor", value: "cursor" },
              { label: "System", value: "system" },
            ]}
            value={choices.editor}
          />
        </SettingRow>
        <SettingRow label="Editor command">
          <Input
            aria-label="Editor command"
            className="h-7 max-w-32 border-zinc-300 bg-white px-2 text-xs"
            defaultValue="code"
          />
        </SettingRow>
      </SettingGroup>
    </SettingsArticle>
  );
}

function ViewSettings({
  choices,
  updateChoice,
}: Pick<SettingsEditorProps, "choices" | "updateChoice">) {
  return (
    <SettingsArticle icon={<PanelRightOpen className="h-4 w-4" />} title="Views">
      <SettingGroup title="Panes">
        <SettingRow label="Left pane">
          <SegmentedControl
            onChange={(value) => updateChoice("leftPane", value)}
            options={[
              { label: "Open", value: "open" },
              { label: "Closed", value: "closed" },
            ]}
            value={choices.leftPane}
          />
        </SettingRow>
        <SettingRow label="Chat pane">
          <SegmentedControl
            onChange={(value) => updateChoice("chatPane", value)}
            options={[
              { label: "Open", value: "open" },
              { label: "Closed", value: "closed" },
            ]}
            value={choices.chatPane}
          />
        </SettingRow>
        <SettingRow label="Right tabs">
          <SegmentedControl
            onChange={(value) => updateChoice("rightTabs", value)}
            options={[
              { label: "Collapse active", value: "collapse" },
              { label: "Stay open", value: "stay-open" },
            ]}
            value={choices.rightTabs}
          />
        </SettingRow>
      </SettingGroup>
      <SettingGroup title="Workspace view">
        <SettingRow label="Default view">
          <SegmentedControl
            onChange={(value) => updateChoice("launchView", value)}
            options={[
              { label: "Canvas", value: "canvas" },
              { label: "Git", value: "git" },
              { label: "Browser", value: "browser" },
              { label: "Settings", value: "settings" },
            ]}
            value={choices.launchView}
          />
        </SettingRow>
        <SettingRow label="Canvas engine">
          <SegmentedControl
            onChange={(value) => updateChoice("canvasEngine", value)}
            options={[
              { label: "xyflow", value: "xyflow" },
              { label: "Native", value: "native" },
            ]}
            value={choices.canvasEngine}
          />
        </SettingRow>
        <SettingRow label="Browser profile">
          <SegmentedControl
            onChange={(value) => updateChoice("browserProfile", value)}
            options={[
              { label: "Project", value: "project" },
              { label: "Shared", value: "shared" },
            ]}
            value={choices.browserProfile}
          />
        </SettingRow>
      </SettingGroup>
    </SettingsArticle>
  );
}

function IntegrationSettings({
  choices,
  switches,
  updateChoice,
  updateSwitch,
}: SettingsEditorProps) {
  return (
    <SettingsArticle icon={<Plug className="h-4 w-4" />} title="Integrations">
      <SettingGroup title="Tools">
        <SettingRow label="Web target">
          <SegmentedControl
            onChange={(value) => updateChoice("webTarget", value)}
            options={[
              { label: "Embedded", value: "embedded" },
              { label: "System", value: "system" },
            ]}
            value={choices.webTarget}
          />
        </SettingRow>
        <SettingRow label="Plugins">
          <ToggleSwitch
            checked={switches.plugins}
            label="Plugins"
            onChange={(value) => updateSwitch("plugins", value)}
          />
        </SettingRow>
        <SettingRow label="Automations">
          <ToggleSwitch
            checked={switches.automations}
            label="Automations"
            onChange={(value) => updateSwitch("automations", value)}
          />
        </SettingRow>
        <SettingRow label="MCP servers">
          <ToggleSwitch
            checked={switches.mcpServers}
            label="MCP servers"
            onChange={(value) => updateSwitch("mcpServers", value)}
          />
        </SettingRow>
      </SettingGroup>
      <SettingGroup title="Status bar">
        <SettingRow label="Git branch">
          <StatusToken icon={<GitBranch className="h-3 w-3" />} label="Visible" />
        </SettingRow>
        <SettingRow label="Browser view">
          <StatusToken icon={<Globe2 className="h-3 w-3" />} label="Available" />
        </SettingRow>
      </SettingGroup>
    </SettingsArticle>
  );
}

function ShortcutSettings() {
  return (
    <SettingsArticle icon={<Keyboard className="h-4 w-4" />} title="Shortcuts">
      <SettingGroup title="Global">
        <ShortcutRow action="Command palette" keys={["Cmd", "K"]} />
        <ShortcutRow action="Search" keys={["Cmd", "G"]} />
        <ShortcutRow action="New chat" keys={["Cmd", "N"]} />
      </SettingGroup>
      <SettingGroup title="Panes">
        <ShortcutRow action="Project sidebar" keys={["Unset"]} />
        <ShortcutRow action="Chat pane" keys={["Unset"]} />
        <ShortcutRow action="Workspace view" keys={["Unset"]} />
      </SettingGroup>
    </SettingsArticle>
  );
}

function StorageSettings({ choices, switches, updateChoice, updateSwitch }: SettingsEditorProps) {
  return (
    <SettingsArticle icon={<ShieldCheck className="h-4 w-4" />} title="Storage">
      <SettingGroup title="Local data">
        <SettingRow label="Chat history">
          <ToggleSwitch
            checked={switches.localHistory}
            label="Chat history"
            onChange={(value) => updateSwitch("localHistory", value)}
          />
        </SettingRow>
        <SettingRow label="Run log retention">
          <SegmentedControl
            onChange={(value) => updateChoice("logRetention", value)}
            options={[
              { label: "14 days", value: "14" },
              { label: "30 days", value: "30" },
              { label: "Forever", value: "forever" },
            ]}
            value={choices.logRetention}
          />
        </SettingRow>
        <SettingRow label="Approval history">
          <ToggleSwitch
            checked={switches.approvalHistory}
            label="Approval history"
            onChange={(value) => updateSwitch("approvalHistory", value)}
          />
        </SettingRow>
      </SettingGroup>
      <SettingGroup title="Diagnostics">
        <SettingRow label="Crash reports">
          <ToggleSwitch
            checked={switches.crashReports}
            label="Crash reports"
            onChange={(value) => updateSwitch("crashReports", value)}
          />
        </SettingRow>
      </SettingGroup>
    </SettingsArticle>
  );
}

interface SettingsEditorProps {
  choices: Record<ChoiceKey, string>;
  switches: Record<SwitchKey, boolean>;
  updateChoice: (key: ChoiceKey, value: string) => void;
  updateSwitch: (key: SwitchKey, value: boolean) => void;
}

function SettingsArticle({
  children,
  icon,
  title,
}: {
  children: ReactNode;
  icon: ReactNode;
  title: string;
}) {
  return (
    <article className="mx-auto grid w-full max-w-3xl gap-3">
      <header className="flex h-8 items-center gap-2 text-zinc-500">
        {icon}
        <h2 className="text-xs font-semibold tracking-wide text-zinc-700 uppercase">{title}</h2>
      </header>
      {children}
    </article>
  );
}

function SettingGroup({ children, title }: { children: ReactNode; title: string }) {
  return (
    <fieldset className="min-w-0 border-t border-zinc-200 pt-2">
      <legend className="px-0 pr-2 text-[11px] font-semibold text-zinc-500">{title}</legend>
      <div className="divide-y divide-zinc-200">{children}</div>
    </fieldset>
  );
}

function SettingRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="grid min-h-9 min-w-0 grid-cols-[minmax(120px,1fr)_minmax(160px,auto)] items-center gap-3 py-1.5 text-xs">
      <span className="min-w-0 truncate font-medium text-zinc-700">{label}</span>
      <span className="flex min-w-0 justify-end">{children}</span>
    </div>
  );
}

function SegmentedControl({
  onChange,
  options,
  value,
}: {
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  value: string;
}) {
  return (
    <div
      className="inline-flex min-w-0 overflow-hidden rounded-md border border-zinc-300 bg-zinc-200 p-0.5"
      role="radiogroup"
    >
      {options.map((option) => (
        <Button
          aria-checked={value === option.value}
          className={cn(
            "h-5 min-w-0 rounded-sm border-0 px-2 text-[11px] shadow-none",
            value === option.value
              ? "bg-white text-zinc-950 hover:bg-white"
              : "bg-transparent text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950",
          )}
          key={option.value}
          onClick={() => onChange(option.value)}
          role="radio"
          type="button"
          variant="secondary"
        >
          <span className="truncate">{option.label}</span>
        </Button>
      ))}
    </div>
  );
}

function ToggleSwitch({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      aria-label={label}
      aria-checked={checked}
      className={cn(
        "relative h-5 w-9 rounded-full border transition-colors",
        checked ? "border-zinc-900 bg-zinc-900" : "border-zinc-300 bg-zinc-200",
      )}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-4" : "translate-x-0",
        )}
      />
    </button>
  );
}

function ShortcutRow({ action, keys }: { action: string; keys: string[] }) {
  return (
    <div className="grid min-h-9 grid-cols-[minmax(120px,1fr)_auto] items-center gap-3 py-1.5 text-xs">
      <span className="font-medium text-zinc-700">{action}</span>
      <span className="flex justify-end gap-1">
        {keys.map((key) => (
          <kbd
            className="min-w-6 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-center text-[10px] font-medium text-zinc-600"
            key={key}
          >
            {key}
          </kbd>
        ))}
      </span>
    </div>
  );
}

function StatusToken({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2 text-[11px] text-zinc-600">
      {icon}
      {label}
    </span>
  );
}

function assertNever(value: never): never {
  throw new Error(`Unhandled settings section: ${value}`);
}
