import type { HttpapiServerModeResponse } from "openapi/http";

export type ResolvedServerMode = HttpapiServerModeResponse["mode"];
export type ServerModeValue = ResolvedServerMode | null;
