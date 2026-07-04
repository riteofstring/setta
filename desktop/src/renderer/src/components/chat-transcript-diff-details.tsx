import type { RunActivityDetailsProjection } from "@generated/backend";

export function ActivityDiffDetails({ details }: { details: RunActivityDetailsProjection }) {
  const diff = details.diff;
  if (diff === null) {
    return null;
  }
  const stats =
    diff.additions > 0 || diff.deletions > 0 ? `+${diff.additions} -${diff.deletions}` : "";
  return (
    <>
      <DiffTextBlock title="Summary" value={diff.summary} />
      <DiffTextBlock title="Stats" value={stats} />
      {diff.paths.map((path, index) => (
        <ActivityDiffPathDetails index={index} key={`${path.path}:${index}`} path={path} />
      ))}
      <DiffPreBlock title={diff.patchTruncated ? "Patch Snippet" : "Patch"} value={diff.patch} />
    </>
  );
}

function ActivityDiffPathDetails({
  index,
  path,
}: {
  index: number;
  path: NonNullable<RunActivityDetailsProjection["diff"]>["paths"][number];
}) {
  const title = `Diff File ${index + 1}`;
  const operation = path.operation === null ? "" : path.operation;
  const stats =
    path.additions > 0 || path.deletions > 0 ? `+${path.additions} -${path.deletions}` : "";
  const summary = [operation, path.movePath === "" ? "" : `from ${path.movePath}`, path.path, stats]
    .filter((value) => value !== "")
    .join(" ");
  return <DiffTextBlock monospace title={title} value={summary} />;
}

function DiffTextBlock({
  monospace = false,
  title,
  value,
}: {
  monospace?: boolean;
  title: string;
  value: string;
}) {
  if (!value) {
    return null;
  }
  return (
    <section className="min-w-0">
      <h4 className="text-[10px] font-semibold text-muted-foreground uppercase">{title}</h4>
      <div
        className={[
          "mt-0.5 max-w-full break-words text-muted-foreground [overflow-wrap:anywhere]",
          monospace ? "font-mono break-all" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {value}
      </div>
    </section>
  );
}

function DiffPreBlock({ title, value }: { title: string; value: string }) {
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
