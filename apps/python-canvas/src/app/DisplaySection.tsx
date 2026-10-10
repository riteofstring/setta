import {
  createWorkspaceTextSection,
  createWorkspaceTextSectionData,
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
  useIsScrollable,
  type SectionKindDefinition,
  type WorkspaceSection,
} from "@setta/workspace";
import { useState } from "react";
import { DisplayChart } from "./DisplayChart";
import { DisplayRunButton, useDisplay } from "./displayContext";
import type { DisplayImage, DisplayPanel, DisplayTable } from "./displayOutput";

const markdown = createWorkspaceTextSection({
  formats: ["markdown"],
  displayModes: ["render"],
}) as Extract<SectionKindDefinition, { presentation?: undefined }>;
const colors: Record<string, string> = {
  image: "◈",
  chart: "⌁",
  table: "▦",
  markdown: "≡",
};

export function displaySectionKinds(): Record<string, SectionKindDefinition> {
  return Object.fromEntries(
    Object.keys(colors).map((kind) => [
      `python-canvas.display.${kind}`,
      {
        defaultSize: { width: 640, height: 430 },
        contentClassName: "flex min-h-0 flex-col",
        renderContent: (section: WorkspaceSection) => (
          <DisplaySection section={section} />
        ),
        icon: () => <span aria-hidden="true">{colors[kind]}</span>,
      },
    ]),
  );
}

function DisplaySection({ section }: { section: WorkspaceSection }) {
  const display = useDisplay();
  const { ref, isScrollable } = useIsScrollable();
  const panelId = section.id.slice("python-canvas:display:".length);
  const result = display?.state.panels[panelId];
  if (!result)
    return (
      <div className="python-canvas-display-empty">
        <span aria-hidden="true">
          {colors[section.kind.split(".").at(-1) ?? "image"]}
        </span>
        <strong>{section.name}</strong>
        <p>Your Python will fill this section when you run the experiment.</p>
        <DisplayRunButton />
      </div>
    );
  const { panel, revision } = result;
  return (
    <div
      ref={ref}
      className={`python-canvas-display-body ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} ${isScrollable ? NO_WHEEL_CLASS_NAME : ""}`}
    >
      {revision !== display?.state.currentRevision && (
        <p className="python-canvas-display-stale">
          Previous run · inputs have changed
        </p>
      )}
      {renderPanel(panel, section)}
      {panel.caption && (
        <p className="python-canvas-display-caption">{panel.caption}</p>
      )}
    </div>
  );
}

function renderPanel(panel: DisplayPanel, section: WorkspaceSection) {
  return panel.kind === "image" ? (
    <ResultImage panel={panel} />
  ) : panel.kind === "table" ? (
    <ResultTable panel={panel} />
  ) : panel.kind === "chart" ? (
    <DisplayChart panel={panel} />
  ) : (
    markdown.renderContent({
      ...section,
      data: createWorkspaceTextSectionData({
        text: panel.text,
        format: "markdown",
        displayMode: "render",
        readOnly: true,
      }),
    })
  );
}

function ResultImage({ panel }: { panel: DisplayImage }) {
  return (
    <figure className="python-canvas-result-image">
      <img
        src={panel.image}
        alt={panel.caption || panel.title}
        draggable={false}
      />
      <a
        href={panel.image}
        download={`${panel.id}.${panel.image.startsWith("data:image/svg+") ? "svg" : panel.image.slice(11).split(";")[0]}`}
        className={NO_DRAG_CLASS_NAME}
      >
        Save image ↗
      </a>
    </figure>
  );
}

function ResultTable({ panel }: { panel: DisplayTable }) {
  const [sort, setSort] = useState<{
    index: number;
    descending: boolean;
  } | null>(null);
  const rows = [...panel.rows];
  if (sort)
    rows.sort((a, b) => {
      const first = a[sort.index];
      const second = b[sort.index];
      const compared =
        typeof first === "number" && typeof second === "number"
          ? first - second
          : String(first ?? "").localeCompare(String(second ?? ""));
      return compared * (sort.descending ? -1 : 1);
    });
  return (
    <table className="python-canvas-result-table">
      <caption>{panel.title} · select a column to sort</caption>
      <thead>
        <tr>
          {panel.columns.map((column, index) => (
            <th
              key={`${String(index)}:${column}`}
              scope="col"
              aria-sort={
                sort?.index === index
                  ? sort.descending
                    ? "descending"
                    : "ascending"
                  : "none"
              }
            >
              <button
                type="button"
                onClick={() =>
                  setSort({
                    index,
                    descending:
                      sort?.index === index ? !sort.descending : false,
                  })
                }
              >
                {column}
                {sort?.index === index ? (sort.descending ? " ↓" : " ↑") : ""}
              </button>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {row.map((value, cellIndex) => (
              <td key={cellIndex}>
                {typeof value === "string" &&
                  /^#[0-9a-f]{6}$/iu.test(value) && (
                    <span
                      className="python-canvas-color-swatch"
                      style={{ background: value }}
                    />
                  )}
                {String(value ?? "—")}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
