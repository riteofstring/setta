import type { RunActivityDetailsProjection } from "@generated/backend";

import { cn } from "../lib/utils";

export function ActivityCommandExecutionDetails({
  details,
}: {
  details: RunActivityDetailsProjection;
}) {
  const command = details.commandExecution;
  if (command === null) {
    return null;
  }
  return (
    <>
      <ActivityTextBlock title="Result" value={command.result} />
      <ActivityTextBlock title="Error" tone="error" value={command.error} />
    </>
  );
}

export function ActivityFileChangeDetails({ details }: { details: RunActivityDetailsProjection }) {
  const fileChange = details.fileChange;
  if (fileChange === null) {
    return null;
  }
  const stats =
    fileChange.additions > 0 || fileChange.deletions > 0
      ? `+${fileChange.additions} -${fileChange.deletions}`
      : "";
  return (
    <>
      <ActivityTextBlock title="Patch Status" value={fileChange.patchStatus} />
      <ActivityTextBlock title="Stats" value={stats} />
      {fileChange.paths.map((path, index) => (
        <ActivityFileChangePathDetails index={index} key={`${path.path}:${index}`} path={path} />
      ))}
    </>
  );
}

function ActivityFileChangePathDetails({
  index,
  path,
}: {
  index: number;
  path: NonNullable<RunActivityDetailsProjection["fileChange"]>["paths"][number];
}) {
  const title = `File ${index + 1}`;
  const operation = path.operation === null ? "" : path.operation;
  const stats =
    path.additions > 0 || path.deletions > 0 ? `+${path.additions} -${path.deletions}` : "";
  const summary = [operation, path.movePath === "" ? "" : `from ${path.movePath}`, path.path, stats]
    .filter((value) => value !== "")
    .join(" ");
  return (
    <>
      <ActivityTextBlock monospace title={title} value={summary} />
      <ActivityPreBlock
        title={path.patchTruncated ? "Patch Snippet" : "Patch"}
        value={path.patch}
      />
    </>
  );
}

export function ActivityTextBlock({
  monospace = false,
  title,
  tone = "normal",
  value,
}: {
  monospace?: boolean;
  title: string;
  tone?: "error" | "normal";
  value: string;
}) {
  if (!value) {
    return null;
  }
  return (
    <section className="min-w-0">
      <h4 className="text-[10px] font-semibold text-muted-foreground uppercase">{title}</h4>
      <div
        className={cn(
          "mt-0.5 max-w-full break-words text-muted-foreground [overflow-wrap:anywhere]",
          monospace && "font-mono break-all",
          tone === "error" && "font-medium text-status-critical",
        )}
      >
        {value}
      </div>
    </section>
  );
}

export function ActivityPreBlock({ title, value }: { title: string; value: string }) {
  if (!value) {
    return null;
  }
  return (
    <section className="min-w-0">
      <h4 className="text-[10px] font-semibold text-muted-foreground uppercase">{title}</h4>
      <pre className="mt-1 max-h-32 w-full max-w-full min-w-0 overflow-x-hidden overflow-y-auto rounded-sm border border-border bg-popover p-2 font-mono text-xs leading-5 break-words whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">
        {value}
      </pre>
    </section>
  );
}

export function ActivityJSONDetails({ details }: { details: unknown }) {
  return <ActivityJSONBlock details={details} title="Details" />;
}

export function ActivityMCPDetails({ details }: { details: RunActivityDetailsProjection }) {
  const mcp = details.mcpToolCall;
  if (mcp === null) {
    return null;
  }
  return (
    <>
      <ActivityTextBlock title="Progress" value={mcp.progress} />
      <ActivityTextBlock title="Result" value={mcp.resultSummary} />
      <ActivityTextBlock title="Error" tone="error" value={mcp.error} />
      <ActivityTextBlock title="Duration" value={mcp.durationMs > 0 ? `${mcp.durationMs}ms` : ""} />
      <ActivityJSONBlock details={mcp.arguments} title="Arguments" />
      <ActivityJSONBlock details={mcp.appContext} title="App Context" />
      {mcp.result === null ? null : (
        <>
          <ActivityJSONBlock details={mcp.result.content} title="Content" />
          <ActivityJSONBlock details={mcp.result.structuredContent} title="Structured Content" />
          <ActivityJSONBlock details={mcp.result._meta} title="Metadata" />
        </>
      )}
    </>
  );
}

export function ActivityDynamicToolDetails({ details }: { details: RunActivityDetailsProjection }) {
  const tool = details.dynamicToolCall;
  if (tool === null) {
    return null;
  }
  return (
    <>
      <ActivityTextBlock title="Description" value={tool.description} />
      <ActivityTextBlock title="Result" value={tool.resultSummary} />
      <ActivityTextBlock title="Error" tone="error" value={tool.error} />
      <ActivityTextBlock
        title="Duration"
        value={tool.durationMs > 0 ? `${tool.durationMs}ms` : ""}
      />
      <ActivityJSONBlock details={tool.arguments} title="Arguments" />
      {tool.result === null ? null : (
        <>
          <ActivityTextBlock title="Success" value={dynamicToolSuccessText(tool.result.success)} />
          <ActivityJSONBlock details={tool.result.contentItems} title="Content" />
        </>
      )}
    </>
  );
}

function dynamicToolSuccessText(success: boolean | null) {
  if (success === null) {
    return "";
  }
  return String(success);
}

function ActivityJSONBlock({ details, title }: { details: unknown; title: string }) {
  const text = activityDetailsText(details);
  if (!text) {
    return null;
  }
  return <ActivityPreBlock title={title} value={boundedActivityDetailsText(text)} />;
}

const activityDetailsTextLimit = 4000;

function activityDetailsText(details: unknown) {
  if (details === null || details === undefined) {
    return "";
  }
  if (Array.isArray(details) && details.length === 0) {
    return "";
  }
  if (isRecord(details) && Object.keys(details).length === 0) {
    return "";
  }
  return JSON.stringify(details, null, 2);
}

function boundedActivityDetailsText(text: string) {
  if (text.length <= activityDetailsTextLimit) {
    return text;
  }
  return `${text.slice(0, activityDetailsTextLimit)}...`;
}

export function ActivityExit({ durationMs, exitCode }: { durationMs: number; exitCode: number }) {
  if (exitCode <= 0 && durationMs <= 0) {
    return null;
  }
  return (
    <ActivityTextBlock
      title="Exit"
      value={`${exitCode > 0 ? `exit ${exitCode}` : "exit 0"}${durationMs > 0 ? ` / ${durationMs}ms` : ""}`}
    />
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
