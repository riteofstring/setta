import {
  useWorkspaceDocumentSnapshot,
  type WorkspaceDocument,
  type WorkspaceSection,
} from "@setta/workspace";
import { useMemo, useState } from "react";

import {
  PARAMETER_PASSING_STYLE_KEYWORD_ONLY_V2,
  PARAMETER_PASSING_STYLE_POSITIONAL_ONLY_V2,
  PARAMETER_PASSING_STYLE_POSITIONAL_OR_KEYWORD_V2,
  PARAMETER_PASSING_STYLE_VARIADIC_KEYWORD_V2,
  PARAMETER_PASSING_STYLE_VARIADIC_POSITIONAL_V2,
  type ParameterPassingStyleV2,
} from "../backend/generatedContract";
import type { ParameterItemData } from "../sections/CallableSection";
import {
  CALLABLE_SECTION_KIND,
  readCallableParameterRows,
} from "./workspaceProjection";

type ResolvedParameter = {
  data: ParameterItemData;
  id: string;
};

export type PythonCanvasParamsPaneModel = {
  parameters: ReadonlyArray<ResolvedParameter>;
  section: WorkspaceSection;
};

// Provider metadata is intentionally identified from the existing canonical row contract. An
// app-authored row has no provider ordinal and stays editable only in its section row.
export function getPythonCanvasParamsPaneModel(
  document: WorkspaceDocument,
): PythonCanvasParamsPaneModel | null {
  if (document.activeIds.length !== 1) {
    return null;
  }
  const activeSectionId = document.activeIds[0];
  if (!activeSectionId) {
    throw new Error(
      "A single Python Canvas Params selection requires one section id.",
    );
  }
  const section = document.sections[activeSectionId];
  if (section === undefined || section.kind !== CALLABLE_SECTION_KIND) {
    return null;
  }
  const parameters = readCallableParameterRows(section)
    .filter(({ data }) => data.providerOrdinal !== null)
    .sort((left, right) => {
      const leftOrdinal = left.data.providerOrdinal;
      const rightOrdinal = right.data.providerOrdinal;
      if (leftOrdinal === null || rightOrdinal === null) {
        throw new Error(
          "Resolved Python Canvas parameter metadata requires a provider ordinal.",
        );
      }
      return leftOrdinal - rightOrdinal;
    });
  return parameters.length === 0 ? null : { parameters, section };
}

function passingStyleLabel(style: ParameterPassingStyleV2): string {
  switch (style) {
    case PARAMETER_PASSING_STYLE_POSITIONAL_ONLY_V2:
      return "Positional only";
    case PARAMETER_PASSING_STYLE_POSITIONAL_OR_KEYWORD_V2:
      return "Positional or keyword";
    case PARAMETER_PASSING_STYLE_KEYWORD_ONLY_V2:
      return "Keyword only";
    case PARAMETER_PASSING_STYLE_VARIADIC_POSITIONAL_V2:
      return "Variadic positional";
    case PARAMETER_PASSING_STYLE_VARIADIC_KEYWORD_V2:
      return "Variadic keyword";
  }
}

function matchesFilter(parameter: ResolvedParameter, filter: string): boolean {
  if (filter === "") {
    return true;
  }
  const searchable = [
    parameter.data.name,
    parameter.data.typeAnnotation ?? "",
    parameter.data.default ?? "",
    passingStyleLabel(parameter.data.passingStyle),
  ]
    .join(" ")
    .toLocaleLowerCase();
  return searchable.includes(filter);
}

function ParameterMetadata({ parameter }: { parameter: ResolvedParameter }) {
  const ordinal = parameter.data.providerOrdinal;
  if (ordinal === null) {
    throw new Error(
      "Resolved Python Canvas parameter metadata requires a provider ordinal.",
    );
  }
  return (
    <section
      className="python-canvas-params-group"
      data-python-canvas-parameter-group={parameter.id}
    >
      <h3>{parameter.data.name}</h3>
      <dl>
        {parameter.data.typeAnnotation === null ? null : (
          <div>
            <dt>Type</dt>
            <dd>
              <code>{parameter.data.typeAnnotation}</code>
            </dd>
          </div>
        )}
        <div>
          <dt>Passing style</dt>
          <dd>{passingStyleLabel(parameter.data.passingStyle)}</dd>
        </div>
        {parameter.data.default === null ? null : (
          <div>
            <dt>Provider default</dt>
            <dd>
              <code>{parameter.data.default}</code>
            </dd>
          </div>
        )}
        <div>
          <dt>Provider order</dt>
          <dd>{ordinal + 1}</dd>
        </div>
      </dl>
    </section>
  );
}

export function PythonCanvasParamsPane() {
  const document = useWorkspaceDocumentSnapshot();
  const model = getPythonCanvasParamsPaneModel(document);
  const [filterDraft, setFilterDraft] = useState("");
  const normalizedFilter = filterDraft.trim().toLocaleLowerCase();
  const filteredParameters = useMemo(
    () =>
      model?.parameters.filter((parameter) =>
        matchesFilter(parameter, normalizedFilter),
      ) ?? [],
    [model, normalizedFilter],
  );

  if (model === null) {
    return null;
  }

  return (
    <div className="python-canvas-params-pane" data-python-canvas-params-pane>
      <label className="python-canvas-params-filter">
        <i
          aria-hidden="true"
          className="gg-sort-az python-canvas-params-filter-icon"
        />
        <input
          aria-label="Filter parameters"
          onChange={(event) => setFilterDraft(event.currentTarget.value)}
          placeholder="Filter"
          type="search"
          value={filterDraft}
        />
      </label>
      <div className="python-canvas-params-list">
        {filteredParameters.map((parameter) => (
          <ParameterMetadata key={parameter.id} parameter={parameter} />
        ))}
        {filteredParameters.length === 0 ? (
          <p className="python-canvas-params-empty" role="status">
            No provider parameters match this filter.
          </p>
        ) : null}
      </div>
    </div>
  );
}
