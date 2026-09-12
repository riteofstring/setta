const SCROLL_GEOMETRY_FIELDS = new Set([
  "clientHeight",
  "scrollHeight",
  "scrollTop",
]);
const VIEWPORT_GEOMETRY_FIELDS = new Set([
  "documentHeight",
  "documentWidth",
  "height",
  "width",
]);
const VIEWPORT_MATRIX_FIELDS = new Set(["x", "y", "zoom"]);

function isPlainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sameArrays(left, right) {
  return (
    left.length === right.length &&
    left.every((entry, index) => sameValue(entry, right[index]))
  );
}

function sameRecords(left, right) {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    sameValue(leftKeys, rightKeys) &&
    leftKeys.every((key) => sameValue(left[key], right[key]))
  );
}

export function sameValue(left, right) {
  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left)) {
    return Array.isArray(right) && sameArrays(left, right);
  }
  if (Array.isArray(right)) {
    return false;
  }
  if (isPlainRecord(left) && isPlainRecord(right)) {
    return sameRecords(left, right);
  }
  return false;
}

export function createDifferenceCollector() {
  return { count: 0, differences: [] };
}

export function addDifference(collector, difference) {
  collector.count += 1;
  collector.differences.push(difference);
}

function terminalPaneGeometry(segments) {
  return segments[0] === "terminal" && segments[1] === "pane";
}

function terminalViewportGeometry(segments) {
  return (
    segments[0] === "terminal" &&
    segments[1] === "viewport" &&
    SCROLL_GEOMETRY_FIELDS.has(segments.at(-1))
  );
}

function editorScrollerGeometry(segments) {
  return (
    segments[0] === "generatedEditor" &&
    segments[1] === "scroller" &&
    SCROLL_GEOMETRY_FIELDS.has(segments.at(-1))
  );
}

function viewportSizeGeometry(segments) {
  return (
    segments[0] === "viewport" && VIEWPORT_GEOMETRY_FIELDS.has(segments.at(-1))
  );
}

function viewportMatrixGeometry(segments) {
  return (
    segments[0] === "viewport" &&
    segments[1] === "matrix" &&
    VIEWPORT_MATRIX_FIELDS.has(segments.at(-1))
  );
}

const GEOMETRY_PATH_MATCHERS = [
  (segments) => segments.includes("rect"),
  terminalPaneGeometry,
  terminalViewportGeometry,
  editorScrollerGeometry,
  viewportSizeGeometry,
  viewportMatrixGeometry,
];

function isGeometryPath(pathSegments) {
  const segments = pathSegments
    .filter((segment) => typeof segment === "string")
    .filter((segment) => segment !== "publicState");
  return GEOMETRY_PATH_MATCHERS.some((matches) => matches(segments));
}

function pathLabel(pathSegments) {
  return pathSegments
    .reduce(
      (label, segment) =>
        typeof segment === "number"
          ? `${label}[${segment}]`
          : `${label}.${segment}`,
      "",
    )
    .slice(1);
}

function nestedComparisonState(state, baseline, candidate, segment) {
  return {
    ...state,
    baseline,
    candidate,
    pathSegments: [...state.pathSegments, segment],
  };
}

function compareNumberValue(state) {
  if (
    typeof state.baseline !== "number" ||
    typeof state.candidate !== "number"
  ) {
    return false;
  }
  const label = pathLabel(state.pathSegments);
  if (isGeometryPath(state.pathSegments)) {
    const difference = Math.abs(state.baseline - state.candidate);
    if (difference > state.tolerance) {
      addDifference(state.geometry, {
        baseline: state.baseline,
        candidate: state.candidate,
        difference,
        path: label,
      });
    }
    return true;
  }
  if (!Object.is(state.baseline, state.candidate)) {
    addDifference(state.contract, {
      baseline: state.baseline,
      candidate: state.candidate,
      field: label,
    });
  }
  return true;
}

function compareArrayValue(state) {
  if (!Array.isArray(state.baseline) || !Array.isArray(state.candidate)) {
    return false;
  }
  const label = pathLabel(state.pathSegments);
  if (state.baseline.length !== state.candidate.length) {
    addDifference(state.contract, {
      baseline: state.baseline.length,
      candidate: state.candidate.length,
      field: `${label}.length`,
    });
    return true;
  }
  for (let index = 0; index < state.baseline.length; index += 1) {
    comparePublicStateValue(
      nestedComparisonState(
        state,
        state.baseline[index],
        state.candidate[index],
        index,
      ),
    );
  }
  return true;
}

function compareRecordValue(state) {
  if (!isPlainRecord(state.baseline) || !isPlainRecord(state.candidate)) {
    return false;
  }
  const baselineKeys = Object.keys(state.baseline).sort();
  const candidateKeys = Object.keys(state.candidate).sort();
  const label = pathLabel(state.pathSegments);
  if (!sameValue(baselineKeys, candidateKeys)) {
    addDifference(state.contract, {
      baseline: baselineKeys,
      candidate: candidateKeys,
      field: `${label}.keys`,
    });
    return true;
  }
  for (const key of baselineKeys) {
    comparePublicStateValue(
      nestedComparisonState(
        state,
        state.baseline[key],
        state.candidate[key],
        key,
      ),
    );
  }
  return true;
}

const VALUE_COMPARATORS = [
  compareNumberValue,
  compareArrayValue,
  compareRecordValue,
];

function addUnmatchedValueDifference(state) {
  const label = pathLabel(state.pathSegments);
  if (isGeometryPath(state.pathSegments)) {
    addDifference(state.geometry, {
      baseline: state.baseline,
      candidate: state.candidate,
      difference: null,
      field: label,
      path: label,
    });
    return;
  }
  addDifference(state.contract, {
    baseline: state.baseline,
    candidate: state.candidate,
    field: label,
  });
}

function comparePublicStateValue(state) {
  for (const comparator of VALUE_COMPARATORS) {
    if (comparator(state)) {
      return;
    }
  }
  if (!Object.is(state.baseline, state.candidate)) {
    addUnmatchedValueDifference(state);
  }
}

export function comparePublicState(baseline, candidate, tolerance) {
  const contract = createDifferenceCollector();
  const geometry = createDifferenceCollector();
  comparePublicStateValue({
    baseline,
    candidate,
    contract,
    geometry,
    pathSegments: ["publicState"],
    tolerance,
  });
  return {
    contract,
    geometry: {
      ...geometry,
      passed: geometry.count === 0,
      tolerance,
    },
  };
}
