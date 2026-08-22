import { PYTHON_KEYWORDS_V1 } from "../backend/generatedContract";

// Main's parameter-name rules for a kwarg in a project that generates Python:
// `validateParamNameInput` for the name on its own and `getParamNameDuplicateError` for the name
// among its siblings. They live here because the row that shows the error and the controller that
// refuses to propose the list both need the same answer, and because a name the store would
// refuse must never be sent: the reference keeps what someone is typing and reports the problem
// beside the row, rather than restoring the whole list underneath them.
//
// An app-authored record may stay blank while it is being written, exactly as main's new kwarg
// does. A present name has to be a name Python can take as a keyword argument, and no two records
// under this callable may claim the same one.

const pythonKeywords: ReadonlySet<string> = new Set(PYTHON_KEYWORDS_V1);

// The store's own `isPythonIdentifier`: a letter or underscore, then letters, digits, or
// underscores. Go's `unicode.IsLetter` and `unicode.IsDigit` are the `L` and `Nd` categories.
const pythonIdentifierPattern = /^[\p{L}_][\p{L}\p{Nd}_]*$/u;

type ParameterNameRow = {
  data: { name: string; nameEditable: boolean };
  id: string;
};

// The message each app-authored row should show, keyed by parameter ID. A row with nothing wrong
// with its name, and every row whose name belongs to the resolved signature, is absent.
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

// Whether this list carries a name the store would refuse. The mutation is the whole ordered
// candidate, so one unusable name holds the whole proposal back until it is usable.
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
