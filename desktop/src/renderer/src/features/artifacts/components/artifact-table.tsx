import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@renderer/components/ui/table";

import { cn } from "@renderer/lib/utils";

import type { ArtifactComponentProps } from "../generated/artifact-catalog-props";

type TableProps = ArtifactComponentProps["Table"];
type TableColumn = TableProps["columns"][number];
type ColumnAlignment = NonNullable<TableColumn["align"]>;

const alignmentClasses = {
  start: "text-start",
  center: "text-center",
  end: "text-end tabular-nums",
} satisfies Record<ColumnAlignment, string>;

type AlignedCell = { readonly column: TableColumn; readonly text: string };

/**
 * The table adapter.
 *
 * The backend guarantees one cell per column, in column order, before a
 * document is ever stored, so this renderer does not repair a mismatched row —
 * it fails loudly inside the document's element boundary rather than quietly
 * shifting every cell after the gap into the wrong column.
 */
export function ArtifactTable({ caption, columns, rows }: TableProps) {
  /*
   * Hairlines and tabular figures, no frame. The vendored table is built for a
   * data grid — a boxed cell with even padding on all four sides — and a table
   * inside a document is set like a table in a book: flush to the text column
   * on the left, with the row rule doing the separating.
   */
  return (
    <Table className="setta-artifact-figure text-[14px]">
      {caption === undefined ? null : (
        <TableCaption className="setta-artifact-faint mt-[10px] text-start text-[12px] leading-[1.4]">
          {caption}
        </TableCaption>
      )}
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead
              className={cn(
                "setta-artifact-kicker h-auto pt-0 pb-[9px] ps-0 pe-[14px] last:pe-0",
                alignmentClasses[column.align ?? "start"],
              )}
              key={column.key}
              scope="col"
            >
              {column.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, rowIndex) => (
          <TableRow key={rowIndex}>
            {alignRow(columns, row, rowIndex).map((cell) => (
              <TableCell
                className={cn(
                  "py-[11px] ps-0 pe-[14px] text-muted-foreground first:text-foreground last:pe-0",
                  alignmentClasses[cell.column.align ?? "start"],
                )}
                key={cell.column.key}
              >
                {cell.text}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function alignRow(
  columns: TableProps["columns"],
  row: TableProps["rows"][number],
  rowIndex: number,
): AlignedCell[] {
  const cells: AlignedCell[] = [];
  for (const [index, column] of columns.entries()) {
    const text = row[index];
    if (text === undefined) {
      throw new Error(rowShapeMessage(rowIndex, row.length, columns.length));
    }
    cells.push({ column, text });
  }
  if (row.length > columns.length) {
    throw new Error(rowShapeMessage(rowIndex, row.length, columns.length));
  }
  return cells;
}

function rowShapeMessage(rowIndex: number, cells: number, columns: number): string {
  return `artifact table row ${rowIndex + 1} has ${cells} cells for ${columns} columns`;
}
