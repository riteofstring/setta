package frontendbindings

import "setta/internal/mcpx"

const generatedAskUserQuestionToolName = "AskUserQuestion"

func interopSupportDeclarations() []TypeDeclaration {
	return []TypeDeclaration{
		exportedFunctionDeclaration(
			"normalizeGeneratedOrigin",
			"string | null",
			`if (typeof rawOrigin !== "string") {
  return null;
}
const trimmedOrigin = rawOrigin.trim();
if (!trimmedOrigin) {
  return null;
}
let parsedOrigin: URL;
try {
  parsedOrigin = new URL(trimmedOrigin);
} catch {
  return null;
}
if (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") {
  return null;
}
if (!parsedOrigin.hostname) {
  return null;
}
if (parsedOrigin.username || parsedOrigin.password) {
  return null;
}
const port = parsedOrigin.port.trim();
if (!port) {
  return (
    parsedOrigin.protocol +
    "//" +
    formatGeneratedOriginHost(parsedOrigin.hostname)
  );
}
return (
  parsedOrigin.protocol +
  "//" +
  formatGeneratedOriginHost(parsedOrigin.hostname) +
  ":" +
  port
);`,
			TypeProperty{Name: "rawOrigin", TypeExpr: "string | null | undefined"},
		),
		functionDeclaration(
			"formatGeneratedOriginHost",
			false,
			"string",
			`if (hostname.includes(":") && !hostname.startsWith("[")) {
  return "[" + hostname + "]";
}
return hostname;`,
			TypeProperty{Name: "hostname", TypeExpr: "string"},
		),
		exportedFunctionDeclaration(
			"normalizeGeneratedToolName",
			"string | null",
			buildNormalizeGeneratedToolNameBody(),
			TypeProperty{Name: "rawToolName", TypeExpr: "string | null | undefined"},
		),
	}
}

func buildNormalizeGeneratedToolNameBody() string {
	singlePrefix := mcpx.DefaultServerID + "_"
	doublePrefix := mcpx.DefaultServerID + mcpx.ToolNameSeparator
	askUserQuestionToolName := tsStringLiteralExpr(generatedAskUserQuestionToolName)
	return `if (typeof rawToolName !== "string") {
  return null;
}
const trimmed = rawToolName.trim();
if (!trimmed) {
  return null;
}
let normalized = trimmed;
if (normalized.startsWith("mcp__")) {
  normalized = normalized.slice("mcp__".length);
}
if (
  normalized.startsWith(` + tsStringLiteralExpr(singlePrefix) + `) &&
  !normalized.startsWith(` + tsStringLiteralExpr(doublePrefix) + `)
) {
  normalized = ` + tsStringLiteralExpr(doublePrefix) + ` + normalized.slice(` + tsStringLiteralExpr(singlePrefix) + `.length);
}
if (!trimmed.startsWith("mcp__") && normalized.toLowerCase() === "question") {
  return ` + askUserQuestionToolName + `;
}
return normalized;`
}
