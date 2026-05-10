type StreamingMarkdownSegments = {
  committedMarkdown: string;
  activeTailText: string;
  committedLineCount: number;
};

export type AnimatedStreamingCharacter = {
  id: number;
  value: string;
  animate: boolean;
};

function splitIntoCharacters(value: string): string[] {
  return Array.from(value);
}

export function splitStreamingMarkdownText(
  value: string,
): StreamingMarkdownSegments {
  const normalizedValue = value || "";
  const lastNewlineIndex = normalizedValue.lastIndexOf("\n");
  if (lastNewlineIndex < 0) {
    return {
      committedMarkdown: "",
      activeTailText: normalizedValue,
      committedLineCount: 0,
    };
  }
  const committedMarkdown = normalizedValue.slice(0, lastNewlineIndex + 1);
  const activeTailText = normalizedValue.slice(lastNewlineIndex + 1);
  const committedLineCount =
    committedMarkdown.length > 0
      ? committedMarkdown.split(/\r?\n/u).length - 1
      : 0;
  return {
    committedMarkdown,
    activeTailText,
    committedLineCount,
  };
}

export function reconcileAnimatedStreamingCharacters(
  previousCharacters: Array<Pick<AnimatedStreamingCharacter, "id" | "value">>,
  nextText: string,
  nextId: number,
): { characters: AnimatedStreamingCharacter[]; nextId: number } {
  const normalizedNextText = nextText || "";
  const previousText = previousCharacters
    .map((character) => character.value)
    .join("");
  if (
    normalizedNextText.length < previousText.length ||
    !normalizedNextText.startsWith(previousText)
  ) {
    return {
      characters: splitIntoCharacters(normalizedNextText).map((value) => ({
        id: nextId++,
        value,
        animate: false,
      })),
      nextId,
    };
  }
  const appendedCharacters = splitIntoCharacters(
    normalizedNextText.slice(previousText.length),
  );
  return {
    characters: [
      ...previousCharacters.map((character) => ({
        ...character,
        animate: false,
      })),
      ...appendedCharacters.map((value) => ({
        id: nextId++,
        value,
        animate: true,
      })),
    ],
    nextId,
  };
}
