import {
  readArray,
  readClosedRecord,
  readFiniteNumber,
  readNonBlankString,
  readOption,
  readPlainRecord,
  readText,
} from "../api/runtimeContractPrimitives";

type PanelHeader = { id: string; title: string; caption: string };
export type DisplayImage = PanelHeader & { kind: "image"; image: string };
export type DisplayTable = PanelHeader & {
  kind: "table";
  columns: string[];
  rows: Array<Array<string | number | boolean | null>>;
};
export type DisplayChart = PanelHeader & {
  kind: "chart";
  xLabel: string;
  yLabel: string;
  series: Array<{
    label: string;
    color: string;
    points: Array<[number, number]>;
  }>;
};
export type DisplayMarkdown = PanelHeader & { kind: "markdown"; text: string };
export type DisplayPanel =
  DisplayImage | DisplayTable | DisplayChart | DisplayMarkdown;

const HEADER_FIELDS = ["id", "title", "caption", "kind"];
const PANEL_FIELDS = {
  image: ["image"],
  table: ["columns", "rows"],
  chart: ["xLabel", "yLabel", "series"],
  markdown: ["text"],
};

export function readDisplayOutput(stdout: string): {
  panels: DisplayPanel[];
  warnings: string[];
  log: string;
} {
  const lines = stdout.split("\n");
  const line = [...lines]
    .reverse()
    .find((value) => value.startsWith("SETTA_DISPLAY "));
  if (line === undefined)
    throw new Error(
      "The program finished without visual results. Check its output below, then run again.",
    );
  const record = readClosedRecord(JSON.parse(line.slice(14)), "display", [
    "version",
    "panels",
  ]);
  if (record.version !== 1 || !Array.isArray(record.panels))
    throw new Error("The visual result has an unsupported format.");
  const panels: DisplayPanel[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  for (const [index, value] of record.panels.entries()) {
    try {
      const panel = readPanel(value);
      if (ids.has(panel.id)) throw new Error("duplicate result name");
      panels.push(panel);
      ids.add(panel.id);
    } catch {
      warnings.push(
        `Result ${String(index + 1)} could not be displayed. Its previous result is retained.`,
      );
    }
  }
  if (panels.length === 0)
    throw new Error(
      "No visual results could be displayed. Your previous results are still available.",
    );
  return {
    panels,
    warnings,
    log: lines
      .filter((value) => !value.startsWith("SETTA_DISPLAY "))
      .join("\n")
      .trim(),
  };
}

function readPanel(value: unknown): DisplayPanel {
  const candidate = readPlainRecord(value, "panel");
  const kind = readOption(candidate.kind, "panel.kind", [
    "image",
    "table",
    "chart",
    "markdown",
  ] as const);
  const record = readClosedRecord(value, "panel", [
    ...HEADER_FIELDS,
    ...PANEL_FIELDS[kind],
  ]);
  const id = readNonBlankString(record.id, "panel.id");
  if (!/^[a-z][a-z0-9-]*$/u.test(id)) throw new Error("Invalid result name");
  const header = {
    id,
    title: readNonBlankString(record.title, "panel.title"),
    caption: readText(record.caption, "panel.caption", true),
  };
  if (kind === "markdown")
    return { ...header, kind, text: readText(record.text, "panel.text", true) };
  if (kind === "image") {
    const image = readNonBlankString(record.image, "panel.image");
    if (
      !/^data:image\/(?:svg\+xml|png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/u.test(
        image,
      )
    )
      throw new Error("Unsupported image");
    return { ...header, kind, image };
  }
  if (kind === "table") {
    const columns = readArray(record.columns, "panel.columns", (item) =>
      readNonBlankString(item, "column"),
    );
    const rows = readArray(record.rows, "panel.rows", (row) =>
      readArray(row, "row", (cell) => {
        if (
          cell === null ||
          typeof cell === "string" ||
          typeof cell === "boolean"
        )
          return cell;
        return readFiniteNumber(cell, "cell");
      }),
    );
    if (
      columns.length === 0 ||
      rows.some((row) => row.length !== columns.length)
    )
      throw new Error("Mismatched table columns");
    return { ...header, kind, columns, rows };
  }
  const series = readArray(record.series, "panel.series", (value) => {
    const line = readClosedRecord(value, "series", [
      "label",
      "color",
      "points",
    ]);
    const color = readNonBlankString(line.color, "series.color");
    if (!/^#[0-9a-f]{6}$/iu.test(color)) throw new Error("Invalid chart color");
    const points = readArray(
      line.points,
      "points",
      (value): [number, number] => {
        if (!Array.isArray(value) || value.length !== 2)
          throw new Error("Invalid chart point");
        return [
          readFiniteNumber(value[0], "x"),
          readFiniteNumber(value[1], "y"),
        ];
      },
    );
    return {
      label: readNonBlankString(line.label, "series.label"),
      color,
      points,
    };
  });
  return {
    ...header,
    kind,
    series,
    xLabel: readText(record.xLabel, "panel.xLabel", true),
    yLabel: readText(record.yLabel, "panel.yLabel", true),
  };
}
