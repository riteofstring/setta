export function assertApprovalDeniedNow(surface, label) {
  assertNowHighlights(surface, label, {
    absentTitles: ["Needs approval"],
    requiredTitles: ["Approval denied", "Complete"],
  });
}

export function assertApprovalResolvedNow(surface, label, { artifactReady = false } = {}) {
  assertNowHighlights(surface, label, {
    absentTitles: ["Needs approval"],
    requiredTitles: [...artifactTitle(artifactReady), "Answer received", "Complete"],
  });
}

export function assertApprovalRequestedNow(surface, label, { artifactReady = false } = {}) {
  assertNowHighlights(surface, label, {
    exactlyOnceTitles: ["Needs approval"],
    requiredTitles: [...artifactTitle(artifactReady), "Needs approval"],
  });
}

export function assertWorkingNow(surface, label) {
  assertNowHighlights(surface, label, {
    absentTitles: ["Needs approval"],
    requiredTitles: ["Working"],
  });
}

function artifactTitle(include) {
  return include ? ["File ready"] : [];
}

function assertNowHighlights(
  surface,
  label,
  { absentTitles = [], exactlyOnceTitles = [], requiredTitles = [] },
) {
  const highlights = Array.isArray(surface.highlights) ? surface.highlights : [];
  const titles = highlights.map((highlight) => highlight.title);
  const missing = requiredTitles.filter((title) => !titles.includes(title));
  const unexpected = absentTitles.filter((title) => titles.includes(title));
  const wrongCounts = exactlyOnceTitles.filter(
    (title) => titles.filter((candidate) => candidate === title).length !== 1,
  );
  const narratorWindowLanguage = highlights.find((highlight) =>
    /\b(narrator|provider|sequence|visible in this (?:span|window)|span)\b/i.test(
      `${highlight.title} ${highlight.body}`,
    ),
  );
  if (missing.length > 0 || unexpected.length > 0 || wrongCounts.length > 0) {
    throw new Error(
      `${label} NOW highlights drifted: ${JSON.stringify({
        highlights,
        missing,
        unexpected,
        wrongCounts,
        surface,
      })}`,
    );
  }
  if (narratorWindowLanguage) {
    throw new Error(
      `${label} NOW highlight used narrator/window language: ${JSON.stringify({
        highlight: narratorWindowLanguage,
        highlights,
      })}`,
    );
  }
}
