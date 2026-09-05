const NUMBER_PATTERN = /-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi;

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function transformNumbers(value) {
  return [...value.matchAll(NUMBER_PATTERN)].map((match) => Number(match[0]));
}

function transformShape(value) {
  return value.replace(NUMBER_PATTERN, "#");
}

function compareGeometryNumber(state) {
  if (
    typeof state.baseline !== "number" ||
    typeof state.candidate !== "number"
  ) {
    return false;
  }
  const difference = Math.abs(state.baseline - state.candidate);
  if (difference > state.tolerance) {
    state.differences.push({
      baseline: state.baseline,
      candidate: state.candidate,
      difference,
      path: state.pathLabel,
    });
  }
  return true;
}

function isComparableTransform(state) {
  return (
    typeof state.baseline === "string" &&
    typeof state.candidate === "string" &&
    state.pathLabel.endsWith(".style.transform") &&
    transformShape(state.baseline) === transformShape(state.candidate)
  );
}

function nestedGeometryState(state, baseline, candidate, pathLabel) {
  return { ...state, baseline, candidate, pathLabel };
}

function compareGeometryTransform(state) {
  if (!isComparableTransform(state)) {
    return false;
  }
  const baselineNumbers = transformNumbers(state.baseline);
  const candidateNumbers = transformNumbers(state.candidate);
  if (baselineNumbers.length !== candidateNumbers.length) {
    return false;
  }
  for (let index = 0; index < baselineNumbers.length; index += 1) {
    compareGeometryValue(
      nestedGeometryState(
        state,
        baselineNumbers[index],
        candidateNumbers[index],
        `${state.pathLabel}[${index}]`,
      ),
    );
  }
  return true;
}

function compareGeometryArray(state) {
  if (!Array.isArray(state.baseline) || !Array.isArray(state.candidate)) {
    return false;
  }
  if (state.baseline.length !== state.candidate.length) {
    state.differences.push({
      baseline: state.baseline.length,
      candidate: state.candidate.length,
      difference: null,
      path: `${state.pathLabel}.length`,
    });
    return true;
  }
  for (let index = 0; index < state.baseline.length; index += 1) {
    compareGeometryValue(
      nestedGeometryState(
        state,
        state.baseline[index],
        state.candidate[index],
        `${state.pathLabel}[${index}]`,
      ),
    );
  }
  return true;
}

function isPlainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function compareGeometryRecord(state) {
  if (!isPlainRecord(state.baseline) || !isPlainRecord(state.candidate)) {
    return false;
  }
  const baselineKeys = Object.keys(state.baseline).sort();
  const candidateKeys = Object.keys(state.candidate).sort();
  if (!sameValue(baselineKeys, candidateKeys)) {
    state.differences.push({
      baseline: baselineKeys,
      candidate: candidateKeys,
      difference: null,
      path: `${state.pathLabel}.keys`,
    });
    return true;
  }
  for (const key of baselineKeys) {
    compareGeometryValue(
      nestedGeometryState(
        state,
        state.baseline[key],
        state.candidate[key],
        `${state.pathLabel}.${key}`,
      ),
    );
  }
  return true;
}

const GEOMETRY_COMPARATORS = [
  compareGeometryNumber,
  compareGeometryTransform,
  compareGeometryArray,
  compareGeometryRecord,
];

function compareGeometryValue(state) {
  for (const comparator of GEOMETRY_COMPARATORS) {
    if (comparator(state)) {
      return;
    }
  }
  if (state.baseline !== state.candidate) {
    state.differences.push({
      baseline: state.baseline,
      candidate: state.candidate,
      difference: null,
      path: state.pathLabel,
    });
  }
}

export function compareGeometry(baseline, candidate, tolerance) {
  const differences = [];
  compareGeometryValue({
    baseline,
    candidate,
    differences,
    pathLabel: "geometry",
    tolerance,
  });
  return {
    differences,
    passed: differences.length === 0,
    tolerance,
  };
}
