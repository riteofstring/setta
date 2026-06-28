import type {
  ChatCommandExecuteResult,
  ChatModelOption,
  ChatReasoningEffortOption,
} from "@generated/backend";
import { Check, X } from "lucide-react";

import { cn } from "../lib/utils";
import type { ChatStore } from "../stores/chat-store-types";
import {
  type CommandComposerState,
  type CommandSuggestionRow,
} from "./chat-command-composer-controller";
import { modelPickerOptionSelected, reasoningEffortOptionSelected } from "./chat-composer-controls";

interface CommandPaletteProps {
  commandListStatus: ChatStore["commandListStatus"];
  commandListError?: string | null;
  commandListPending?: boolean;
  commandState: CommandComposerState;
  draft: string;
  modelPicker: ChatCommandExecuteResult | null;
  onDismissModelPicker: () => void;
  onPickSuggestion: (suggestion: CommandSuggestionRow) => void;
  onPickModel: (model: ChatModelOption) => void;
  onPickReasoningEffort: (effort: ChatReasoningEffortOption) => void;
  paletteVisible: boolean;
  selectedSuggestionIndex: number;
}

export function CommandPalette(props: CommandPaletteProps) {
  if (props.modelPicker?.result.action === "model_picker") {
    return (
      <ModelPickerPalette
        modelPicker={props.modelPicker}
        onDismissModelPicker={props.onDismissModelPicker}
        onPickModel={props.onPickModel}
        onPickReasoningEffort={props.onPickReasoningEffort}
      />
    );
  }
  if (!isSlashDraft(props.draft) || !props.paletteVisible) {
    return null;
  }
  return <SlashCommandPalette {...props} />;
}

function ModelPickerPalette({
  modelPicker,
  onDismissModelPicker,
  onPickModel,
  onPickReasoningEffort,
}: {
  modelPicker: ChatCommandExecuteResult;
  onDismissModelPicker: () => void;
  onPickModel: (model: ChatModelOption) => void;
  onPickReasoningEffort: (effort: ChatReasoningEffortOption) => void;
}) {
  if (modelPicker?.result.action !== "model_picker") {
    return null;
  }
  const selectedModel = modelPicker.result.selectedModel;
  const selectedReasoningEffort = modelPicker.result.selectedReasoningEffort;
  return (
    <div
      className="absolute bottom-full left-0 z-20 mb-2 max-h-80 w-full overflow-y-auto rounded-sm border border-border bg-popover/95 p-1 text-popover-foreground shadow-xl shadow-black/45 backdrop-blur"
      data-testid="model-picker"
    >
      <div className="mb-1 flex justify-end border-b border-border pb-1">
        <button
          aria-label="Close model picker"
          className="grid h-6 w-6 place-items-center rounded-sm text-muted-foreground hover:bg-accent/75 hover:text-foreground"
          onClick={onDismissModelPicker}
          title="Close model picker"
          type="button"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="px-2 pt-1 pb-1 text-[11px] font-medium text-muted-foreground">Model</div>
      {modelPicker.result.models.map((model) => {
        const selected = modelPickerOptionSelected(model, selectedModel);
        return (
          <button
            aria-current={selected ? "true" : undefined}
            className={cn(
              "flex w-full min-w-0 items-center gap-2 rounded-sm px-2 py-2 text-left text-xs hover:bg-accent/75",
              selected && "bg-accent/70",
            )}
            data-selected={selected ? "true" : undefined}
            key={model.id}
            onClick={() => onPickModel(model)}
            type="button"
          >
            <span className="grid h-4 w-4 shrink-0 place-items-center">
              {selected ? <Check className="h-4 w-4 text-status-success" /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-foreground">
                {model.displayName}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {model.model}
              </span>
            </span>
          </button>
        );
      })}
      {modelPicker.result.reasoningEfforts.length > 0 ? (
        <>
          <div className="mt-1 border-t border-border px-2 pt-2 pb-1 text-[11px] font-medium text-muted-foreground">
            Reasoning
          </div>
          {modelPicker.result.reasoningEfforts.map((effort) => {
            const selected = reasoningEffortOptionSelected(effort, selectedReasoningEffort);
            return (
              <button
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "flex w-full min-w-0 items-center gap-2 rounded-sm px-2 py-2 text-left text-xs hover:bg-accent/75",
                  selected && "bg-accent/70",
                )}
                data-reasoning-effort={effort.effort}
                data-reasoning-selected={selected ? "true" : undefined}
                key={effort.effort}
                onClick={() => onPickReasoningEffort(effort)}
                type="button"
              >
                <span className="grid h-4 w-4 shrink-0 place-items-center">
                  {selected ? <Check className="h-4 w-4 text-status-success" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">
                    {effort.displayName}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {effort.description}
                  </span>
                </span>
              </button>
            );
          })}
        </>
      ) : null}
    </div>
  );
}

function SlashCommandPalette({
  commandListStatus,
  commandListError,
  commandListPending,
  commandState,
  onPickSuggestion,
  selectedSuggestionIndex,
}: CommandPaletteProps) {
  if (commandListError) {
    return <SlashCommandErrorPalette commandListError={commandListError} />;
  }
  if (slashCommandPaletteLoading(commandListStatus, commandListPending, commandState)) {
    return <SlashCommandLoadingPalette />;
  }
  if (commandState.invalidReason && commandState.suggestions.length === 0) {
    return <SlashCommandInvalidPalette invalidReason={commandState.invalidReason} />;
  }
  if (commandState.suggestions.length === 0 && commandState.showEmptyState) {
    return (
      <div
        className="absolute bottom-full left-0 z-20 mb-2 w-full rounded-sm border border-border bg-popover/95 p-2 text-xs text-muted-foreground shadow-xl shadow-black/45 backdrop-blur"
        data-testid="command-palette"
        role="listbox"
      >
        No matching slash commands
      </div>
    );
  }
  if (commandState.suggestions.length === 0) {
    return null;
  }
  return (
    <div
      className="absolute bottom-full left-0 z-20 mb-2 w-full rounded-sm border border-border bg-popover/95 p-1 text-popover-foreground shadow-xl shadow-black/45 backdrop-blur"
      data-testid="command-palette"
      role="listbox"
    >
      {commandState.suggestions.map((suggestion, index) => (
        <button
          aria-disabled={!suggestion.available}
          aria-selected={index === selectedSuggestionIndex}
          className={cn(
            "flex w-full min-w-0 items-center justify-between gap-3 rounded-sm px-2 py-2 text-left text-xs hover:bg-accent/75 disabled:cursor-not-allowed disabled:opacity-65",
            index === selectedSuggestionIndex && "bg-accent/80",
          )}
          disabled={!suggestion.available}
          key={suggestion.id}
          onClick={() => onPickSuggestion(suggestion)}
          role="option"
          type="button"
        >
          <span className="min-w-0">
            <span className="block font-medium text-foreground">{suggestion.label}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {suggestion.description}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground/85">
              {suggestion.available ? suggestion.detail : suggestion.disabledReason}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function slashCommandPaletteLoading(
  commandListStatus: ChatStore["commandListStatus"],
  commandListPending: boolean | undefined,
  commandState: CommandComposerState,
) {
  return (
    (commandListPending || commandListStatus === "loading") && commandState.suggestions.length === 0
  );
}

function SlashCommandErrorPalette({ commandListError }: { commandListError: string }) {
  return (
    <div
      className="absolute bottom-full left-0 z-20 mb-2 w-full rounded-sm border border-status-critical/80 bg-popover/95 p-2 text-xs text-popover-foreground shadow-xl shadow-black/45 backdrop-blur"
      data-testid="command-palette"
      role="alert"
    >
      <div className="font-medium text-status-critical">Slash commands unavailable</div>
      <div className="mt-1 break-words text-muted-foreground">{commandListError}</div>
    </div>
  );
}

function SlashCommandLoadingPalette() {
  return (
    <div
      className="absolute bottom-full left-0 z-20 mb-2 w-full rounded-sm border border-border bg-popover/95 p-2 text-xs text-muted-foreground shadow-xl shadow-black/45 backdrop-blur"
      data-testid="command-palette"
      role="status"
    >
      Loading slash commands...
    </div>
  );
}

function SlashCommandInvalidPalette({ invalidReason }: { invalidReason: string }) {
  return (
    <div
      className="absolute bottom-full left-0 z-20 mb-2 w-full rounded-sm border border-status-critical/80 bg-popover/95 p-2 text-xs text-popover-foreground shadow-xl shadow-black/45 backdrop-blur"
      data-testid="command-palette"
      role="alert"
    >
      <div className="font-medium text-status-critical">Invalid slash command</div>
      <div className="mt-1 break-words text-muted-foreground">{invalidReason}</div>
    </div>
  );
}

function isSlashDraft(draft: string) {
  return draft.startsWith("/");
}
