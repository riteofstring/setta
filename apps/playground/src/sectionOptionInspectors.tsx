import {
  getWorkspaceCodeSectionData,
  getWorkspaceTextSectionData,
  setWorkspaceCodeSectionData,
  setWorkspaceTextSectionData,
  useWorkspaceHost,
  WORKSPACE_CODE_SECTION_LANGUAGES,
  WORKSPACE_CODE_SECTION_MAXIMUM_INDENT_WIDTH,
  WORKSPACE_CODE_SECTION_MINIMUM_INDENT_WIDTH,
  WORKSPACE_CODE_SECTION_MODES,
  WORKSPACE_TEXT_SECTION_FORMATS,
  WORKSPACE_TEXT_SECTION_MAXIMUM_FONT_SIZE,
  WORKSPACE_TEXT_SECTION_MINIMUM_FONT_SIZE,
  type WorkspaceCodeSectionData,
  type WorkspaceCodeSectionLanguage,
  type WorkspaceCodeSectionMode,
  type WorkspaceGeneratedRegion,
  type WorkspaceHost,
  type WorkspaceTextSectionData,
  type WorkspaceTextSectionFormat,
} from "@setta/workspace";

// The Inspector contributions the playground registers for the two built-in content sections.
// They are the host's own authoring UI over package-owned typed data, so they live beside the
// registry rather than inside it.

// The package owns the code section's data contract and its editor; the host owns any UI that
// authors those options. This contribution is that UI: it reads and writes the same typed data
// the editor commits through, so every option is reachable without a package-invented settings
// panel (frozen main's own code-area settings are entirely file-binding, which is application
// state this package does not carry).
function updatePlaygroundCodeSection(
  host: WorkspaceHost,
  sectionId: string,
  update: (current: WorkspaceCodeSectionData) => WorkspaceCodeSectionData,
) {
  setWorkspaceCodeSectionData(
    host,
    sectionId,
    update(getWorkspaceCodeSectionData(host, sectionId)),
  );
}

// Only the generated mode carries a region, so switching modes adds or drops it rather than
// leaving a field the new mode may not have. A host that has no region in mind gets the same
// separator-bounded range the package's paint is built for: from the end of the first line to the
// start of the last, which leaves the surrounding text authorable on the ordinary editing surface.
function withPlaygroundCodeMode(
  current: WorkspaceCodeSectionData,
  mode: WorkspaceCodeSectionMode,
): WorkspaceCodeSectionData {
  const { code, diagnostics, indentWidth, language, lineNumbers, wrapLines } =
    current;
  const common = {
    code,
    diagnostics,
    indentWidth,
    language,
    lineNumbers,
    wrapLines,
  };
  if (mode !== "generated-document") {
    return { ...common, mode };
  }
  return {
    ...common,
    generatedRegion:
      current.mode === "generated-document"
        ? current.generatedRegion
        : defaultPlaygroundGeneratedRegion(code),
    mode,
  };
}

function defaultPlaygroundGeneratedRegion(
  code: string,
): WorkspaceGeneratedRegion {
  const firstBreak = code.indexOf("\n");
  const lastBreak = code.lastIndexOf("\n");
  return firstBreak === -1 || lastBreak <= firstBreak
    ? { from: 0, to: code.length }
    : { from: firstBreak, to: lastBreak + 1 };
}

// The offsets stay inside the document and keep the region non-empty, because the package rejects
// anything else at its data boundary and an Inspector must not be able to author a section that
// fails to load.
function withPlaygroundGeneratedRegion(
  current: WorkspaceCodeSectionData,
  edge: "from" | "to",
  value: number,
): WorkspaceCodeSectionData {
  if (current.mode !== "generated-document" || !Number.isInteger(value)) {
    return current;
  }
  const { from, to } = current.generatedRegion;
  const generatedRegion =
    edge === "from"
      ? { from: Math.min(Math.max(value, 0), to - 1), to }
      : { from, to: Math.min(Math.max(value, from + 1), current.code.length) };
  return { ...current, generatedRegion };
}

export function PlaygroundCodeSectionInspector({
  sectionId,
}: {
  sectionId: string;
}) {
  const host = useWorkspaceHost();
  const data = getWorkspaceCodeSectionData(host, sectionId);
  return (
    <div className="playground-host-pane">
      <fieldset className="playground-section-options">
        <legend>Editor options</legend>
        <label className="playground-section-option-row">
          <span>Language</span>
          <select
            className="playground-section-option-control"
            onChange={(event) =>
              updatePlaygroundCodeSection(host, sectionId, (current) => ({
                ...current,
                language: event.target.value as WorkspaceCodeSectionLanguage,
              }))
            }
            value={data.language}
          >
            {WORKSPACE_CODE_SECTION_LANGUAGES.map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </select>
        </label>
        <label className="playground-section-option-row">
          <span>Wrap lines</span>
          <input
            checked={data.wrapLines}
            className="playground-section-option-switch"
            onChange={(event) =>
              updatePlaygroundCodeSection(host, sectionId, (current) => ({
                ...current,
                wrapLines: event.target.checked,
              }))
            }
            type="checkbox"
          />
        </label>
        <label className="playground-section-option-row">
          <span>Line numbers</span>
          <input
            checked={data.lineNumbers}
            className="playground-section-option-switch"
            onChange={(event) =>
              updatePlaygroundCodeSection(host, sectionId, (current) => ({
                ...current,
                lineNumbers: event.target.checked,
              }))
            }
            type="checkbox"
          />
        </label>
        <label className="playground-section-option-row">
          <span>Indent width</span>
          <input
            className="playground-section-option-control playground-section-option-number"
            max={WORKSPACE_CODE_SECTION_MAXIMUM_INDENT_WIDTH}
            min={WORKSPACE_CODE_SECTION_MINIMUM_INDENT_WIDTH}
            onChange={(event) =>
              updatePlaygroundCodeSection(host, sectionId, (current) => ({
                ...current,
                indentWidth: Number(event.target.value),
              }))
            }
            type="number"
            value={data.indentWidth}
          />
        </label>
        <label className="playground-section-option-row">
          <span>Mode</span>
          <select
            className="playground-section-option-control"
            onChange={(event) =>
              updatePlaygroundCodeSection(host, sectionId, (current) =>
                withPlaygroundCodeMode(
                  current,
                  event.target.value as WorkspaceCodeSectionMode,
                ),
              )
            }
            value={data.mode}
          >
            {WORKSPACE_CODE_SECTION_MODES.map((mode) => (
              <option
                // A generated document has to have generated content, so an empty document
                // cannot declare one.
                disabled={mode === "generated-document" && data.code === ""}
                key={mode}
                value={mode}
              >
                {mode}
              </option>
            ))}
          </select>
        </label>
        {data.mode === "generated-document"
          ? (["from", "to"] as const).map((edge) => (
              <label className="playground-section-option-row" key={edge}>
                <span>Generated {edge}</span>
                <input
                  className="playground-section-option-control playground-section-option-number"
                  max={data.code.length}
                  min={0}
                  onChange={(event) =>
                    updatePlaygroundCodeSection(host, sectionId, (current) =>
                      withPlaygroundGeneratedRegion(
                        current,
                        edge,
                        Number(event.target.value),
                      ),
                    )
                  }
                  type="number"
                  value={data.generatedRegion[edge]}
                />
              </label>
            ))
          : null}
      </fieldset>
    </div>
  );
}

// The text section's options are host UI over the same typed data the editor and the header
// control commit through, so no option needs a package-invented settings panel.
function updatePlaygroundTextSection(
  host: WorkspaceHost,
  sectionId: string,
  update: (current: WorkspaceTextSectionData) => WorkspaceTextSectionData,
) {
  setWorkspaceTextSectionData(
    host,
    sectionId,
    update(getWorkspaceTextSectionData(host, sectionId)),
  );
}

export function PlaygroundTextSectionInspector({
  sectionId,
}: {
  sectionId: string;
}) {
  const host = useWorkspaceHost();
  const data = getWorkspaceTextSectionData(host, sectionId);
  return (
    <div className="playground-host-pane">
      <fieldset className="playground-section-options">
        <legend>Text options</legend>
        <label className="playground-section-option-row">
          <span>Format</span>
          <select
            className="playground-section-option-control"
            onChange={(event) =>
              updatePlaygroundTextSection(host, sectionId, (current) => ({
                ...current,
                format: event.target.value as WorkspaceTextSectionFormat,
              }))
            }
            value={data.format}
          >
            {WORKSPACE_TEXT_SECTION_FORMATS.map((format) => (
              <option key={format} value={format}>
                {format}
              </option>
            ))}
          </select>
        </label>
        <label className="playground-section-option-row">
          <span>Font size</span>
          <input
            className="playground-section-option-control playground-section-option-number"
            max={WORKSPACE_TEXT_SECTION_MAXIMUM_FONT_SIZE}
            min={WORKSPACE_TEXT_SECTION_MINIMUM_FONT_SIZE}
            onChange={(event) =>
              updatePlaygroundTextSection(host, sectionId, (current) => ({
                ...current,
                fontSizePx: Number(event.target.value),
              }))
            }
            type="number"
            value={data.fontSizePx}
          />
        </label>
        <label className="playground-section-option-row">
          <span>Read only</span>
          <input
            checked={data.readOnly}
            className="playground-section-option-switch"
            onChange={(event) =>
              updatePlaygroundTextSection(host, sectionId, (current) => ({
                ...current,
                readOnly: event.target.checked,
              }))
            }
            type="checkbox"
          />
        </label>
      </fieldset>
    </div>
  );
}
