import type {
  ChatCommandArgumentSpec,
  ChatCommandDescriptor,
  ChatCommandFreeTextArgumentSpec,
  ChatCommandLiteralArgumentSpec,
} from "@generated/backend";

import type { ChatStore } from "../stores/chat-store-types";

type CommandComposerPhase = "inactive" | "command_name" | "command_arguments" | "invalid";

type CommandHighlightKind = "plain" | "marker" | "command" | "literal" | "free_text" | "invalid";

interface CommandHighlightSpan {
  end: number;
  kind: CommandHighlightKind;
  start: number;
  text: string;
}

export interface CommandSuggestionRow {
  available: boolean;
  completion: CommandCompletionEdit | null;
  description: string;
  detail: string;
  disabledReason: string;
  id: string;
  label: string;
  type: "command" | "literal";
}

export interface CommandCompletionEdit {
  selectionStart: number;
  selectionEnd: number;
  value: string;
}

export interface CommandComposerState {
  descriptor: ChatCommandDescriptor | null;
  draft: string;
  executable: boolean;
  highlights: CommandHighlightSpan[];
  invalidReason: string | null;
  phase: CommandComposerPhase;
  showEmptyState: boolean;
  suggestions: CommandSuggestionRow[];
}

interface TokenRange {
  end: number;
  start: number;
}

interface ParsedCommandDraft {
  argsRange: TokenRange | null;
  commandRange: TokenRange;
  hasArgumentSeparator: boolean;
  markerRange: TokenRange;
  name: string;
}

interface ArgumentToken extends TokenRange {
  text: string;
}

export function commandComposerState(
  draft: string,
  descriptors: ChatCommandDescriptor[],
): CommandComposerState {
  if (!draft.startsWith("/")) {
    return inactiveCommandState(draft);
  }
  const parsed = parseCommandDraft(draft);
  const commandToken = "/" + parsed.name;
  const nameValid = parsed.name === "" || isValidCommandNameToken(parsed.name);
  const commandMatches = nameValid
    ? descriptors.filter((descriptor) => descriptor.name.startsWith(commandToken))
    : [];
  const exactDescriptor =
    descriptors.find((descriptor) => descriptor.name === commandToken) ?? null;
  const baseHighlights = commandBaseHighlights(draft, parsed, exactDescriptor !== null);
  if (!nameValid) {
    return invalidCommandNameState(draft, parsed, baseHighlights);
  }
  if (!parsed.hasArgumentSeparator) {
    return commandNameState(draft, parsed, baseHighlights, commandMatches, exactDescriptor);
  }
  if (!exactDescriptor) {
    return unknownCommandState(draft, parsed, baseHighlights, commandMatches);
  }
  return commandArgumentState(draft, parsed, exactDescriptor, baseHighlights);
}

export function completionForCommandState(
  state: CommandComposerState,
  selectedIndex: number,
): CommandCompletionEdit | null {
  const row = selectedSuggestion(state, selectedIndex);
  return row?.available ? row.completion : null;
}

export function commandTextToExecuteFromState(
  state: CommandComposerState,
  selectedIndex: number,
): string {
  const completion = completionForCommandState(state, selectedIndex);
  return (completion?.value ?? state.draft).trim();
}

export function commandFreeTextArgumentValue(state: CommandComposerState): string | null {
  const context = freeTextArgumentContext(state);
  if (!context || exactLiteralArgumentContext(context)) {
    return null;
  }
  return context.argsText;
}

interface FreeTextArgumentContext {
  argsText: string;
  descriptor: ChatCommandDescriptor;
  firstToken: ArgumentToken;
  remainingText: string;
}

function freeTextArgumentContext(state: CommandComposerState): FreeTextArgumentContext | null {
  if (!state.descriptor || !state.executable) {
    return null;
  }
  const parsed = parseCommandDraft(state.draft);
  if (!parsed.hasArgumentSeparator || !parsed.argsRange) {
    return null;
  }
  const freeText = state.descriptor.grammar.arguments.find(isFreeTextArgumentSpec);
  if (!freeText) {
    return null;
  }
  const argsText = state.draft.slice(parsed.argsRange.start, parsed.argsRange.end).trim();
  if (argsText === "" || [...argsText].length > freeText.maxRunes) {
    return null;
  }
  const firstToken = firstArgumentToken(state.draft, parsed.argsRange);
  return {
    argsText,
    descriptor: state.descriptor,
    firstToken,
    remainingText: state.draft.slice(firstToken.end).trim(),
  };
}

function exactLiteralArgumentContext({
  descriptor,
  firstToken,
  remainingText,
}: FreeTextArgumentContext) {
  return (
    descriptor.grammar.literalMatch === "exact" &&
    remainingText === "" &&
    literalArguments(descriptor.grammar.arguments).some(
      (literal) => literal.token === firstToken.text,
    )
  );
}

function selectedSuggestion(
  state: CommandComposerState,
  selectedIndex: number,
): CommandSuggestionRow | null {
  if (state.suggestions.length === 0) {
    return null;
  }
  const clamped = Math.min(Math.max(selectedIndex, 0), state.suggestions.length - 1);
  return state.suggestions[clamped] ?? null;
}

export function firstAvailableSuggestionIndex(suggestions: CommandSuggestionRow[]) {
  const index = suggestions.findIndex((suggestion) => suggestion.available);
  return index === -1 ? 0 : index;
}

export function commandListErrorForDraft(
  slashDraft: boolean,
  commandListStatus: ChatStore["commandListStatus"],
  commandListError: ChatStore["commandListError"],
) {
  return slashDraft && commandListStatus === "failed" ? commandListError : null;
}

export function commandListPendingForDraft({
  commandListContextKey,
  commandListKey,
  commandListRequestKey,
  commandListStatus,
  slashDraft,
}: {
  commandListContextKey: string;
  commandListKey: string;
  commandListRequestKey: string;
  commandListStatus: ChatStore["commandListStatus"];
  slashDraft: boolean;
}) {
  return (
    slashDraft &&
    commandListContextKey !== "" &&
    commandListKey !== commandListContextKey &&
    (commandListRequestKey === commandListContextKey || commandListStatus !== "failed")
  );
}

function inactiveCommandState(draft: string): CommandComposerState {
  return {
    descriptor: null,
    draft,
    executable: false,
    highlights: [],
    invalidReason: null,
    phase: "inactive",
    showEmptyState: false,
    suggestions: [],
  };
}

function invalidCommandState({
  descriptor,
  draft,
  highlights,
  invalidReason,
  showEmptyState,
  suggestions,
}: {
  descriptor: ChatCommandDescriptor | null;
  draft: string;
  highlights: CommandHighlightSpan[];
  invalidReason: string;
  showEmptyState: boolean;
  suggestions: CommandSuggestionRow[];
}): CommandComposerState {
  return {
    descriptor,
    draft,
    executable: false,
    highlights,
    invalidReason,
    phase: "invalid",
    showEmptyState,
    suggestions,
  };
}

function invalidCommandNameState(
  draft: string,
  parsed: ParsedCommandDraft,
  baseHighlights: CommandHighlightSpan[],
) {
  return invalidCommandState({
    descriptor: null,
    draft,
    highlights: replaceHighlight(baseHighlights, parsed.commandRange, "invalid"),
    invalidReason: "Command names use lowercase letters and hyphens.",
    showEmptyState: false,
    suggestions: [],
  });
}

function commandNameState(
  draft: string,
  parsed: ParsedCommandDraft,
  baseHighlights: CommandHighlightSpan[],
  commandMatches: ChatCommandDescriptor[],
  exactDescriptor: ChatCommandDescriptor | null,
) {
  const suggestions = commandMatches.map((descriptor) =>
    commandSuggestion(descriptor, commandCompletion(draft, parsed, descriptor)),
  );
  if (exactDescriptor) {
    return {
      descriptor: exactDescriptor,
      draft,
      executable: exactDescriptor.available,
      highlights: baseHighlights,
      invalidReason: null,
      phase: "command_name" as const,
      showEmptyState: false,
      suggestions,
    };
  }
  if (commandMatches.length > 0 || parsed.name === "") {
    return {
      descriptor: null,
      draft,
      executable: false,
      highlights: baseHighlights,
      invalidReason: null,
      phase: "command_name" as const,
      showEmptyState: commandMatches.length === 0,
      suggestions,
    };
  }
  return unknownCommandState(draft, parsed, baseHighlights, []);
}

function unknownCommandState(
  draft: string,
  parsed: ParsedCommandDraft,
  baseHighlights: CommandHighlightSpan[],
  commandMatches: ChatCommandDescriptor[],
) {
  const commandToken = "/" + parsed.name;
  return invalidCommandState({
    descriptor: null,
    draft,
    highlights: replaceHighlight(baseHighlights, parsed.commandRange, "invalid"),
    invalidReason: `Unknown slash command: ${commandToken}`,
    showEmptyState: commandMatches.length === 0,
    suggestions: commandMatches.map((descriptor) =>
      commandSuggestion(descriptor, commandCompletion(draft, parsed, descriptor)),
    ),
  });
}

function parseCommandDraft(draft: string): ParsedCommandDraft {
  const markerRange = { start: 0, end: 1 };
  let commandEnd = draft.length;
  let hasArgumentSeparator = false;
  for (let index = 1; index < draft.length; index += 1) {
    if (isCommandWhitespace(draft[index] ?? "")) {
      commandEnd = index;
      hasArgumentSeparator = true;
      break;
    }
  }
  const argsRange = hasArgumentSeparator
    ? { start: firstNonCommandWhitespace(draft, commandEnd), end: draft.length }
    : null;
  return {
    argsRange,
    commandRange: { start: 1, end: commandEnd },
    hasArgumentSeparator,
    markerRange,
    name: draft.slice(1, commandEnd),
  };
}

function commandArgumentState(
  draft: string,
  parsed: ParsedCommandDraft,
  descriptor: ChatCommandDescriptor,
  baseHighlights: CommandHighlightSpan[],
): CommandComposerState {
  const argsRange = parsed.argsRange ?? { start: draft.length, end: draft.length };
  const argsText = draft.slice(argsRange.start, argsRange.end);
  const literals = literalArguments(descriptor.grammar.arguments);
  const freeText = descriptor.grammar.arguments.find(isFreeTextArgumentSpec);
  if (argsText.trim() === "") {
    return emptyArgumentState(draft, descriptor, baseHighlights, literals, argsRange);
  }
  const firstToken = firstArgumentToken(draft, argsRange);
  const remainingText = draft.slice(firstToken.end).trim();
  const exactLiteral = literals.find((literal) => literal.token === firstToken.text);
  const literalMatches = literals.filter((literal) => literal.token.startsWith(firstToken.text));
  if (exactLiteral && remainingText === "") {
    return exactLiteralArgumentState(draft, descriptor, baseHighlights, literalMatches, firstToken);
  }
  if (freeText) {
    return freeTextArgumentState({
      argsRange,
      argsText,
      baseHighlights,
      descriptor,
      draft,
      freeText,
    });
  }
  return invalidArgumentState({
    argsRange,
    baseHighlights,
    descriptor,
    draft,
    firstToken,
    literalMatches,
  });
}

function emptyArgumentState(
  draft: string,
  descriptor: ChatCommandDescriptor,
  baseHighlights: CommandHighlightSpan[],
  literals: ChatCommandLiteralArgument[],
  argsRange: TokenRange,
) {
  return {
    descriptor,
    draft,
    executable: descriptor.available,
    highlights: baseHighlights,
    invalidReason: null,
    phase: "command_arguments" as const,
    showEmptyState: false,
    suggestions: literalSuggestions(draft, descriptor, literals, argsRange),
  };
}

function exactLiteralArgumentState(
  draft: string,
  descriptor: ChatCommandDescriptor,
  baseHighlights: CommandHighlightSpan[],
  literalMatches: ChatCommandLiteralArgument[],
  firstToken: TokenRange,
) {
  return {
    descriptor,
    draft,
    executable: descriptor.available,
    highlights: appendTokenHighlight(baseHighlights, draft, firstToken, "literal"),
    invalidReason: null,
    phase: "command_arguments" as const,
    showEmptyState: false,
    suggestions: literalSuggestions(draft, descriptor, literalMatches, firstToken),
  };
}

function freeTextArgumentState({
  argsRange,
  argsText,
  baseHighlights,
  descriptor,
  draft,
  freeText,
}: {
  argsRange: TokenRange;
  argsText: string;
  baseHighlights: CommandHighlightSpan[];
  descriptor: ChatCommandDescriptor;
  draft: string;
  freeText: ChatCommandFreeTextArgumentSpec;
}) {
  const invalid = [...argsText].length > freeText.maxRunes;
  return {
    descriptor,
    draft,
    executable: descriptor.available && !invalid,
    highlights: appendTokenHighlight(
      baseHighlights,
      draft,
      argsRange,
      invalid ? "invalid" : "free_text",
    ),
    invalidReason: invalid
      ? `${freeText.name} must be ${freeText.maxRunes} characters or fewer.`
      : null,
    phase: invalid ? ("invalid" as const) : ("command_arguments" as const),
    showEmptyState: false,
    suggestions: [],
  };
}

function invalidArgumentState({
  argsRange,
  baseHighlights,
  descriptor,
  draft,
  firstToken,
  literalMatches,
}: {
  argsRange: TokenRange;
  baseHighlights: CommandHighlightSpan[];
  descriptor: ChatCommandDescriptor;
  draft: string;
  firstToken: ArgumentToken;
  literalMatches: ChatCommandLiteralArgument[];
}) {
  return invalidCommandState({
    descriptor,
    draft,
    highlights: appendTokenHighlight(baseHighlights, draft, argsRange, "invalid"),
    invalidReason: `${descriptor.name} does not accept ${firstToken.text}.`,
    showEmptyState: literalMatches.length === 0,
    suggestions: literalSuggestions(draft, descriptor, literalMatches, firstToken),
  });
}

function commandBaseHighlights(
  draft: string,
  parsed: ParsedCommandDraft,
  exactCommand: boolean,
): CommandHighlightSpan[] {
  const spans = [
    highlightSpan(draft, parsed.markerRange, "marker"),
    highlightSpan(draft, parsed.commandRange, exactCommand ? "command" : "plain"),
  ];
  return spans.filter((span) => span.start !== span.end);
}

function commandSuggestion(
  descriptor: ChatCommandDescriptor,
  completion: CommandCompletionEdit,
): CommandSuggestionRow {
  return {
    available: descriptor.available,
    completion,
    description: descriptor.description,
    detail: descriptor.available ? descriptor.grammar.summary : descriptor.unavailableReason,
    disabledReason: descriptor.unavailableReason,
    id: `command:${descriptor.name}`,
    label: descriptor.name,
    type: "command",
  };
}

function commandCompletion(
  draft: string,
  parsed: ParsedCommandDraft,
  descriptor: ChatCommandDescriptor,
): CommandCompletionEdit {
  const value = parsed.hasArgumentSeparator
    ? descriptor.name + draft.slice(parsed.commandRange.end)
    : descriptor.name + " ";
  return {
    selectionEnd: value.length,
    selectionStart: value.length,
    value,
  };
}

function literalSuggestions(
  draft: string,
  descriptor: ChatCommandDescriptor,
  literals: ChatCommandLiteralArgument[],
  range: TokenRange,
): CommandSuggestionRow[] {
  return literals.map((literal) => {
    const value = draft.slice(0, range.start) + literal.token + draft.slice(range.end);
    return {
      available: descriptor.available,
      completion: {
        selectionEnd: value.length,
        selectionStart: value.length,
        value,
      },
      description: literal.description,
      detail: descriptor.grammar.summary,
      disabledReason: descriptor.unavailableReason,
      id: `literal:${descriptor.name}:${literal.token}`,
      label: literal.token,
      type: "literal",
    };
  });
}

interface ChatCommandLiteralArgument {
  description: string;
  token: string;
}

function literalArguments(argumentsSpec: ChatCommandArgumentSpec[]): ChatCommandLiteralArgument[] {
  return argumentsSpec
    .filter(isLiteralArgumentSpec)
    .map((argument) => ({ description: argument.description, token: argument.token }));
}

function isLiteralArgumentSpec(
  argument: ChatCommandArgumentSpec,
): argument is ChatCommandLiteralArgumentSpec {
  return argument.kind === "literal" && "token" in argument;
}

function isFreeTextArgumentSpec(
  argument: ChatCommandArgumentSpec,
): argument is ChatCommandFreeTextArgumentSpec {
  return argument.kind === "free_text" && "maxRunes" in argument;
}

function firstArgumentToken(draft: string, argsRange: TokenRange): ArgumentToken {
  let end = argsRange.start;
  while (end < argsRange.end && !isCommandWhitespace(draft[end] ?? "")) {
    end += 1;
  }
  return {
    end,
    start: argsRange.start,
    text: draft.slice(argsRange.start, end),
  };
}

function appendTokenHighlight(
  spans: CommandHighlightSpan[],
  draft: string,
  range: TokenRange,
  kind: CommandHighlightKind,
) {
  if (range.start === range.end) {
    return spans;
  }
  return [...spans, highlightSpan(draft, range, kind)];
}

function replaceHighlight(
  spans: CommandHighlightSpan[],
  range: TokenRange,
  kind: CommandHighlightKind,
) {
  return spans.map((span) =>
    span.start === range.start && span.end === range.end ? { ...span, kind } : span,
  );
}

function highlightSpan(
  draft: string,
  range: TokenRange,
  kind: CommandHighlightKind,
): CommandHighlightSpan {
  return {
    end: range.end,
    kind,
    start: range.start,
    text: draft.slice(range.start, range.end),
  };
}

function firstNonCommandWhitespace(draft: string, start: number) {
  let index = start;
  while (index < draft.length && isCommandWhitespace(draft[index] ?? "")) {
    index += 1;
  }
  return index;
}

function isCommandWhitespace(value: string) {
  return value === " " || value === "\t" || value === "\r" || value === "\n";
}

function isValidCommandNameToken(value: string) {
  if (value === "") {
    return true;
  }
  let hasLetter = false;
  for (const char of value) {
    if (char >= "a" && char <= "z") {
      hasLetter = true;
      continue;
    }
    if (char === "-") {
      continue;
    }
    return false;
  }
  return hasLetter;
}
