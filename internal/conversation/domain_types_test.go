package conversation

import (
	"strings"
	"testing"

	"setta/internal/conversation/conversationpalette"
	"setta/internal/speech"
)

const (
	testTimeStarted = "2026-07-11T20:00:00Z"
	testTimeEnded   = "2026-07-11T20:01:00Z"
)

func TestTopicConversationAndChildRecordsValidateOwnedInvariants(t *testing.T) {
	archivedAt := testTimeEnded
	conversation := TopicConversation{
		ID:                     "conversation-1",
		WorkspaceID:            stringPointer("workspace-1"),
		Title:                  "Topic conversations",
		TopicDescriptor:        "Implement the new aggregate.",
		Status:                 ConversationStatusIdle,
		CreatedAt:              testTimeStarted,
		UpdatedAt:              testTimeEnded,
		ArchivedAt:             &archivedAt,
		LastTrajectorySequence: 8,
	}
	if err := conversation.Validate(); err != nil {
		t.Fatalf("valid conversation: %v", err)
	}

	invalidConversation := conversation
	invalidConversation.Status = ConversationStatusWorking
	assertValidationErrorContains(t, invalidConversation.Validate(), "cannot be archived")
	invalidConversation = conversation
	invalidConversation.CreatedAt = "2026-07-11T13:00:00-07:00"
	assertValidationErrorContains(t, invalidConversation.Validate(), "canonical UTC")

	turn := validConversationTurn(TurnStatusRunning)
	if err := turn.Validate(); err != nil {
		t.Fatalf("valid running turn: %v", err)
	}
	mismatchedProfile := turn
	mismatchedProfile.ResolvedInvocation = invocationPointer(*turn.ResolvedInvocation)
	mismatchedProfile.ResolvedInvocation.Requested = validRoleProfile(RoleAgent)
	mismatchedProfile.ResolvedInvocation.Requested.ReasoningEffort = ReasoningEffortHigh
	assertValidationErrorContains(t, mismatchedProfile.Validate(), "requested profile does not match")
	mismatchedProviderTurn := turn
	mismatchedProviderTurn.ProviderTurnID = stringPointer("different-provider-turn")
	assertValidationErrorContains(t, mismatchedProviderTurn.Validate(), "provider turn id does not match")
	terminalInvocation := turn
	terminalInvocation.ResolvedInvocation = invocationPointer(validInvocation(RoleAgent, InvocationOutcomeSucceeded))
	assertValidationErrorContains(t, terminalInvocation.Validate(), "requires a running invocation")
	turn.Status = TurnStatusCompleted
	assertValidationErrorContains(t, turn.Validate(), "completed turn")

	failed := validConversationTurn(TurnStatusFailed)
	failed.ResolvedInvocation.Outcome = InvocationOutcomeCancelled
	failed.ResolvedInvocation.Failure = nil
	assertValidationErrorContains(t, failed.Validate(), "requires a failed invocation")

	cancelled := validConversationTurn(TurnStatusCancelled)
	cancelled.ProviderTurnID = stringPointer("orphan-provider-turn")
	assertValidationErrorContains(t, cancelled.Validate(), "without a resolved invocation")

	queued := QueuedConversationTurn{
		TurnID:         "turn-queued",
		ConversationID: conversation.ID,
		Ordinal:        1,
		QueuedAt:       testTimeStarted,
	}
	if err := queued.Validate(); err != nil {
		t.Fatalf("valid queued turn: %v", err)
	}
	queued.Ordinal = 0
	assertValidationErrorContains(t, queued.Validate(), "ordinal must be positive")

	sequence := 8
	artifact := Artifact{
		ID:                 "artifact-1",
		ConversationID:     conversation.ID,
		TurnID:             stringPointer("turn-1"),
		TrajectorySequence: &sequence,
		Kind:               ArtifactKindMarkdown,
		Title:              "Report",
		CreatedAt:          testTimeEnded,
		Markdown:           &MarkdownArtifactPayload{Markdown: "Report"},
	}
	if err := artifact.Validate(); err != nil {
		t.Fatalf("valid artifact: %v", err)
	}
	zero := 0
	artifact.TrajectorySequence = &zero
	assertValidationErrorContains(t, artifact.Validate(), "trajectory sequence must be positive")
}

func TestRoleProfilesKeepSelectionsPermissionsAndAuditIndependent(t *testing.T) {
	profile := validRoleProfile(RoleNarrator)
	if err := profile.Validate(); err != nil {
		t.Fatalf("valid narrator profile: %v", err)
	}

	providerDefault := profile
	providerDefault.ModelSelection = ModelSelection{Mode: ModelSelectionProviderDefault}
	providerDefault.ReasoningEffort = ReasoningEffort("provider-advertised-custom")
	if err := providerDefault.Validate(); err != nil {
		t.Fatalf("provider-default profile with provider-advertised effort: %v", err)
	}
	providerDefault.ModelSelection.ModelID = stringPointer("must-not-be-set")
	assertValidationErrorContains(t, providerDefault.Validate(), "must not include model id")

	invalidPermissions := profile
	invalidPermissions.PermissionProfile.Approvals = true
	assertValidationErrorContains(t, invalidPermissions.Validate(), "never cannot expose approvals")
	invalidPermissions = profile
	invalidPermissions.PermissionProfile.ToolAccess = ToolAccessPolicy{Mode: ToolAccessAllowlist, AllowedTools: []string{}}
	assertValidationErrorContains(t, invalidPermissions.Validate(), "allowlist must not be empty")

	for _, scope := range []RoleProfileOverride{
		{ScopeKind: RoleProfileScopeGlobal, Profile: profile, UpdatedAt: testTimeStarted},
		{ScopeKind: RoleProfileScopeWorkspace, ScopeID: "workspace-1", Profile: profile, UpdatedAt: testTimeStarted},
		{ScopeKind: RoleProfileScopeConversation, ScopeID: "conversation-1", Profile: profile, UpdatedAt: testTimeStarted},
	} {
		if err := scope.Validate(); err != nil {
			t.Errorf("valid %s override: %v", scope.ScopeKind, err)
		}
	}

	invocation := validInvocation(RoleAgent, InvocationOutcomeSucceeded)
	invocation.ModelReroutes = []InvocationModelReroute{
		{FromModelID: invocation.Resolved.ModelID, ToModelID: "gpt-fallback", Reason: InvocationModelRerouteReasonHighRiskCyberActivity},
		{FromModelID: "gpt-fallback", ToModelID: "gpt-safe", Reason: InvocationModelRerouteReasonHighRiskCyberActivity},
	}
	if err := invocation.Validate(); err != nil {
		t.Fatalf("valid invocation audit: %v", err)
	}
	invocation.ModelReroutes[1].FromModelID = "not-contiguous"
	assertValidationErrorContains(t, invocation.Validate(), "not contiguous")
	invocation.ModelReroutes[0].FromModelID = "not-the-resolved-model"
	assertValidationErrorContains(t, invocation.Validate(), "want resolved model")

	failed := validInvocation(RoleAgent, InvocationOutcomeFailed)
	failed.Failure = nil
	assertValidationErrorContains(t, failed.Validate(), "must have end time and failure")
}

func TestPresentationProfileMakesAutomaticReuseAndExactOverridesExplicit(t *testing.T) {
	profile := ConversationPresentationProfile{
		ConversationID:          "conversation-1",
		PaletteSelection:        PresentationSelectionAutoDistinct,
		ResolvedPaletteID:       conversationpalette.ConversationPaletteSky,
		NarratorVoiceSelection:  speech.VoiceSelectionAutoDistinct,
		ResolvedNarratorVoiceID: speechVoiceIDPointer(speech.SpeechVoiceAlloy),
		NarratorSpeechEnabled:   true,
		UpdatedAt:               testTimeStarted,
	}
	if err := profile.Validate(); err != nil {
		t.Fatalf("valid automatic presentation profile: %v", err)
	}

	profile.PaletteReuse = &PresentationReuse{
		Reason:                     PresentationReuseCatalogExhausted,
		ResolvedChoiceID:           string(conversationpalette.ConversationPaletteSky),
		ConflictingConversationIDs: []string{"conversation-2"},
	}
	profile.NarratorVoiceReuse = &PresentationReuse{
		Reason:                     PresentationReuseCatalogExhausted,
		ResolvedChoiceID:           "alloy",
		ConflictingConversationIDs: []string{"conversation-3"},
	}
	if err := profile.Validate(); err != nil {
		t.Fatalf("valid explicit catalog reuse: %v", err)
	}
	profile.NarratorVoiceReuse.ConflictingConversationIDs = []string{profile.ConversationID}
	assertValidationErrorContains(t, profile.Validate(), "cannot conflict with itself")
	profile.NarratorVoiceReuse.ConflictingConversationIDs = []string{"conversation-3"}

	exactPalette := conversationpalette.ConversationPaletteViolet
	profile.PaletteSelection = PresentationSelectionExact
	profile.RequestedPaletteID = &exactPalette
	profile.ResolvedPaletteID = exactPalette
	profile.PaletteReuse = nil
	profile.NarratorVoiceSelection = speech.VoiceSelectionExact
	profile.RequestedNarratorVoiceID = speechVoiceIDPointer(speech.SpeechVoiceMarin)
	profile.ResolvedNarratorVoiceID = speechVoiceIDPointer(speech.SpeechVoiceMarin)
	profile.NarratorVoiceReuse = nil
	if err := profile.Validate(); err != nil {
		t.Fatalf("valid exact presentation profile: %v", err)
	}

	profile.ResolvedNarratorVoiceID = speechVoiceIDPointer(speech.SpeechVoiceCedar)
	assertValidationErrorContains(t, profile.Validate(), "want requested")
	profile.ResolvedNarratorVoiceID = speechVoiceIDPointer(speech.SpeechVoiceMarin)
	profile.PaletteReuse = &PresentationReuse{
		Reason:                     PresentationReuseCatalogExhausted,
		ResolvedChoiceID:           string(exactPalette),
		ConflictingConversationIDs: []string{"conversation-2"},
	}
	assertValidationErrorContains(t, profile.Validate(), "must not contain automatic reuse")
}

func TestBranchTypesKeepDurableForksAndEphemeralSidesDistinct(t *testing.T) {
	branch := ConversationBranch{
		ChildConversationID:      "conversation-child",
		ParentConversationID:     "conversation-parent",
		Kind:                     BranchKindFork,
		DecisionSource:           BranchDecisionSourceConversationRouter,
		ForkedAtTurnID:           "turn-4",
		SourceTrajectorySequence: 19,
		CreatedAt:                testTimeStarted,
	}
	if err := branch.Validate(); err != nil {
		t.Fatalf("valid durable fork: %v", err)
	}
	branch.ParentConversationID = branch.ChildConversationID
	assertValidationErrorContains(t, branch.Validate(), "must differ")

	side := SideConversation{
		ID:                          "side-1",
		ParentConversationID:        "conversation-parent",
		ParentStatus:                ConversationStatusWorking,
		DecisionSource:              BranchDecisionSourceConversationRouter,
		ProviderThreadID:            stringPointer("thread-side"),
		SourceProviderTurnID:        stringPointer("provider-turn-1"),
		SourceTrajectorySequence:    21,
		Status:                      SideConversationStatusActive,
		ResolvedSideAgentInvocation: validInvocation(RoleSideAgent, InvocationOutcomeRunning),
		CreatedAt:                   testTimeStarted,
		UpdatedAt:                   testTimeEnded,
	}
	side.ResolvedSideAgentInvocation.ProviderReferences.ThreadID = stringPointer("thread-side")
	if err := side.Validate(); err != nil {
		t.Fatalf("valid active side conversation: %v", err)
	}
	side.ProviderThreadID = nil
	assertValidationErrorContains(t, side.Validate(), "must match its invocation audit")
	side.ResolvedSideAgentInvocation.ProviderReferences.ThreadID = nil
	assertValidationErrorContains(t, side.Validate(), "must have provider thread")
}

func validConversationTurn(status TurnStatus) ConversationTurn {
	turn := ConversationTurn{
		ID:                   "turn-1",
		ConversationID:       "conversation-1",
		AuthoredInput:        AuthoredInput{Text: "Implement the next step."},
		Delivery:             TurnDeliveryNormal,
		Status:               status,
		AcceptedAt:           testTimeStarted,
		RequestedRoleProfile: validRoleProfile(RoleAgent),
	}
	switch status {
	case TurnStatusQueued:
	case TurnStatusRunning:
		turn.StartedAt = stringPointer(testTimeStarted)
		turn.ResolvedInvocation = invocationPointer(validInvocation(RoleAgent, InvocationOutcomeRunning))
		turn.ProviderTurnID = stringPointer("provider-turn-1")
	case TurnStatusCompleted:
		turn.StartedAt = stringPointer(testTimeStarted)
		turn.EndedAt = stringPointer(testTimeEnded)
		turn.ResolvedInvocation = invocationPointer(validInvocation(RoleAgent, InvocationOutcomeSucceeded))
		turn.ProviderTurnID = stringPointer("provider-turn-1")
	case TurnStatusFailed:
		turn.StartedAt = stringPointer(testTimeStarted)
		turn.EndedAt = stringPointer(testTimeEnded)
		turn.ResolvedInvocation = invocationPointer(validInvocation(RoleAgent, InvocationOutcomeFailed))
		turn.ProviderTurnID = stringPointer("provider-turn-1")
		turn.Error = failurePointer(testFailure())
	case TurnStatusCancelled:
		turn.EndedAt = stringPointer(testTimeEnded)
	}
	return turn
}

func validRoleProfile(role Role) RoleProfile {
	modelID := "gpt-role-model"
	permission := PermissionProfile{
		ApprovalPolicy:            ApprovalPolicyNever,
		ProviderPermissionProfile: ":read-only",
		ToolAccess:                ToolAccessPolicy{Mode: ToolAccessNone, AllowedTools: []string{}},
	}
	if role == RoleAgent {
		permission = PermissionProfile{
			ApprovalPolicy:            ApprovalPolicyOnRequest,
			ProviderPermissionProfile: ":workspace",
			ToolAccess:                ToolAccessPolicy{Mode: ToolAccessAll, AllowedTools: []string{}},
			WorkspaceMutation:         true,
			Approvals:                 true,
		}
	}
	return RoleProfile{
		Role:              role,
		Provider:          ProviderCodex,
		ModelSelection:    ModelSelection{Mode: ModelSelectionExact, ModelID: &modelID},
		ReasoningEffort:   ReasoningEffortLow,
		PermissionProfile: permission,
		ContextBudget: ContextBudget{
			MaxInputBytes:        64 * 1024,
			MaxInputTokens:       16 * 1024,
			ReservedOutputTokens: 1024,
		},
	}
}

func validInvocation(role Role, outcome InvocationOutcome) ResolvedInvocation {
	invocation := ResolvedInvocation{
		ID:        "invocation-" + string(role),
		Role:      role,
		Provider:  ProviderCodex,
		Requested: validRoleProfile(role),
		Resolved: ResolvedInvocationSettings{
			ModelID:           "gpt-role-model",
			ReasoningEffort:   ReasoningEffortLow,
			PermissionProfile: validRoleProfile(role).PermissionProfile,
		},
		ProviderReferences: InvocationProviderReferences{
			ThreadID:  stringPointer("provider-thread-1"),
			TurnID:    stringPointer("provider-turn-1"),
			RequestID: stringPointer("provider-request-1"),
		},
		ModelReroutes: []InvocationModelReroute{},
		StartedAt:     testTimeStarted,
		Outcome:       outcome,
	}
	switch outcome {
	case InvocationOutcomeSucceeded:
		invocation.EndedAt = stringPointer(testTimeEnded)
		invocation.ProviderReferences.ResponseID = stringPointer("provider-response-1")
	case InvocationOutcomeFailed:
		invocation.EndedAt = stringPointer(testTimeEnded)
		invocation.Failure = failurePointer(testFailure())
	case InvocationOutcomeCancelled:
		invocation.EndedAt = stringPointer(testTimeEnded)
	}
	return invocation
}

func testFailure() Failure {
	return Failure{Code: "provider_failed", Message: "The provider call failed.", Retryable: true, DiagnosticReference: "diagnostic-1"}
}

func stringPointer(value string) *string {
	return &value
}

func speechVoiceIDPointer(value speech.SpeechVoiceID) *speech.SpeechVoiceID {
	return &value
}

func invocationPointer(value ResolvedInvocation) *ResolvedInvocation {
	return &value
}

func failurePointer(value Failure) *Failure {
	return &value
}

func assertValidationErrorContains(t *testing.T, err error, want string) {
	t.Helper()
	if err == nil {
		t.Fatalf("validation succeeded, want error containing %q", want)
	}
	if !strings.Contains(err.Error(), want) {
		t.Fatalf("validation error = %q, want substring %q", err, want)
	}
}
