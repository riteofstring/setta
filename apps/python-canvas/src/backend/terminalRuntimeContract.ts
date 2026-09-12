import type { TerminalSessionV2, TerminalTicketV2 } from "./generatedContract";
import {
  fail,
  readBoolean,
  readClosedRecord,
  readNonBlankString,
  readPositiveInteger,
} from "./runtimeContract";

export function parseTerminalSessionV2(value: unknown): TerminalSessionV2 {
  const record = readClosedRecord(value, "terminal session", [
    "created",
    "columns",
    "rows",
  ]);
  return {
    columns: readPositiveInteger(record.columns, "terminal session.columns"),
    created: readBoolean(record.created, "terminal session.created"),
    rows: readPositiveInteger(record.rows, "terminal session.rows"),
  };
}

export function parseTerminalTicketV2(value: unknown): TerminalTicketV2 {
  const record = readClosedRecord(value, "terminal ticket", ["ticket"]);
  const ticket = readNonBlankString(record.ticket, "terminal ticket.ticket");
  if (ticket.length < 32) {
    fail("terminal ticket.ticket", "is invalid");
  }
  return { ticket };
}
