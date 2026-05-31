import {
  BadgeCheck,
  Blocks,
  BookOpen,
  Box,
  Brain,
  Bug,
  CircleGauge,
  Compass,
  FastForward,
  FileText,
  GitFork,
  Goal,
  Image,
  MessageSquare,
  Network,
  Package,
  Presentation,
  RefreshCcw,
  Sheet,
  SlidersHorizontal,
  Target,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../lib/utils";

interface SlashCommand {
  description: string;
  icon: ReactNode;
  id: string;
  insertText: string;
  label: string;
  meta?: string;
}

interface SlashCommandSection {
  commands: SlashCommand[];
  title?: string;
}

interface VisibleSlashCommandSection {
  commands: SlashCommand[];
  title?: string;
}

const primaryCommands = [
  command(
    "code-review",
    "Code review",
    "Review unstaged changes or compare against a branch",
    <Bug />,
  ),
  command("compact", "Compact", "Compact this thread's context", <RefreshCcw />),
  command("fast", "Fast", "1.5x speed, increased usage", <FastForward />),
  command("feedback", "Feedback", "Send feedback about this chat", <MessageSquare />),
  command("fork", "Fork", "Fork this chat into local or a new worktree", <GitFork />),
  command("goal", "Goal", "Set a goal that Setta will keep working towards", <Goal />),
  command("mcp", "MCP", "Show MCP server status", <Network />),
  command("memories", "Memories", "Generate on", <Brain />),
  command("model", "Model", "GPT-5.5", <Box />),
  command("personality", "Personality", "Choose how Setta responds", <CircleGauge />),
] satisfies SlashCommand[];

const modeCommands = [
  command("plan", "Plan mode", "Turn plan mode on", <SlidersHorizontal />),
  command("reasoning", "Reasoning", "Extra High", <Brain />),
  command("side", "Side", "Start a side conversation in an ephemeral fork", <Target />),
  command("status", "Status", "Show chat id, context usage, and rate limits", <Compass />),
] satisfies SlashCommand[];

const skillCommands = [
  skill(
    "browser",
    "Browser",
    "Open and control the in-app browser, mainly for local development pages",
    "Personal",
    <BookOpen />,
  ),
  skill(
    "debug-with-http-logging",
    "Debug With HTTP Logging",
    "Instrument, reproduce, and narrow bugs",
    "Personal",
    <Bug />,
  ),
  skill(
    "documents",
    "Documents",
    "Create and edit Word and Google Docs files",
    "Personal",
    <FileText />,
  ),
  skill("find-skills", "Find Skills", "Discover and install agent skills", "Personal", <Package />),
  skill(
    "frontend-design",
    "Frontend Design",
    "Create distinctive, production-grade frontend interfaces",
    "Personal",
    <Blocks />,
  ),
  skill(
    "imagegen",
    "Image Gen",
    "Generate or edit images for websites, games, and more",
    "System",
    <Image />,
  ),
  skill(
    "openai-docs",
    "OpenAI Docs",
    "Find current OpenAI API documentation",
    "System",
    <BadgeCheck />,
  ),
  skill(
    "presentations",
    "Presentations",
    "Build and edit slide decks",
    "Personal",
    <Presentation />,
  ),
  skill(
    "spreadsheets",
    "Spreadsheets",
    "Create, edit, analyze, and visualize workbooks",
    "Personal",
    <Sheet />,
  ),
  skill(
    "web-design-guidelines",
    "Web Design Guidelines",
    "Review UI against interface guidelines",
    "Personal",
    <Wrench />,
  ),
] satisfies SlashCommand[];

const slashCommandSections = [
  { commands: primaryCommands },
  { commands: modeCommands },
  { commands: skillCommands, title: "Skills" },
] satisfies SlashCommandSection[];

export function SlashCommandPalette({
  onSelect,
  open,
  query,
}: {
  onSelect: (insertText: string) => void;
  open: boolean;
  query: string;
}) {
  if (!open) {
    return null;
  }

  const visibleSections = visibleSlashCommandSections(query);

  return (
    <div className="absolute right-0 bottom-[calc(100%+0.75rem)] left-0 z-40 max-h-[min(440px,calc(100vh-220px))] overflow-y-auto rounded-2xl border border-zinc-700/90 bg-zinc-800/95 p-2 text-zinc-100 shadow-2xl shadow-black/50 backdrop-blur">
      {visibleSections.length > 0 ? (
        visibleSections.map((section) => (
          <SlashCommandSectionView
            key={section.title ?? "commands"}
            onSelect={onSelect}
            section={section}
          />
        ))
      ) : (
        <div className="px-3 py-2 text-sm text-zinc-500">No matching commands</div>
      )}
    </div>
  );
}

function SlashCommandSectionView({
  onSelect,
  section,
}: {
  onSelect: (insertText: string) => void;
  section: VisibleSlashCommandSection;
}) {
  return (
    <section className="grid gap-1">
      {section.title ? (
        <h3 className="px-2 pt-2 pb-1 text-sm text-zinc-400">{section.title}</h3>
      ) : null}
      {section.commands.map((item, index) => (
        <SlashCommandRow
          command={item}
          highlighted={!section.title && index === 0}
          key={item.id}
          onSelect={onSelect}
        />
      ))}
    </section>
  );
}

function SlashCommandRow({
  command: item,
  highlighted,
  onSelect,
}: {
  command: SlashCommand;
  highlighted: boolean;
  onSelect: (insertText: string) => void;
}) {
  return (
    <button
      className={cn(
        "grid h-9 w-full grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2 rounded-xl px-2 text-left text-sm hover:bg-zinc-700/75",
        highlighted ? "bg-zinc-700/80" : "",
      )}
      onClick={() => onSelect(item.insertText)}
      type="button"
    >
      <span className="grid h-6 w-6 place-items-center text-zinc-300">{item.icon}</span>
      <span className="min-w-0 truncate">
        <span className="font-medium text-zinc-100">{item.label}</span>
        <span className="ml-2 text-zinc-400">{item.description}</span>
      </span>
      {item.meta ? <span className="ml-3 text-zinc-400">{item.meta}</span> : null}
    </button>
  );
}

function visibleSlashCommandSections(query: string): VisibleSlashCommandSection[] {
  const normalizedQuery = query.trim().toLowerCase();
  return slashCommandSections
    .map((section) => ({
      ...section,
      commands: section.commands.filter((item) => matchesSlashQuery(item, normalizedQuery)),
    }))
    .filter((section) => section.commands.length > 0);
}

function matchesSlashQuery(item: SlashCommand, query: string) {
  if (query === "") {
    return true;
  }
  const haystack = `${item.label} ${item.description} ${item.id}`.toLowerCase();
  return haystack.includes(query);
}

function command(id: string, label: string, description: string, icon: ReactNode): SlashCommand {
  return { description, icon: iconNode(icon), id, insertText: `/${id} `, label };
}

function skill(
  id: string,
  label: string,
  description: string,
  meta: string,
  icon: ReactNode,
): SlashCommand {
  return {
    description,
    icon: iconNode(icon),
    id: `skill-${id}`,
    insertText: `/skill ${id} `,
    label,
    meta,
  };
}

function iconNode(icon: ReactNode) {
  return <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>;
}
