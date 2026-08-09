export function createQuestionIdMapper() {
  const questionIdByToolCallId = new Map();
  const questionListByToolCallId = new Map();
  const questionListByQuestionId = new Map();

  function normalizeString(value) {
    if (typeof value !== "string") {
      return "";
    }
    return value.trim();
  }

  function normalizeId(value) {
    const normalized = normalizeString(value);
    return normalized ? normalized : null;
  }

  function recordQuestionMapping(event) {
    if (!event || typeof event !== "object") {
      return;
    }
    const typeValue = normalizeString(event.type).toLowerCase();
    if (!typeValue.startsWith("question")) {
      return;
    }
    const properties =
      event.properties && typeof event.properties === "object"
        ? event.properties
        : null;
    if (!properties) {
      return;
    }
    const questionId =
      normalizeId(properties.id) ||
      normalizeId(properties.questionId) ||
      normalizeId(properties.questionID) ||
      normalizeId(event.id);
    const tool =
      properties.tool && typeof properties.tool === "object"
        ? properties.tool
        : null;
    const toolCallId =
      normalizeId(tool ? tool.callID : null) ||
      normalizeId(tool ? tool.callId : null) ||
      normalizeId(tool ? tool.call_id : null) ||
      normalizeId(properties.callID) ||
      normalizeId(properties.callId) ||
      normalizeId(properties.call_id) ||
      normalizeId(event.toolCallId) ||
      normalizeId(event.tool_call_id);
    if (!questionId || !toolCallId) {
      return;
    }
    questionIdByToolCallId.set(toolCallId, questionId);
    const questions = Array.isArray(properties.questions) ? properties.questions : null;
    if (questions) {
      const ordered = questions
        .map((entry) => (entry && typeof entry.question === "string" ? entry.question : ""))
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      if (ordered.length > 0) {
        questionListByToolCallId.set(toolCallId, ordered);
        questionListByQuestionId.set(questionId, ordered);
      }
    }
  }

  function resolveQuestionId(payload) {
    if (!payload || typeof payload !== "object") {
      return null;
    }
    const directQuestionId =
      normalizeId(payload.questionId) || normalizeId(payload.question_id);
    if (directQuestionId) {
      return directQuestionId;
    }
    const toolCallId =
      normalizeId(payload.toolCallId) || normalizeId(payload.tool_call_id);
    if (toolCallId) {
      return questionIdByToolCallId.get(toolCallId) ?? toolCallId;
    }
    const fallbackId = normalizeId(payload.id);
    if (fallbackId) {
      return questionIdByToolCallId.get(fallbackId) ?? fallbackId;
    }
    return null;
  }

  function resolveQuestionOrder(payload) {
    if (!payload || typeof payload !== "object") {
      return null;
    }
    const directQuestionId =
      normalizeId(payload.questionId) || normalizeId(payload.question_id);
    if (directQuestionId) {
      return questionListByQuestionId.get(directQuestionId) ?? null;
    }
    const toolCallId =
      normalizeId(payload.toolCallId) || normalizeId(payload.tool_call_id);
    if (toolCallId) {
      return questionListByToolCallId.get(toolCallId) ?? null;
    }
    const fallbackId = normalizeId(payload.id);
    if (fallbackId) {
      return (
        questionListByToolCallId.get(fallbackId) ??
        questionListByQuestionId.get(fallbackId) ??
        null
      );
    }
    return null;
  }

  return {
    recordQuestionMapping,
    resolveQuestionId,
    resolveQuestionOrder,
  };
}
