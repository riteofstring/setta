import { type LLMModelSelection } from "utils/generatedTypes";

export function encodeModelSelectionKey(
  selection: LLMModelSelection,
): string {
  return JSON.stringify(selection);
}

export function decodeModelSelectionKey(
  selectionKey: string | null | undefined,
): LLMModelSelection | null {
  if (!selectionKey) {
    return null;
  }

  const parsed = JSON.parse(selectionKey) as Partial<LLMModelSelection>;
  const { providerId, modelId } = parsed;

  if (typeof providerId !== "string" || typeof modelId !== "string") {
    throw new Error("Invalid LLM model selection key");
  }

  return { providerId, modelId };
}
