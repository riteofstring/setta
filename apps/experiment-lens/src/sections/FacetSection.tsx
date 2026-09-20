import { useMemo } from "react";

import type {
  FieldDefinition,
  FieldFilter,
  JsonScalar,
} from "../backend/generatedContract";
import { useLens } from "../app/lensContext";
import {
  categoricalFactorFields,
  fieldChoices,
  fieldExtent,
  formatScalar,
  numericFactorFields,
} from "../app/lensModel";

function filterFor(
  filters: readonly FieldFilter[],
  fieldId: string,
): FieldFilter | undefined {
  return filters.find((filter) => filter.fieldId === fieldId);
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
  const current = filterFor(lens.selection.filters, field.id);
  const minimum = current?.operator === "range" ? current.minimum : null;
  const maximum = current?.operator === "range" ? current.maximum : null;
  const commit = (nextMinimum: number | null, nextMaximum: number | null) =>
    lens.actions.setRangeFilter(field.id, nextMinimum, nextMaximum, extent);
  return (
    <fieldset className="lens-facet lens-range-facet">
      <legend>{field.label}</legend>
      <label>
        <span>From</span>
        <input
          aria-label={`${field.label} minimum`}
          defaultValue={minimum ?? extent.minimum}
          key={`minimum:${String(minimum)}`}
          max={maximum ?? extent.maximum}
          min={extent.minimum}
          onBlur={(event) => {
            const value = event.currentTarget.valueAsNumber;
            if (
              Number.isFinite(value) &&
              value !== (minimum ?? extent.minimum)
            ) {
              commit(value, maximum);
            }
          }}
          step="any"
          type="number"
        />
      </label>
      <span className="lens-range-separator">–</span>
      <label>
        <span>To</span>
        <input
          aria-label={`${field.label} maximum`}
          defaultValue={maximum ?? extent.maximum}
          key={`maximum:${String(maximum)}`}
          max={extent.maximum}
          min={minimum ?? extent.minimum}
          onBlur={(event) => {
            const value = event.currentTarget.valueAsNumber;
            if (
              Number.isFinite(value) &&
              value !== (maximum ?? extent.maximum)
            ) {
              commit(minimum, value);
            }
          }}
          step="any"
          type="number"
        />
      </label>
      {field.unit ? <small>{field.unit}</small> : null}
    </fieldset>
  );
}

export function FacetSection() {
  const lens = useLens();
  const choiceFields = useMemo(() => {
    const categorical = categoricalFactorFields(lens.snapshot).filter(
      (field) => fieldChoices(lens.snapshot.observations, field.id).length <= 8,
    );
    const numericChoices = numericFactorFields(lens.snapshot).filter(
      (field) => fieldChoices(lens.snapshot.observations, field.id).length <= 8,
    );
    return [...categorical.slice(0, 1), ...numericChoices.slice(0, 2)];
  }, [lens.snapshot]);
  const chosenIds = new Set(choiceFields.map((field) => field.id));
  const rangeField = useMemo(
    () =>
      numericFactorFields(lens.snapshot)
        .filter((field) => !chosenIds.has(field.id))
        .sort(
          (left, right) =>
            fieldChoices(lens.snapshot.observations, right.id).length -
            fieldChoices(lens.snapshot.observations, left.id).length,
        )[0],
    [chosenIds, lens.snapshot],
  );
  return (
    <div className="lens-facets" data-lens-section="facets">
      <div className="lens-facet-grid">
        {choiceFields.map((field) => (
          <ChoiceFacet field={field} key={field.id} />
        ))}
        {rangeField ? <RangeFacet field={rangeField} /> : null}
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
