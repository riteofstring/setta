import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
} from "@setta/workspace";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, useState } from "react";

import type { Observation } from "../api/generatedContract";
import { useLens } from "../app/lensContext";
import { formatScalar } from "../app/lensModel";
import {
  presentationFields,
  presentationSection,
} from "../app/presentationSection";

function columnWidth(columnId: string): number {
  if (columnId === "selection") {
    return 44;
  }
  if (columnId === "observation") {
    return 164;
  }
  return 124;
}

export function ObservationTableSection({ sectionId }: { sectionId: string }) {
  const lens = useLens();
  const definition = presentationSection(lens.snapshot, sectionId, "table");
  const [sorting, setSorting] = useState<SortingState>([]);
  const selected = useMemo(
    () => new Set(lens.selection.selectedObservationIds),
    [lens.selection.selectedObservationIds],
  );
  const fields = presentationFields(lens.snapshot, definition.fieldIds);
  const data = useMemo(() => [...lens.visible], [lens.visible]);
  const columns = useMemo<ColumnDef<Observation>[]>(
    () => [
      {
        cell: ({ row }) => (
          <button
            aria-label={`${selected.has(row.original.id) ? "Remove" : "Add"} ${row.original.id} ${selected.has(row.original.id) ? "from" : "to"} selection`}
            aria-pressed={selected.has(row.original.id)}
            className="lens-row-selection"
            data-lens-select-observation={row.original.id}
            onClick={(event) => {
              event.stopPropagation();
              lens.actions.toggleObservation(row.original.id);
            }}
            type="button"
          >
            <span aria-hidden="true">
              {selected.has(row.original.id) ? "✓" : "+"}
            </span>
          </button>
        ),
        enableSorting: false,
        header: "",
        id: "selection",
        size: columnWidth("selection"),
      },
      {
        accessorFn: (observation) => observation.id,
        header: "Observation",
        id: "observation",
        size: columnWidth("observation"),
      },
      ...fields.map<ColumnDef<Observation>>((field) => ({
        accessorFn: (observation) => observation.values[field.id],
        cell: ({ getValue }) =>
          formatScalar(
            getValue() as Observation["values"][string] | undefined,
            field,
          ),
        header: field.unit ? `${field.label} · ${field.unit}` : field.label,
        id: field.id,
        size: columnWidth(field.id),
      })),
    ],
    [fields, lens.actions, selected],
  );
  const table = useReactTable({
    columns,
    data,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (observation) => observation.id,
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: (next) => {
      window.setTimeout(() => setSorting(next), 0);
    },
    state: { sorting },
  });
  const rows = table.getRowModel().rows;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => 35,
    getScrollElement: () => scrollRef.current,
    overscan: 8,
  });
  const gridTemplate = table
    .getVisibleLeafColumns()
    .map((column) => `${String(column.getSize())}px`)
    .join(" ");
  const selectedHidden = lens.selection.selectedObservationIds.filter(
    (id) => !lens.visible.some((observation) => observation.id === id),
  ).length;
  return (
    <div className="lens-table" data-lens-section="table">
      <div className="lens-table-summary">
        <span>{rows.length} visible</span>
        <span>{lens.selection.selectedObservationIds.length} selected</span>
        {selectedHidden > 0 ? (
          <span>{selectedHidden} outside cohort</span>
        ) : null}
      </div>
      <div
        aria-label="Experiment observations"
        className={`lens-table-scroll ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} ${NO_WHEEL_CLASS_NAME}`}
        ref={scrollRef}
        role="table"
      >
        {table.getHeaderGroups().map((headerGroup) => (
          <div
            className="lens-table-header"
            key={headerGroup.id}
            role="row"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            {headerGroup.headers.map((header) => (
              <button
                aria-label={
                  header.column.getCanSort()
                    ? `Sort by ${String(header.column.columnDef.header)}`
                    : undefined
                }
                className="lens-table-heading"
                disabled={!header.column.getCanSort()}
                key={header.id}
                onClick={header.column.getToggleSortingHandler()}
                role="columnheader"
                type="button"
              >
                {header.isPlaceholder
                  ? null
                  : flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
                {header.column.getIsSorted() === "asc" ? " ↑" : null}
                {header.column.getIsSorted() === "desc" ? " ↓" : null}
              </button>
            ))}
          </div>
        ))}
        <div
          className="lens-table-rows"
          style={{
            height: virtualizer.getTotalSize(),
            minWidth: table.getTotalSize(),
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            if (!row) {
              return null;
            }
            const focused =
              row.original.id === lens.selection.focusedObservationId;
            return (
              <div
                aria-selected={focused}
                className="lens-table-row"
                data-focused={focused || undefined}
                data-lens-observation-id={row.original.id}
                key={row.id}
                onClick={() => lens.actions.focusObservation(row.original.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    lens.actions.focusObservation(row.original.id);
                  }
                }}
                role="row"
                style={{
                  gridTemplateColumns: gridTemplate,
                  transform: `translateY(${String(virtualRow.start)}px)`,
                }}
                tabIndex={0}
              >
                {row.getVisibleCells().map((cell) => (
                  <div className="lens-table-cell" key={cell.id} role="cell">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
