package narration

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
	"unicode"
	"unicode/utf8"

	"setta/internal/conversation"
	"setta/internal/jsonio"
)

const (
	MaxNarratorMilestonesPerCall         = 3
	MaxNarratorMilestoneCharacters       = 240
	MaxNarratorCurrentFocusCharacters    = 320
	MaxNarratorFinalSummaryCharacters    = 1200
	MaxNarratorStatusReplyCharacters     = 1200
	MaxNarratorTopicDescriptorCharacters = 320
)

type CallOutputKind string

const (
	CallOutputWorkingProjection  CallOutputKind = "working_projection"
	CallOutputTerminalProjection CallOutputKind = "terminal_projection"
	CallOutputStatusReply        CallOutputKind = "status_reply"
)

type WorkingProjectionOutput struct {
	ObservedThroughSequence int      `json:"observedThroughSequence"`
	CurrentFocus            string   `json:"currentFocus"`
	Milestones              []string `json:"milestones"`
	TopicDescriptor         *string  `json:"topicDescriptor"`
}

type TerminalProjectionOutput struct {
	ObservedThroughSequence int      `json:"observedThroughSequence"`
	CurrentFocus            string   `json:"currentFocus"`
	Milestones              []string `json:"milestones"`
	FinalSummary            string   `json:"finalSummary"`
	TopicDescriptor         *string  `json:"topicDescriptor"`
}

type StatusReplyOutput struct {
	SourceThroughSequence int    `json:"sourceThroughSequence"`
	StatusReply           string `json:"statusReply"`
}

// NarratorCallOutput is the strict output union for user-visible narrator
// calls. Exactly one branch is present, and each provider call receives only
// the schema for the branch selected by its typed context.
type NarratorCallOutput struct {
	Kind               CallOutputKind
	WorkingProjection  *WorkingProjectionOutput
	TerminalProjection *TerminalProjectionOutput
	StatusReply        *StatusReplyOutput
}

type workingProjectionWireOutput struct {
	Kind                    CallOutputKind  `json:"kind"`
	ObservedThroughSequence int             `json:"observedThroughSequence"`
	CurrentFocus            string          `json:"currentFocus"`
	Milestones              []string        `json:"milestones"`
	TopicDescriptor         json.RawMessage `json:"topicDescriptor"`
}

type terminalProjectionWireOutput struct {
	Kind                    CallOutputKind  `json:"kind"`
	ObservedThroughSequence int             `json:"observedThroughSequence"`
	CurrentFocus            string          `json:"currentFocus"`
	Milestones              []string        `json:"milestones"`
	FinalSummary            string          `json:"finalSummary"`
	TopicDescriptor         json.RawMessage `json:"topicDescriptor"`
}

type statusReplyWireOutput struct {
	Kind                  CallOutputKind `json:"kind"`
	SourceThroughSequence *int           `json:"sourceThroughSequence"`
	StatusReply           string         `json:"statusReply"`
}

func decodeProjectionOutput(
	raw json.RawMessage,
	context ProjectionContextBundle,
) (NarratorCallOutput, error) {
	switch context.RequestedChannel {
	case ProjectionChannelWorking:
		var wire workingProjectionWireOutput
		if err := jsonio.DecodeSingle(bytes.NewReader(raw), &wire); err != nil {
			return NarratorCallOutput{}, fmt.Errorf("decode working narrator projection: %w", err)
		}
		topicDescriptor, err := decodeRequiredNullableString(wire.TopicDescriptor, "working projection topicDescriptor")
		if err != nil {
			return NarratorCallOutput{}, err
		}
		output := NarratorCallOutput{
			Kind: CallOutputWorkingProjection,
			WorkingProjection: &WorkingProjectionOutput{
				ObservedThroughSequence: wire.ObservedThroughSequence,
				CurrentFocus:            wire.CurrentFocus,
				Milestones:              wire.Milestones,
				TopicDescriptor:         topicDescriptor,
			},
		}
		if wire.Kind != output.Kind {
			return NarratorCallOutput{}, fmt.Errorf("working narrator projection has kind %q", wire.Kind)
		}
		return output, output.ValidateProjection(context)
	case ProjectionChannelTerminal:
		var wire terminalProjectionWireOutput
		if err := jsonio.DecodeSingle(bytes.NewReader(raw), &wire); err != nil {
			return NarratorCallOutput{}, fmt.Errorf("decode terminal narrator projection: %w", err)
		}
		topicDescriptor, err := decodeRequiredNullableString(wire.TopicDescriptor, "terminal projection topicDescriptor")
		if err != nil {
			return NarratorCallOutput{}, err
		}
		output := NarratorCallOutput{
			Kind: CallOutputTerminalProjection,
			TerminalProjection: &TerminalProjectionOutput{
				ObservedThroughSequence: wire.ObservedThroughSequence,
				CurrentFocus:            wire.CurrentFocus,
				Milestones:              wire.Milestones,
				FinalSummary:            wire.FinalSummary,
				TopicDescriptor:         topicDescriptor,
			},
		}
		if wire.Kind != output.Kind {
			return NarratorCallOutput{}, fmt.Errorf("terminal narrator projection has kind %q", wire.Kind)
		}
		return output, output.ValidateProjection(context)
	default:
		return NarratorCallOutput{}, fmt.Errorf("narrator projection requested unsupported channel %q", context.RequestedChannel)
	}
}

func decodeStatusOutput(raw json.RawMessage, context StatusContextBundle) (NarratorCallOutput, error) {
	var wire statusReplyWireOutput
	if err := jsonio.DecodeSingle(bytes.NewReader(raw), &wire); err != nil {
		return NarratorCallOutput{}, fmt.Errorf("decode narrator status reply: %w", err)
	}
	if wire.SourceThroughSequence == nil {
		return NarratorCallOutput{}, fmt.Errorf("narrator status sourceThroughSequence is required")
	}
	output := NarratorCallOutput{
		Kind: CallOutputStatusReply,
		StatusReply: &StatusReplyOutput{
			SourceThroughSequence: *wire.SourceThroughSequence,
			StatusReply:           wire.StatusReply,
		},
	}
	if wire.Kind != output.Kind {
		return NarratorCallOutput{}, fmt.Errorf("narrator status reply has kind %q", wire.Kind)
	}
	return output, output.ValidateStatus(context)
}

func decodeCheckpointOutput(raw json.RawMessage, context CheckpointContextBundle) (CheckpointOutput, error) {
	var output CheckpointOutput
	if err := jsonio.DecodeSingle(bytes.NewReader(raw), &output); err != nil {
		return CheckpointOutput{}, fmt.Errorf("decode narrator checkpoint output: %w", err)
	}
	return output, output.Validate(context)
}

func (output NarratorCallOutput) ValidateProjection(context ProjectionContextBundle) error {
	if err := validateProjectionOutputEnvelope(output, context); err != nil {
		return err
	}
	switch output.Kind {
	case CallOutputWorkingProjection:
		return validateWorkingProjectionOutput(*output.WorkingProjection, context)
	case CallOutputTerminalProjection:
		return validateTerminalProjectionOutput(*output.TerminalProjection, context)
	default:
		return fmt.Errorf("narrator projection output has kind %q", output.Kind)
	}
}

func validateProjectionOutputEnvelope(
	output NarratorCallOutput,
	context ProjectionContextBundle,
) error {
	if context.Kind != ContextKindProjection {
		return fmt.Errorf("narrator projection output received context kind %q", context.Kind)
	}
	if !isProjectionTrigger(context.Trigger) {
		return fmt.Errorf("narrator projection output received trigger %q", context.Trigger)
	}
	return output.validateBranch()
}

func validateWorkingProjectionOutput(
	projection WorkingProjectionOutput,
	context ProjectionContextBundle,
) error {
	if context.RequestedChannel != ProjectionChannelWorking {
		return fmt.Errorf("working narrator output received requested channel %q", context.RequestedChannel)
	}
	if err := context.ValidateObservedAdvance(projection.ObservedThroughSequence); err != nil {
		return err
	}
	return validateProjectionText(
		projection.CurrentFocus,
		projection.Milestones,
		projection.TopicDescriptor,
		context.PriorMilestones,
	)
}

func validateTerminalProjectionOutput(
	projection TerminalProjectionOutput,
	context ProjectionContextBundle,
) error {
	if context.RequestedChannel != ProjectionChannelTerminal || context.Trigger != conversation.NarrationTriggerTurnTerminal {
		return fmt.Errorf("terminal narrator output requires terminal projection context")
	}
	if err := context.ValidateObservedAdvance(projection.ObservedThroughSequence); err != nil {
		return err
	}
	if projection.ObservedThroughSequence != context.EvaluationRange.End {
		return fmt.Errorf(
			"terminal narrator projection must observe terminal boundary %d, got %d",
			context.EvaluationRange.End,
			projection.ObservedThroughSequence,
		)
	}
	if err := validateProjectionText(
		projection.CurrentFocus,
		projection.Milestones,
		projection.TopicDescriptor,
		context.PriorMilestones,
	); err != nil {
		return err
	}
	return validateBoundedNarratorText(
		"narrator final summary",
		projection.FinalSummary,
		MaxNarratorFinalSummaryCharacters,
	)
}

func (output NarratorCallOutput) ValidateStatus(context StatusContextBundle) error {
	if context.Kind != ContextKindStatus || context.Trigger != conversation.NarrationTriggerExplicitStatusRequested {
		return fmt.Errorf("narrator status output requires explicit-status context")
	}
	if err := output.validateBranch(); err != nil {
		return err
	}
	if output.Kind != CallOutputStatusReply {
		return fmt.Errorf("narrator status output has kind %q", output.Kind)
	}
	if output.StatusReply.SourceThroughSequence != context.SourceThroughSequence {
		return fmt.Errorf(
			"narrator status source sequence %d must equal supplied source %d",
			output.StatusReply.SourceThroughSequence,
			context.SourceThroughSequence,
		)
	}
	return validateBoundedNarratorText(
		"narrator status reply",
		output.StatusReply.StatusReply,
		MaxNarratorStatusReplyCharacters,
	)
}

func (output NarratorCallOutput) validateBranch() error {
	branches := 0
	for _, present := range []bool{
		output.WorkingProjection != nil,
		output.TerminalProjection != nil,
		output.StatusReply != nil,
	} {
		if present {
			branches++
		}
	}
	if branches != 1 {
		return fmt.Errorf("narrator call output has %d branches, want exactly one", branches)
	}
	switch output.Kind {
	case CallOutputWorkingProjection:
		if output.WorkingProjection == nil {
			return fmt.Errorf("working narrator output requires working projection branch")
		}
	case CallOutputTerminalProjection:
		if output.TerminalProjection == nil {
			return fmt.Errorf("terminal narrator output requires terminal projection branch")
		}
	case CallOutputStatusReply:
		if output.StatusReply == nil {
			return fmt.Errorf("narrator status output requires status reply branch")
		}
	default:
		return fmt.Errorf("narrator call output has unsupported kind %q", output.Kind)
	}
	return nil
}

func validateProjectionText(
	currentFocus string,
	milestones []string,
	topicDescriptor *string,
	priorMilestones []PriorMilestone,
) error {
	if err := validateBoundedNarratorText(
		"narrator current focus",
		currentFocus,
		MaxNarratorCurrentFocusCharacters,
	); err != nil {
		return err
	}
	if milestones == nil {
		return fmt.Errorf("narrator milestones must be an array, not null or omitted")
	}
	if len(milestones) > MaxNarratorMilestonesPerCall {
		return fmt.Errorf("narrator projection emitted %d milestones, maximum is %d", len(milestones), MaxNarratorMilestonesPerCall)
	}
	seen := map[string]bool{}
	for index, milestone := range milestones {
		if err := validateBoundedNarratorText(
			fmt.Sprintf("narrator milestone %d", index),
			milestone,
			MaxNarratorMilestoneCharacters,
		); err != nil {
			return err
		}
		if seen[milestone] {
			return fmt.Errorf("narrator projection repeated milestone %q within one call", milestone)
		}
		seen[milestone] = true
		for _, prior := range priorMilestones {
			if milestone == prior.Text {
				return fmt.Errorf("narrator projection repeated prior active-turn milestone %q", milestone)
			}
		}
	}
	if topicDescriptor != nil {
		return validateBoundedNarratorText(
			"narrator topic descriptor",
			*topicDescriptor,
			MaxNarratorTopicDescriptorCharacters,
		)
	}
	return nil
}

func validateBoundedNarratorText(label string, value string, maximumCharacters int) error {
	if value == "" || strings.TrimSpace(value) != value {
		return fmt.Errorf("%s must be non-empty without surrounding whitespace", label)
	}
	if !utf8.ValidString(value) {
		return fmt.Errorf("%s must be valid UTF-8", label)
	}
	if utf8.RuneCountInString(value) > maximumCharacters {
		return fmt.Errorf("%s exceeds %d characters", label, maximumCharacters)
	}
	for _, character := range value {
		if unicode.IsControl(character) {
			return fmt.Errorf("%s must not contain control characters", label)
		}
	}
	return nil
}

func decodeRequiredNullableString(raw json.RawMessage, label string) (*string, error) {
	if len(raw) == 0 {
		return nil, fmt.Errorf("%s is required", label)
	}
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return nil, nil
	}
	var value string
	if err := jsonio.DecodeSingle(bytes.NewReader(raw), &value); err != nil {
		return nil, fmt.Errorf("decode %s: %w", label, err)
	}
	return &value, nil
}
