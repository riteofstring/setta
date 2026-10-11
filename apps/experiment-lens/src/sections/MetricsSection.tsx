import { NO_WHEEL_CLASS_NAME, useIsScrollable } from "@riteofstring/setta";

import { useLens } from "../app/lensContext";
import { aggregateValues } from "../app/aggregation";
import { formatScalar } from "../app/lensModel";
import {
  presentationFields,
  presentationSection,
} from "../app/presentationSection";

export function MetricsSection({ sectionId }: { sectionId: string }) {
  const lens = useLens();
  const { isScrollable, ref } = useIsScrollable();
  const definition = presentationSection(lens.snapshot, sectionId, "metrics");
  const fields = presentationFields(lens.snapshot, definition.fieldIds);
  return (
    <div
      className={`lens-metrics ${isScrollable ? NO_WHEEL_CLASS_NAME : ""}`}
      data-lens-section="metrics"
      ref={ref}
    >
      {fields.map((field) => {
        const values = lens.visible
          .map((observation) => observation.values[field.id])
          .filter(
            (value): value is number =>
              typeof value === "number" && Number.isFinite(value),
          );
        const value = aggregateValues(values, definition.aggregation);
        return (
          <div className="lens-metric-card" key={field.id}>
            <span>{field.label}</span>
            <strong>
              {definition.aggregation === "count"
                ? formatScalar(value ?? undefined)
                : formatScalar(value ?? undefined, field)}
            </strong>
            <small>{definition.aggregation}</small>
          </div>
        );
      })}
      <div className="lens-metric-card lens-metric-count">
        <span>Visible observations</span>
        <strong>{lens.visible.length}</strong>
        <small>of {lens.snapshot.observations.length}</small>
      </div>
    </div>
  );
}
