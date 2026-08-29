import { PYTHON_KEYWORDS_V2 } from "../backend/generatedContract";

const pythonKeywords: ReadonlySet<string> = new Set(PYTHON_KEYWORDS_V2);

const pythonIdentifierPattern = /^[\p{L}_][\p{L}\p{Nd}_]*$/u;

type ParameterNameRow = {
  data: { name: string; nameEditable: boolean };
  id: string;
};

export function parameterNameErrors(
  rows: ReadonlyArray<ParameterNameRow>,
): Record<string, string> {
  const claims = new Map<string, number>();
  for (const row of rows) {
    const name = row.data.name.trim();
    if (name !== "") {
      claims.set(name, (claims.get(name) ?? 0) + 1);
    }
  }

  const errors: Record<string, string> = {};
  for (const row of rows) {
    if (!row.data.nameEditable) {
      continue;
    }
    const message = parameterNameError(row.data.name, claims);
    if (message !== null) {
      errors[row.id] = message;
    }
  }
  return errors;
}

export function hasBlockingParameterName(
  rows: ReadonlyArray<ParameterNameRow>,
): boolean {
  return Object.keys(parameterNameErrors(rows)).length > 0;
}

function parameterNameError(
  proposedName: string,
  claims: ReadonlyMap<string, number>,
): string | null {
  const name = proposedName.trim();
  if (name === "") {
    return null;
  }
  if (!pythonIdentifierPattern.test(name)) {
    return "Param name must be a valid Python identifier.";
  }
  if (pythonKeywords.has(name)) {
    return "Param name cannot be a Python keyword.";
  }
  if ((claims.get(name) ?? 0) > 1) {
    return `Param name "${name}" already exists under this parent.`;
  }
  return null;
}
