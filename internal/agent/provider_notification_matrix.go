package agent

import (
	"sort"

	"setta/internal/codexapp"
)

// The Codex-to-Setta provider notification adapter matrix.
//
// Every server notification in the checked-in Codex protocol snapshot has exactly
// one rule here, so refreshing the snapshot cannot introduce a provider signal
// that reaches product state without a decision. A rule states the maximum
// authority the adapter has over that notification: it may do less, never more.
//
// The matrix is the authority boundary, not a description of today's normalizers.
// providerNotificationHandlers is the implemented subset, and it may only contain
// methods this matrix marks ProviderNotificationNormalized.

// ProviderNotificationDisposition is the maximum authority the Codex adapter has
// over one upstream notification.
type ProviderNotificationDisposition string

const (
	// ProviderNotificationNormalized notifications may be translated into typed
	// Setta agent events that conversation services commit durably.
	ProviderNotificationNormalized ProviderNotificationDisposition = "normalized"
	// ProviderNotificationEvidence notifications may update accounting, context,
	// and detail surfaces as provenance-carrying evidence. They are never a
	// semantic fact on their own.
	ProviderNotificationEvidence ProviderNotificationDisposition = "evidence"
	// ProviderNotificationTransport notifications may update ephemeral live UI
	// state only. Durable meaning requires a committed Setta event.
	ProviderNotificationTransport ProviderNotificationDisposition = "transport"
	// ProviderNotificationPrivate notifications carry private model reasoning.
	// They must never be persisted, displayed, summarized, or used as evidence,
	// so Setta opts out of delivery instead of receiving and discarding them.
	ProviderNotificationPrivate ProviderNotificationDisposition = "private"
	// ProviderNotificationHost notifications belong to a Setta service outside the
	// Director execution port, such as account state.
	ProviderNotificationHost ProviderNotificationDisposition = "host"
	// ProviderNotificationUnowned notifications have no Setta owner. The adapter
	// ignores them until a typed owner claims them.
	ProviderNotificationUnowned ProviderNotificationDisposition = "unowned"
)

// ProviderNotificationRule is one row of the adapter matrix.
type ProviderNotificationRule struct {
	Method      string
	Disposition ProviderNotificationDisposition
	// OptOut asks the app server not to deliver the notification at all.
	OptOut bool
	// UpstreamSource records where a method that is absent from the checked-in
	// ServerNotification schema union is defined. Empty for schema union methods.
	UpstreamSource string
	// Note records why the disposition is correct.
	Note string
}

const rawResponseUpstreamSource = "internal/codexapp/protocolschema/rust/protocol/common.rs; internal-only notification excluded from the ServerNotification schema union"

var providerNotificationMatrix = []ProviderNotificationRule{
	// Run, turn, and item lifecycle. These carry the durable causal chain of a run.
	{
		Method:      codexapp.CodexNotificationTurnStarted,
		Disposition: ProviderNotificationNormalized,
		Note:        "Provider turn identity for the active Setta run; the adapter asserts provider scope before any later event is trusted.",
	},
	{
		Method:      codexapp.CodexNotificationTurnCompleted,
		Disposition: ProviderNotificationNormalized,
		Note:        "Terminal provider turn state becomes the Setta turn outcome that closes the run's causal chain.",
	},
	{
		Method:      codexapp.CodexNotificationError,
		Disposition: ProviderNotificationNormalized,
		Note:        "Provider errors become typed lifecycle events; raw provider text is never surfaced as an internal app error.",
	},
	{
		Method:      codexapp.CodexNotificationItemStarted,
		Disposition: ProviderNotificationNormalized,
		Note:        "Typed thread items are the activity source of record for commands, file changes, tools, searches, and delegations.",
	},
	{
		Method:      codexapp.CodexNotificationItemCompleted,
		Disposition: ProviderNotificationNormalized,
		Note:        "Completed thread items carry final activity state, command source and process identity, and artifact payloads.",
	},
	{
		Method:      codexapp.CodexNotificationItemAgentMessageDelta,
		Disposition: ProviderNotificationNormalized,
		Note:        "Public assistant output; the completed message item owns durable text and the delta owns live streaming text.",
	},
	{
		Method:      codexapp.CodexNotificationItemReasoningSummaryTextDelta,
		Disposition: ProviderNotificationNormalized,
		Note:        "Public reasoning summary text only. It updates summaries and never reconstructs hidden reasoning.",
	},
	{
		Method:      codexapp.CodexNotificationItemReasoningSummaryPartAdded,
		Disposition: ProviderNotificationNormalized,
		Note:        "Public reasoning summary part boundary; it may only split summary text that is already public.",
	},
	{
		Method:      codexapp.CodexNotificationTurnPlanUpdated,
		Disposition: ProviderNotificationNormalized,
		Note:        "Completed plan state owns durable plan steps; step identity is derived from the source event because provider steps have no ids.",
	},
	{
		Method:      codexapp.CodexNotificationItemCommandExecutionOutputDelta,
		Disposition: ProviderNotificationNormalized,
		Note:        "Command output progress for a typed command activity. The manager classifies it best effort, so it may be dropped under backpressure while semantic events stay lossless.",
	},
	{
		Method:      codexapp.CodexNotificationItemCommandExecutionTerminalInteraction,
		Disposition: ProviderNotificationNormalized,
		Note:        "Interactive terminal state for a typed command activity; it updates that activity instead of creating a separate node.",
	},
	{
		Method:      codexapp.CodexNotificationItemFileChangePatchUpdated,
		Disposition: ProviderNotificationNormalized,
		Note:        "File-change progress for a typed file-change activity. Approval state comes from approval records, never inferred from a diff.",
	},
	{
		Method:      codexapp.CodexNotificationItemMcpToolCallProgress,
		Disposition: ProviderNotificationNormalized,
		Note:        "Progress for a typed MCP tool activity; it updates the existing activity rather than adding history.",
	},
	{
		Method:      codexapp.CodexNotificationHookStarted,
		Disposition: ProviderNotificationNormalized,
		Note:        "Hook execution is a typed activity of the run, with trusted hook attribution kept as evidence metadata.",
	},
	{
		Method:      codexapp.CodexNotificationHookCompleted,
		Disposition: ProviderNotificationNormalized,
		Note:        "Hook completion closes the typed hook activity, including its failure state.",
	},
	{
		Method:      codexapp.CodexNotificationModelRerouted,
		Disposition: ProviderNotificationNormalized,
		Note:        "Typed reroute reason and status; risk is never inferred from surrounding text.",
	},
	{
		Method:      codexapp.CodexNotificationServerRequestResolved,
		Disposition: ProviderNotificationNormalized,
		Note:        "An approval or input request resolved outside this client must reconcile the durable Setta approval record instead of leaving it pending.",
	},

	// Workstream and environment lifecycle. Ready states are metadata; only typed
	// lost, unavailable, or reconciling states are allowed to become visible.
	{
		Method:      codexapp.CodexNotificationThreadStatusChanged,
		Disposition: ProviderNotificationNormalized,
		Note:        "Typed thread status is a workstream lifecycle input. Idle and active are the substrate working and stay metadata; unloaded and system-error states cannot carry the run and become visible.",
	},
	{
		Method:      codexapp.CodexNotificationThreadEnvironmentConnected,
		Disposition: ProviderNotificationNormalized,
		Note:        "Experimental upstream environment lifecycle. Attached states update metadata; the adapter absorbs upstream churn so Setta lifecycle contracts stay stable.",
	},
	{
		Method:      codexapp.CodexNotificationThreadEnvironmentDisconnected,
		Disposition: ProviderNotificationNormalized,
		Note:        "Experimental upstream environment lifecycle. A run cannot progress without an environment, so a disconnection becomes a visible blocked fact.",
	},
	{
		Method:      codexapp.CodexNotificationThreadClosed,
		Disposition: ProviderNotificationNormalized,
		Note:        "Provider session teardown is execution liveness, reconciled into Setta run liveness rather than shown as a provider event.",
	},

	// Guardian, verification, and safety signals. Upstream payloads are unstable,
	// so durable Setta approval, validation, and recovery records own the meaning.
	{
		Method:      codexapp.CodexNotificationItemAutoApprovalReviewStarted,
		Disposition: ProviderNotificationNormalized,
		Note:        "Guardian review start commits a Setta validation record with no verdict yet. The payload is unstable upstream, so only the review id, the reviewed item, and the typed status cross the adapter.",
	},
	{
		Method:      codexapp.CodexNotificationItemAutoApprovalReviewCompleted,
		Disposition: ProviderNotificationNormalized,
		Note:        "Guardian review outcome commits the verdict onto the same Setta validation record. Approval records still own whether the user was asked; this record owns what the automatic review decided.",
	},
	{
		Method:      codexapp.CodexNotificationModelVerification,
		Disposition: ProviderNotificationNormalized,
		Note:        "Model verification is a typed check the provider applied to the run, so it becomes a Setta validation record that explains the run's added latency.",
	},

	// Accounting, telemetry, and evidence. These never become semantic nodes.
	{
		Method:      codexapp.CodexNotificationThreadTokenUsageUpdated,
		Disposition: ProviderNotificationEvidence,
		Note:        "Token accounting and context pressure telemetry for cost and context surfaces.",
	},
	{
		Method:      codexapp.CodexNotificationAccountRateLimitsUpdated,
		Disposition: ProviderNotificationEvidence,
		Note:        "Rolling rate-limit telemetry; a rate-limit block reaches the product through typed run lifecycle failure, not this notification.",
	},
	{
		Method:         "rawResponse/completed",
		Disposition:    ProviderNotificationEvidence,
		UpstreamSource: rawResponseUpstreamSource,
		Note:           "Exact upstream usage accounting. Raw provider payloads stay behind trusted contracts and never enter public durable state.",
	},
	{
		Method:         "rawResponseItem/completed",
		Disposition:    ProviderNotificationEvidence,
		UpstreamSource: rawResponseUpstreamSource,
		Note:           "Internal-only raw response items. They may contain unrelated private context, so they are evidence behind the adapter at most.",
	},
	{
		Method:      codexapp.CodexNotificationTurnDiffUpdated,
		Disposition: ProviderNotificationEvidence,
		Note:        "Aggregate turn diff derived from file-change items; the items own durable file-change meaning.",
	},
	{
		Method:      codexapp.CodexNotificationGuardianWarning,
		Disposition: ProviderNotificationEvidence,
		Note:        "The provider's own sentence about a Guardian outcome the typed review notification already reports, or about a turn it is about to interrupt. Normalizing it would commit a second record built from text, so the typed review and the turn's terminal state own the meaning.",
	},
	{
		Method:      codexapp.CodexNotificationModelSafetyBufferingUpdated,
		Disposition: ProviderNotificationEvidence,
		Note:        "Output buffering changes how fast the provider delivers a response, not what the run is doing. It explains latency on a detail surface; the turn's own lifecycle owns what the user acts on.",
	},
	{
		Method:      codexapp.CodexNotificationTurnModerationMetadata,
		Disposition: ProviderNotificationEvidence,
		Note:        "Provider moderation metadata about a turn, not a Setta lifecycle fact.",
	},

	// Live transport. Ephemeral until Setta commits a durable event.
	{
		Method:      codexapp.CodexNotificationItemPlanDelta,
		Disposition: ProviderNotificationTransport,
		Note:        "Experimental and explicitly non-authoritative. Durable plan state comes from the completed plan item, never from concatenated deltas.",
	},
	{
		Method:      codexapp.CodexNotificationThreadRealtimeStarted,
		Disposition: ProviderNotificationTransport,
		Note:        "Realtime session handshake state for live voice; the session id stays behind the execution adapter.",
	},
	{
		Method:      codexapp.CodexNotificationThreadRealtimeItemAdded,
		Disposition: ProviderNotificationTransport,
		Note:        "Realtime item preview. Accepted input and public output become durable only through committed Setta events.",
	},
	{
		Method:      codexapp.CodexNotificationThreadRealtimeTranscriptDelta,
		Disposition: ProviderNotificationTransport,
		Note:        "Live transcript preview for voice capture; it does not change semantic truth.",
	},
	{
		Method:      codexapp.CodexNotificationThreadRealtimeTranscriptDone,
		Disposition: ProviderNotificationTransport,
		Note:        "Final realtime transcript for a capture; Setta commits accepted user input as its own durable event.",
	},
	{
		Method:      codexapp.CodexNotificationThreadRealtimeOutputAudioDelta,
		Disposition: ProviderNotificationTransport,
		Note:        "Output audio playback bytes; audio is never durable semantic state.",
	},
	{
		Method:      codexapp.CodexNotificationThreadRealtimeSdp,
		Disposition: ProviderNotificationTransport,
		Note:        "WebRTC negotiation payload owned by the realtime transport.",
	},
	{
		Method:      codexapp.CodexNotificationThreadRealtimeError,
		Disposition: ProviderNotificationTransport,
		Note:        "Realtime transport failure. Voice capture failures reach the product through Setta capture state, not raw provider errors.",
	},
	{
		Method:      codexapp.CodexNotificationThreadRealtimeClosed,
		Disposition: ProviderNotificationTransport,
		Note:        "Realtime session teardown; durable conversation state is unaffected.",
	},

	// Private reasoning. Never received.
	{
		Method:      codexapp.CodexNotificationItemReasoningTextDelta,
		Disposition: ProviderNotificationPrivate,
		OptOut:      true,
		Note:        "Hidden chain-of-thought. Setta opts out at the protocol boundary so private reasoning cannot be persisted, displayed, or used as evidence.",
	},

	// Host state owned by a Setta service outside the Director execution port.
	{
		Method:      codexapp.CodexNotificationAccountLoginCompleted,
		Disposition: ProviderNotificationHost,
		Note:        "Codex account login completion, owned by the account service.",
	},
	{
		Method:      codexapp.CodexNotificationAccountUpdated,
		Disposition: ProviderNotificationHost,
		Note:        "Codex account and plan state, owned by the account service.",
	},

	// No Setta owner. The adapter ignores these.
	{
		Method:      codexapp.CodexNotificationThreadStarted,
		Disposition: ProviderNotificationUnowned,
		OptOut:      true,
		Note:        "Setta owns thread creation through the thread/start response, so the broadcast notification adds no durable fact.",
	},
	{
		Method:      "thread/compacted",
		Disposition: ProviderNotificationUnowned,
		Note:        "Deprecated upstream. History compaction comes from the durable context-compaction item or a Setta-owned compaction event.",
	},
	{
		Method:      "item/fileChange/outputDelta",
		Disposition: ProviderNotificationUnowned,
		Note:        "Deprecated legacy apply_patch stream; the file-change item and patch updates own file-change state.",
	},
	{
		Method:      codexapp.CodexNotificationThreadArchived,
		Disposition: ProviderNotificationUnowned,
		Note:        "Provider thread archival is Codex-side bookkeeping; Setta workstream lifecycle is durable Setta state.",
	},
	{
		Method:      codexapp.CodexNotificationThreadUnarchived,
		Disposition: ProviderNotificationUnowned,
		Note:        "Provider thread archival is Codex-side bookkeeping; Setta workstream lifecycle is durable Setta state.",
	},
	{
		Method:      "thread/deleted",
		Disposition: ProviderNotificationUnowned,
		Note:        "Provider thread deletion does not delete a Setta workstream; workstream removal is a Setta product action.",
	},
	{
		Method:      codexapp.CodexNotificationThreadNameUpdated,
		Disposition: ProviderNotificationUnowned,
		Note:        "Provider thread naming; Setta owns conversation and workstream titles.",
	},
	{
		Method:      codexapp.CodexNotificationThreadGoalUpdated,
		Disposition: ProviderNotificationUnowned,
		Note:        "Echo of a goal Setta set through thread/goal/set; the Setta record is authoritative.",
	},
	{
		Method:      codexapp.CodexNotificationThreadGoalCleared,
		Disposition: ProviderNotificationUnowned,
		Note:        "Echo of a goal Setta cleared through thread/goal/clear; the Setta record is authoritative.",
	},
	{
		Method:      codexapp.CodexNotificationThreadSettingsUpdated,
		Disposition: ProviderNotificationUnowned,
		Note:        "Echo of thread settings Setta wrote; Setta invocation configuration is authoritative.",
	},
	{
		Method:      codexapp.CodexNotificationCommandExecOutputDelta,
		Disposition: ProviderNotificationUnowned,
		Note:        "Belongs to the command/exec API Setta does not call, so it cannot arrive on a Setta session.",
	},
	{
		Method:      codexapp.CodexNotificationProcessOutputDelta,
		Disposition: ProviderNotificationUnowned,
		Note:        "Belongs to the process/spawn API Setta does not call; background terminal output comes from typed command items.",
	},
	{
		Method:      codexapp.CodexNotificationProcessExited,
		Disposition: ProviderNotificationUnowned,
		Note:        "Belongs to the process/spawn API Setta does not call; background terminal completion comes from typed command items.",
	},
	{
		Method:      codexapp.CodexNotificationFuzzyFileSearchSessionUpdated,
		Disposition: ProviderNotificationUnowned,
		Note:        "Belongs to the fuzzy file search API Setta does not call.",
	},
	{
		Method:      codexapp.CodexNotificationFuzzyFileSearchSessionCompleted,
		Disposition: ProviderNotificationUnowned,
		Note:        "Belongs to the fuzzy file search API Setta does not call.",
	},
	{
		Method:      codexapp.CodexNotificationSkillsChanged,
		Disposition: ProviderNotificationUnowned,
		Note:        "Provider skill catalog changes; Setta capability state is resolved through the execution port when a turn is submitted.",
	},
	{
		Method:      codexapp.CodexNotificationFsChanged,
		Disposition: ProviderNotificationUnowned,
		Note:        "Provider filesystem watch; Setta resource state is durable Setta state, not a provider watch feed.",
	},
	{
		Method:      codexapp.CodexNotificationAppListUpdated,
		Disposition: ProviderNotificationUnowned,
		Note:        "Provider app catalog; Setta does not expose the Codex app directory as product state.",
	},
	{
		Method:      codexapp.CodexNotificationMcpServerOauthLoginCompleted,
		Disposition: ProviderNotificationUnowned,
		Note:        "Provider MCP OAuth flow completion; Setta does not drive Codex MCP authentication.",
	},
	{
		Method:      codexapp.CodexNotificationMcpServerStartupStatusUpdated,
		Disposition: ProviderNotificationUnowned,
		Note:        "Provider MCP startup status; tool availability reaches the product through typed tool activities.",
	},
	{
		Method:      codexapp.CodexNotificationRemoteControlStatusChanged,
		Disposition: ProviderNotificationUnowned,
		Note:        "Codex remote control state; Setta is the local controller of its own runs.",
	},
	{
		Method:      "externalAgentConfig/import/progress",
		Disposition: ProviderNotificationUnowned,
		Note:        "Codex configuration import tooling; not a Setta product flow.",
	},
	{
		Method:      codexapp.CodexNotificationExternalAgentConfigImportCompleted,
		Disposition: ProviderNotificationUnowned,
		Note:        "Codex configuration import tooling; not a Setta product flow.",
	},
	{
		Method:      codexapp.CodexNotificationConfigWarning,
		Disposition: ProviderNotificationUnowned,
		Note:        "Provider configuration diagnostic; Setta must not surface raw provider diagnostics to the user.",
	},
	{
		Method:      codexapp.CodexNotificationDeprecationNotice,
		Disposition: ProviderNotificationUnowned,
		Note:        "Upstream deprecation notice for protocol maintainers; the checked-in snapshot refresh is where Setta responds.",
	},
	{
		Method:      codexapp.CodexNotificationWarning,
		Disposition: ProviderNotificationUnowned,
		Note:        "Generic provider warning text with no typed meaning; typed lifecycle events carry anything the user must act on.",
	},
	{
		Method:      codexapp.CodexNotificationWindowsWorldWritableWarning,
		Disposition: ProviderNotificationUnowned,
		Note:        "Windows sandbox host diagnostic outside the Director product surface.",
	},
	{
		Method:      codexapp.CodexNotificationWindowsSandboxSetupCompleted,
		Disposition: ProviderNotificationUnowned,
		Note:        "Windows sandbox host setup outside the Director product surface.",
	},
}

// providerNotificationOptOutMethods lists the notifications Setta asks the app
// server not to deliver.
func providerNotificationOptOutMethods() []string {
	methods := []string{}
	for _, rule := range providerNotificationMatrix {
		if rule.OptOut {
			methods = append(methods, rule.Method)
		}
	}
	sort.Strings(methods)
	return methods
}
