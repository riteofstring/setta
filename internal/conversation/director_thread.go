package conversation

import (
	"encoding/json"
	"fmt"
	"slices"
)

// The Director's own durable conversation.
//
// The Director is one long-running Codex thread with Setta meta-tools, not a
// workstream. Its history therefore lives here rather than in the conversation
// tables: a workstream conversation is work the user delegated inside a folder,
// and the Director conversation is the command centre the user talks to about
// all of them. Mixing them would put the Director in the workstream navigation
// surface it exists to control.
//
// Setta owns this history rather than the provider, because the provider
// cannot. Codex attaches dynamic tools when a thread starts and does not
// reattach them when one resumes, so a Director thread resumed after a restart
// would come back without the `setta` namespace — a Director that can talk but
// can no longer act. Setta therefore keeps the conversation and re-establishes
// the provider thread from it, which is also what makes the Director's own
// turns durable across a restart.

const (
	// DirectorConversationStreamID is the durable stream the Director's own
	// conversation is appended to. It is a committed-event stream beside the
	// conversations and the Director facts, so the app-scoped commit order is
	// one order over all three and replaying it reproduces the same state.
	DirectorConversationStreamID = "director:conversation"
	// DirectorConversationCommittedKind is the committed-event kind carrying one
	// Director conversation entry. The entry's own kind selects its payload, so
	// the log needs one kind rather than one per entry kind.
	DirectorConversationCommittedKind = "director.conversation.appended"
)

// DirectorThreadRecord binds Setta's durable Director conversation to the
// provider thread currently carrying it. There is exactly one for the app
// profile.
type DirectorThreadRecord struct {
	Provider  Provider `json:"provider"`
	ThreadID  string   `json:"threadId"`
	Model     string   `json:"model"`
	StartedAt string   `json:"startedAt"`
}

// Validate rejects a binding that names no provider thread.
func (record DirectorThreadRecord) Validate() error {
	if record.Provider != ProviderCodex {
		return fmt.Errorf("director thread provider %q is unsupported", record.Provider)
	}
	if err := validateIdentifier("director thread id", record.ThreadID); err != nil {
		return err
	}
	if err := validateIdentifier("director thread model", record.Model); err != nil {
		return err
	}
	_, err := validateTimestamp("director thread started at", record.StartedAt)
	return err
}

// DirectorConversationEntryKind is the catalog of things one Director turn
// produces. Assistant text and tool activity are separate kinds because they
// answer different questions: the text is what the user was told, and the tool
// call and its receipt are what Setta actually did.
type DirectorConversationEntryKind string

const (
	// DirectorConversationUserTurn is what the user said, by text or voice.
	DirectorConversationUserTurn DirectorConversationEntryKind = "user_turn"
	// DirectorConversationAssistantText is the Director's reply.
	DirectorConversationAssistantText DirectorConversationEntryKind = "assistant_text"
	// DirectorConversationToolCall is one Setta meta-tool the Director called.
	DirectorConversationToolCall DirectorConversationEntryKind = "tool_call"
	// DirectorConversationToolReceipt is what that call reported back.
	DirectorConversationToolReceipt DirectorConversationEntryKind = "tool_receipt"
)

var directorConversationEntryKinds = []DirectorConversationEntryKind{
	DirectorConversationUserTurn,
	DirectorConversationAssistantText,
	DirectorConversationToolCall,
	DirectorConversationToolReceipt,
}

// DirectorConversationModel attributes an assistant reply to the provider
// thread that produced it. The Director's words are model-authored, so what
// said them is durable beside them: a reply the app later shows as the
// Director's own interpretation has to be able to say whose interpretation it
// is.
type DirectorConversationModel struct {
	Provider Provider `json:"provider"`
	Model    string   `json:"model"`
	ThreadID string   `json:"threadId"`
}

// Validate rejects an attribution that names no provider thread.
func (model DirectorConversationModel) Validate() error {
	if model.Provider != ProviderCodex {
		return fmt.Errorf("director conversation model provider %q is unsupported", model.Provider)
	}
	if err := validateIdentifier("director conversation model", model.Model); err != nil {
		return err
	}
	return validateIdentifier("director conversation model thread id", model.ThreadID)
}

// DirectorConversationText is the payload of a user turn or an assistant reply.
type DirectorConversationText struct {
	Text string `json:"text"`
	// Model is populated exactly on an assistant reply. The user's own words
	// have no model behind them.
	Model *DirectorConversationModel `json:"model"`
}

// DirectorConversationToolActivity is the payload of a tool call or its
// receipt. Arguments and receipts are stored as the JSON the boundary carried,
// so replaying the conversation into a new provider thread reproduces what the
// Director already knows rather than a re-rendered summary of it.
type DirectorConversationToolActivity struct {
	Tool    string          `json:"tool"`
	Payload json.RawMessage `json:"payload"`
	// Succeeded is meaningful for a receipt. A call has not resolved yet, so it
	// is always false there.
	Succeeded bool `json:"succeeded"`
	// CallID is the entry id of the call a receipt answers. It is populated
	// exactly on a receipt, because one turn may call the same tool more than
	// once and a receipt that could not say which call it belongs to would let
	// the app report the wrong one as finished.
	CallID *string `json:"callId"`
}

// DirectorConversationEntry is one durable line of the Director conversation.
// Kind selects exactly one populated payload.
type DirectorConversationEntry struct {
	ID   string                        `json:"id"`
	Kind DirectorConversationEntryKind `json:"kind"`
	// TurnID is the Director turn the entry belongs to. Every entry of one turn
	// shares it, which is what lets a reply be read together with the tool
	// calls that produced it.
	TurnID     string                            `json:"turnId"`
	RecordedAt string                            `json:"recordedAt"`
	Text       *DirectorConversationText         `json:"text"`
	Tool       *DirectorConversationToolActivity `json:"tool"`
}

// Validate rejects an entry Setta could not have recorded.
func (entry DirectorConversationEntry) Validate() error {
	if err := validateIdentifier("director conversation entry id", entry.ID); err != nil {
		return err
	}
	if err := validateIdentifier("director conversation turn id", entry.TurnID); err != nil {
		return err
	}
	if _, err := validateTimestamp("director conversation recorded at", entry.RecordedAt); err != nil {
		return err
	}
	if !slices.Contains(directorConversationEntryKinds, entry.Kind) {
		return fmt.Errorf("unknown director conversation entry kind %q", entry.Kind)
	}
	return entry.validatePayload()
}

func (entry DirectorConversationEntry) validatePayload() error {
	textual := entry.Kind == DirectorConversationUserTurn ||
		entry.Kind == DirectorConversationAssistantText
	if textual != (entry.Text != nil) || textual == (entry.Tool != nil) {
		return fmt.Errorf(
			"director conversation entry %q must populate exactly its own payload",
			entry.Kind,
		)
	}
	if entry.Text != nil {
		return entry.validateText()
	}
	return entry.validateTool()
}

func (entry DirectorConversationEntry) validateTool() error {
	if err := validateIdentifier("director conversation entry tool", entry.Tool.Tool); err != nil {
		return err
	}
	if len(entry.Tool.Payload) == 0 || !json.Valid(entry.Tool.Payload) {
		return fmt.Errorf("director conversation entry %q payload must be valid JSON", entry.Kind)
	}
	if entry.Kind == DirectorConversationToolCall && entry.Tool.Succeeded {
		return fmt.Errorf("director conversation tool call cannot report a result it has not produced")
	}
	answers := entry.Kind == DirectorConversationToolReceipt
	if answers != (entry.Tool.CallID != nil) {
		return fmt.Errorf(
			"director conversation entry %q must name the call it answers when, and only when, it is a receipt",
			entry.Kind,
		)
	}
	if entry.Tool.CallID == nil {
		return nil
	}
	return validateIdentifier("director conversation receipt call id", *entry.Tool.CallID)
}

func (entry DirectorConversationEntry) validateText() error {
	if err := validateTrimmedText("director conversation entry text", entry.Text.Text); err != nil {
		return err
	}
	assistant := entry.Kind == DirectorConversationAssistantText
	if assistant != (entry.Text.Model != nil) {
		return fmt.Errorf(
			"director conversation entry %q must attribute a model when, and only when, the Director said it",
			entry.Kind,
		)
	}
	if entry.Text.Model == nil {
		return nil
	}
	return entry.Text.Model.Validate()
}
