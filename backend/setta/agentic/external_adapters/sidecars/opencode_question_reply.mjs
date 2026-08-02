export function buildQuestionReplyBodies(rawAnswers, questionOrder) {
  const bodies = [];
  const seen = new Set();
  const pushBody = (body) => {
    if (!body || typeof body !== "object") {
      return;
    }
    const key = JSON.stringify(body);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    bodies.push(body);
  };

  const normalizeAnswer = (value) => {
    const items = [];
    const pushItem = (entry) => {
      if (entry == null) {
        return;
      }
      if (Array.isArray(entry)) {
        for (const nested of entry) {
          pushItem(nested);
        }
        return;
      }
      const text = String(entry).trim();
      if (text) {
        items.push(text);
      }
    };
    pushItem(value);
    return items;
  };

  const summarizeAnswers = (answerArrays) =>
    answerArrays
      .map((entry) =>
        Array.isArray(entry) && entry.length > 0 ? entry.join(", ") : "",
      )
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

  if (typeof rawAnswers === "string") {
    const trimmed = rawAnswers.trim();
    if (trimmed) {
      const normalized = normalizeAnswer(trimmed);
      if (normalized.length > 0) {
        pushBody({ answers: [normalized] });
        pushBody({ answer: normalized[0] });
        pushBody({ answers: [normalized[0]] });
      }
    }
    return bodies;
  }
  if (Array.isArray(rawAnswers)) {
    const normalized = rawAnswers.map((entry) => normalizeAnswer(entry));
    const hasAny = normalized.some((entry) => entry.length > 0);
    if (hasAny) {
      pushBody({ answers: normalized });
    }
    const summaries = summarizeAnswers(normalized);
    if (summaries.length === 1) {
      pushBody({ answer: summaries[0] });
      pushBody({ answers: [summaries[0]] });
    }
    if (summaries.length > 0) {
      pushBody({ answers: summaries });
      if (summaries.length > 1) {
        pushBody({ answer: summaries.join("\n") });
      }
    }
    return bodies;
  }
  if (rawAnswers && typeof rawAnswers === "object") {
    const answers = {};
    const normalizedByQuestion = new Map();
    for (const [key, value] of Object.entries(rawAnswers)) {
      const normalized = normalizeAnswer(value);
      if (normalized.length > 0) {
        normalizedByQuestion.set(key, normalized);
        answers[key] =
          normalized.length === 1 ? normalized[0] : normalized.join(", ");
      }
    }
    const values = Object.values(answers);
    const order =
      Array.isArray(questionOrder) && questionOrder.length > 0
        ? questionOrder
        : null;
    if (order) {
      const orderedAnswers = [];
      for (const question of order) {
        orderedAnswers.push(normalizedByQuestion.get(question) ?? []);
      }
      if (orderedAnswers.some((entry) => entry.length > 0)) {
        pushBody({ answers: orderedAnswers });
      }
      const orderedSummaries = summarizeAnswers(orderedAnswers);
      if (orderedSummaries.length > 0) {
        pushBody({ answers: orderedSummaries });
        if (orderedSummaries.length === 1) {
          pushBody({ answer: orderedSummaries[0] });
        } else {
          pushBody({ answer: orderedSummaries.join("\n") });
        }
      }
    }
    const normalizedValues = Array.from(normalizedByQuestion.values());
    if (normalizedValues.length > 0) {
      pushBody({ answers: normalizedValues });
    }
    if (values.length === 1) {
      pushBody({ answer: values[0] });
      pushBody({ answers: [values[0]] });
    }
    if (values.length > 0) {
      pushBody({ answers: answers });
      pushBody({ answers: values });
      if (values.length > 1) {
        pushBody({ answer: values.join("\n") });
      }
    }
  }
  return bodies;
}
