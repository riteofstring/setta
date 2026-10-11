import { NO_WHEEL_CLASS_NAME, useIsScrollable } from "@riteofstring/setta";
import { useMemo } from "react";

import type {
  FieldDefinition,
  FieldFilter,
  JsonScalar,
} from "../api/generatedContract";
import { useLens } from "../app/lensContext";
import {
  presentationFields,
  presentationSection,
} from "../app/presentationSection";
import { fieldChoices, fieldExtent, formatScalar } from "../app/lensModel";

function filterFor(
  filters: readonly FieldFilter[],
  fieldId: string,
): FieldFilter | undefined {
  return filters.find((filter) => filter.fieldId === fieldId);
}

function rangeBoundsFor(
  filters: readonly FieldFilter[],
  fieldId: string,
): { maximum: number | null; minimum: number | null } {
  const current = filterFor(filters, fieldId);
  if (current?.operator !== "range") {
    return { maximum: null, minimum: null };
  }
  return { maximum: current.maximum, minimum: current.minimum };
}

function commitChangedNumber(
  value: number,
  current: number,
  commit: (value: number) => void,
) {
  if (Number.isFinite(value) && value !== current) {
    commit(value);
  }
}

function ChoiceFacet({ field }: { field: FieldDefinition }) {
  const lens = useLens();
  const choices = useMemo(
    () => fieldChoices(lens.snapshot.observations, field.id),
    [field.id, lens.snapshot.observations],
  );
  const current = filterFor(lens.selection.filters, field.id);
  const allValues = choices.map((choice) => choice.value);
  const accepted = new Set(
    current?.operator === "in"
      ? current.values.map((value) => `${typeof value}:${String(value)}`)
      : allValues.map((value) => `${typeof value}:${String(value)}`),
  );
  const toggle = (value: JsonScalar) => {
    const key = `${typeof value}:${String(value)}`;
    const next = accepted.has(key)
      ? allValues.filter(
          (candidate) => `${typeof candidate}:${String(candidate)}` !== key,
        )
      : [
          ...allValues.filter((candidate) =>
            accepted.has(`${typeof candidate}:${String(candidate)}`),
          ),
          value,
        ];
    lens.actions.setCategoricalFilter(
      field.id,
      next.length === 0 ? allValues : next,
      allValues,
    );
  };
  return (
    <fieldset className="lens-facet">
      <legend>{field.label}</legend>
      <div className="lens-choice-list">
        {choices.map((choice) => {
          const key = `${typeof choice.value}:${String(choice.value)}`;
          return (
            <button
              aria-pressed={accepted.has(key)}
              data-lens-filter-value={String(choice.value)}
              key={key}
              onClick={() => toggle(choice.value)}
              type="button"
            >
              {formatScalar(choice.value, field)}
              <span>{choice.count}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function RangeFacet({ field }: { field: FieldDefinition }) {
  const lens = useLens();
  const extent = useMemo(
    () => fieldExtent(lens.snapshot.observations, field.id),
    [field.id, lens.snapshot.observations],
  );
  if (!extent) {
    return null;
  }
  const { maximum, minimum } = rangeBoundsFor(lens.selection.filters, field.id);
  const displayedMinimum = minimum ?? extent.minimum;
  const displayedMaximum = maximum ?? extent.maximum;
  const commit = (nextMinimum: number | null, nextMaximum: number | null) =>
    lens.actions.setRangeFilter(field.id, nextMinimum, nextMaximum, extent);
  return (
    <fieldset className="lens-facet lens-range-facet">
      <legend>{field.label}</legend>
      <label>
        <span>From</span>
        <input
          aria-label={`${field.label} minimum`}
          defaultValue={displayedMinimum}
          key={`minimum:${String(displayedMinimum)}`}
          max={displayedMaximum}
          min={extent.minimum}
          onBlur={(event) =>
            commitChangedNumber(
              event.currentTarget.valueAsNumber,
              displayedMinimum,
              (value) => commit(value, maximum),
            )
          }
          step="any"
          type="number"
        />
      </label>
      <span className="lens-range-separator">–</span>
      <label>
        <span>To</span>
        <input
          aria-label={`${field.label} maximum`}
          defaultValue={displayedMaximum}
          key={`maximum:${String(displayedMaximum)}`}
          max={extent.maximum}
          min={displayedMinimum}
          onBlur={(event) =>
            commitChangedNumber(
              event.currentTarget.valueAsNumber,
              displayedMaximum,
              (value) => commit(minimum, value),
            )
          }
          step="any"
          type="number"
        />
      </label>
      {field.unit ? <small>{field.unit}</small> : null}
    </fieldset>
  );
}

export function FacetSection({ sectionId }: { sectionId: string }) {
  const lens = useLens();
  const { isScrollable, ref } = useIsScrollable();
  const definition = presentationSection(lens.snapshot, sectionId, "facets");
  const fields = presentationFields(lens.snapshot, definition.fieldIds);
  return (
    <div
      className={`lens-facets ${isScrollable ? NO_WHEEL_CLASS_NAME : ""}`}
      data-lens-section="facets"
      ref={ref}
    >
      <div className="lens-facet-grid">
        {fields.map((field) =>
          field.valueType === "number" &&
          fieldChoices(lens.snapshot.observations, field.id).length > 8 ? (
            <RangeFacet field={field} key={field.id} />
          ) : (
            <ChoiceFacet field={field} key={field.id} />
          ),
        )}
      </div>
      <div className="lens-cohort-summary">
        <div>
          <strong data-lens-visible-count>{lens.visible.length}</strong>
          <span>of {lens.snapshot.observations.length} observations</span>
        </div>
        {lens.selection.filters.length > 0 ? (
          <button onClick={lens.actions.clearFilters} type="button">
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
