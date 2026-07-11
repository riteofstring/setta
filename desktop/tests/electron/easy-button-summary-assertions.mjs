const durationUnitOrder = new Map([
  ["day", 0],
  ["hour", 1],
  ["minute", 2],
  ["second", 3],
]);

export function assertHumanReadableTerminalSummary(summaryText, status, artifactCount, label) {
  const artifactPhrase = countPhrase(artifactCount);
  let duration;
  switch (status) {
    case "completed": {
      duration = matchDuration(
        summaryText,
        new RegExp(`Done in (.+?) with ${escapeRegExp(artifactPhrase)}\\.$`),
        label,
      );
      break;
    }
    case "stopped": {
      duration = matchDuration(
        summaryText,
        new RegExp(`Stopped after (.+?) with ${escapeRegExp(artifactPhrase)}\\.$`),
        label,
      );
      break;
    }
    case "failed": {
      const preservedArtifacts = preservedArtifactSentence(artifactCount);
      const match = summaryText.match(
        new RegExp(`Failed after (.+?): .+?[.!?] ${escapeRegExp(preservedArtifacts)}$`),
      );
      if (!match) {
        throw new Error(
          `easy-button ${label} failure summary was not speakable: ${JSON.stringify(summaryText)}`,
        );
      }
      duration = match[1];
      break;
    }
    default:
      throw new Error(`unsupported easy-button terminal status ${status}`);
  }
  assertHumanReadableDuration(duration, label);
}

function matchDuration(summaryText, pattern, label) {
  const match = summaryText.match(pattern);
  if (!match) {
    throw new Error(
      `easy-button ${label} summary was not speakable: ${JSON.stringify(summaryText)}`,
    );
  }
  return match[1];
}

function assertHumanReadableDuration(duration, label) {
  if (duration === "less than 1 second") {
    return;
  }
  const tokens = [...duration.matchAll(/([1-9]\d*) (days?|hours?|minutes?|seconds?)/g)];
  if (tokens.length === 0 || tokens.map((token) => token[0]).join(" ") !== duration) {
    throw new Error(`easy-button ${label} duration was not spoken prose: ${duration}`);
  }
  let previousOrder = -1;
  for (const token of tokens) {
    const value = Number.parseInt(token[1], 10);
    const singularUnit = token[2].replace(/s$/, "");
    const order = durationUnitOrder.get(singularUnit);
    if (
      order === undefined ||
      order <= previousOrder ||
      (value === 1) !== (token[2] === singularUnit)
    ) {
      throw new Error(`easy-button ${label} duration grammar was invalid: ${duration}`);
    }
    previousOrder = order;
  }
}

function countPhrase(count) {
  if (count === 0) {
    return "no artifacts";
  }
  if (count === 1) {
    return "1 artifact";
  }
  return `${count} artifacts`;
}

function preservedArtifactSentence(count) {
  if (count === 0) {
    return "No artifacts were preserved.";
  }
  if (count === 1) {
    return "1 artifact was preserved.";
  }
  return `${count} artifacts were preserved.`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
