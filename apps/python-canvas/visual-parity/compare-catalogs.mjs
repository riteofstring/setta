import {
  addDifference,
  createDifferenceCollector,
  sameValue,
} from "./comparison-values.mjs";

function sortScenarios(scenarios) {
  return [...scenarios].sort((left, right) => left.id.localeCompare(right.id));
}

function scenariosById(scenarios) {
  return new Map(scenarios.map((scenario) => [scenario.id, scenario]));
}

function compareCatalogEntries(
  baselineEntries,
  candidateEntries,
  label,
  contract,
) {
  const baselineById = new Map(baselineEntries);
  const candidateById = new Map(candidateEntries);
  const missingFromCandidate = [];
  const extraInCandidate = [];
  const changed = [];
  for (const [id, baseline] of baselineEntries) {
    const candidate = candidateById.get(id);
    if (candidate === undefined) {
      missingFromCandidate.push({ baseline, id });
      addDifference(contract, {
        baseline,
        candidate: null,
        field: `${label}.${id}`,
        kind: "missing-from-candidate",
      });
      continue;
    }
    if (!sameValue(baseline, candidate)) {
      changed.push({ baseline, candidate, id });
      addDifference(contract, {
        baseline,
        candidate,
        field: `${label}.${id}`,
        kind: "changed",
      });
    }
  }
  for (const [id, candidate] of candidateEntries) {
    if (baselineById.has(id)) {
      continue;
    }
    extraInCandidate.push({ candidate, id });
    addDifference(contract, {
      baseline: null,
      candidate,
      field: `${label}.${id}`,
      kind: "extra-in-candidate",
    });
  }
  return {
    changed,
    extraInCandidate,
    missingFromCandidate,
  };
}

function groupUnsupportedScenarios(scenarios) {
  const grouped = new Map();
  for (const scenario of sortScenarios(scenarios)) {
    const group = grouped.get(scenario.fixture) ?? [];
    group.push(scenario);
    grouped.set(scenario.fixture, group);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([fixture, fixtureScenarios]) => ({
      fixture,
      scenarios: fixtureScenarios,
    }));
}

export function compareCatalogs(baseline, candidate) {
  const contract = createDifferenceCollector();
  const baselineFixtures = Object.entries(baseline.manifest.fixtures).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  const candidateFixtures = Object.entries(candidate.manifest.fixtures).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  const fixtures = compareCatalogEntries(
    baselineFixtures,
    candidateFixtures,
    "fixtures",
    contract,
  );
  const baselineScenarios = sortScenarios(baseline.manifest.scenarios);
  const candidateScenarios = sortScenarios(candidate.manifest.scenarios);
  const scenarios = compareCatalogEntries(
    baselineScenarios.map((scenario) => [scenario.id, scenario]),
    candidateScenarios.map((scenario) => [scenario.id, scenario]),
    "scenarios",
    contract,
  );
  if (
    baseline.receipt.referenceRevision !== candidate.receipt.referenceRevision
  ) {
    addDifference(contract, {
      baseline: baseline.receipt.referenceRevision,
      candidate: candidate.receipt.referenceRevision,
      field: "receipt.referenceRevision",
      kind: "changed",
    });
  }
  const baselineCapturable = baselineScenarios.filter(
    (scenario) => scenario.availability === "capturable",
  );
  const candidateCapturable = candidateScenarios.filter(
    (scenario) => scenario.availability === "capturable",
  );
  const baselineUnsupported = baselineScenarios.filter(
    (scenario) => scenario.availability !== "capturable",
  );
  const candidateUnsupported = candidateScenarios.filter(
    (scenario) => scenario.availability !== "capturable",
  );
  const baselineCapturableById = scenariosById(baselineCapturable);
  const candidateCapturableById = scenariosById(candidateCapturable);
  const baselineUnsupportedById = scenariosById(baselineUnsupported);
  const candidateUnsupportedById = scenariosById(candidateUnsupported);
  const missingCapturableFromCandidate = baselineCapturable.filter(
    (scenario) => !candidateCapturableById.has(scenario.id),
  );
  const extraCapturableInCandidate = candidateCapturable.filter(
    (scenario) => !baselineCapturableById.has(scenario.id),
  );
  const missingUnsupportedFromCandidate = baselineUnsupported.filter(
    (scenario) => !candidateUnsupportedById.has(scenario.id),
  );
  const extraUnsupportedInCandidate = candidateUnsupported.filter(
    (scenario) => !baselineUnsupportedById.has(scenario.id),
  );
  const comparedCapturableScenarioIds = baselineCapturable
    .filter((scenario) => candidateCapturableById.has(scenario.id))
    .map((scenario) => scenario.id);
  return {
    contract: {
      differenceCount: contract.count,
      differences: contract.differences,
      passed: contract.count === 0,
    },
    fixtures,
    scenarios: {
      baselineCapturable,
      baselineUnsupported,
      candidateCapturable,
      candidateUnsupported,
      changed: scenarios.changed,
      comparedCapturableScenarioIds,
      extraCapturableInCandidate,
      extraInCandidate: scenarios.extraInCandidate,
      extraUnsupportedInCandidate,
      missingCapturableFromCandidate,
      missingFromCandidate: scenarios.missingFromCandidate,
      missingUnsupportedFromCandidate,
    },
    unsupportedByFixture: {
      baseline: groupUnsupportedScenarios(baselineUnsupported),
      candidate: groupUnsupportedScenarios(candidateUnsupported),
      extraInCandidate: groupUnsupportedScenarios(extraUnsupportedInCandidate),
      missingFromCandidate: groupUnsupportedScenarios(
        missingUnsupportedFromCandidate,
      ),
    },
  };
}
