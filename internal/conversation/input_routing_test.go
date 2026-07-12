package conversation

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestConversationRouteDecisionAndCommandCoverEveryRestrictedOutcome(t *testing.T) {
	kinds := []ConversationRouteDecisionKind{
		ConversationRouteDecisionKindSendToParent,
		ConversationRouteDecisionKindQueueParentTurn,
		ConversationRouteDecisionKindSteerParentTurn,
		ConversationRouteDecisionKindAnswerAsNarrator,
		ConversationRouteDecisionKindCreateSideConversation,
		ConversationRouteDecisionKindForkConversation,
		ConversationRouteDecisionKindEscalateToMaster,
		ConversationRouteDecisionKindClarify,
	}
	for _, kind := range kinds {
		t.Run(string(kind), func(t *testing.T) {
			decision, command := validConversationRouteDecisionAndCommand(kind, "Keep the exact request.")
			if err := decision.Validate(); err != nil {
				t.Fatalf("decision.Validate: %v", err)
			}
			if err := command.Validate(); err != nil {
				t.Fatalf("command.Validate: %v", err)
			}
			commit := validConversationRouteDecisionCommit("decision_"+string(kind), decision, command)
			if err := commit.Validate(); err != nil {
				t.Fatalf("commit.Validate: %v", err)
			}
		})
	}
}

func TestConversationRouteDecisionRejectsCrossKindAndRewrittenCommands(t *testing.T) {
	decision, command := validConversationRouteDecisionAndCommand(
		ConversationRouteDecisionKindSendToParent,
		"Implement the lifecycle.",
	)

	missing := decision
	missing.SendToParent = nil
	assertValidationErrorContains(t, missing.Validate(), "exactly one")

	crossKind := decision
	crossKind.Clarify = &ClarifyConversationRouteDecision{Question: "Which lifecycle?"}
	assertValidationErrorContains(t, crossKind.Validate(), "exactly one")

	wrongKind := command
	wrongKind.Kind = ConversationRouteDecisionKindQueueParentTurn
	assertValidationErrorContains(t, wrongKind.Validate(), "queueParentTurn")

	rewritten := command
	rewritten.SendToParent = &SendToParentConversationRouteCommand{
		TurnID:        command.SendToParent.TurnID,
		AuthoredInput: AuthoredInput{Text: "A different request."},
	}
	assertValidationErrorContains(
		t,
		validConversationRouteDecisionCommit("decision_rewritten", decision, rewritten).Validate(),
		"changed the decided authored input",
	)

	oversized := decision
	oversized.SendToParent = &SendToParentConversationRouteDecision{
		AuthoredInput: AuthoredInput{Text: strings.Repeat("x", MaxAuthoredInputBytes+1)},
	}
	assertValidationErrorContains(t, oversized.Validate(), "exceeds")
}

func TestConversationRouteDecisionRejectsUnsafeOrIncompleteRouterInvocationAudit(t *testing.T) {
	decision, command := validConversationRouteDecisionAndCommand(
		ConversationRouteDecisionKindSendToParent,
		"Route this request safely.",
	)
	tests := []struct {
		name   string
		want   string
		mutate func(*ResolvedInvocation)
	}{
		{
			name: "unrestricted permissions",
			want: "restricted narrator permission profile",
			mutate: func(invocation *ResolvedInvocation) {
				permission := validRoleProfile(RoleAgent).PermissionProfile
				invocation.Requested.PermissionProfile = permission
				invocation.Resolved.PermissionProfile = permission
			},
		},
		{
			name: "missing input usage",
			want: "positive input/output byte and token usage",
			mutate: func(invocation *ResolvedInvocation) {
				invocation.ContextUsage.InputBytes = 0
			},
		},
		{
			name: "missing provider request",
			want: "provider thread, turn, and request references",
			mutate: func(invocation *ResolvedInvocation) {
				invocation.ProviderReferences.RequestID = nil
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			commit := validConversationRouteDecisionCommit("decision_audit", decision, command)
			test.mutate(&commit.ResolvedInvocation)
			assertValidationErrorContains(t, commit.Validate(), test.want)
		})
	}
}

func TestConversationRouteDecisionJSONContainsNoProviderPaneOrGlobalAuthority(t *testing.T) {
	decision, _ := validConversationRouteDecisionAndCommand(
		ConversationRouteDecisionKindForkConversation,
		"Make this a durable topic.",
	)
	encoded, err := json.Marshal(decision)
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}
	text := string(encoded)
	for _, forbidden := range []string{"providerThread", "providerTurn", "paneId", "workspaceId", "conversationId"} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("decision JSON contains forbidden authority %q: %s", forbidden, text)
		}
	}
}

func TestConversationInputRoutingStateRejectsImpossibleLifecycleCombinations(t *testing.T) {
	input := ConversationInput{
		ID:             "input_lifecycle",
		ConversationID: "conversation_alpha",
		Text:           "Route this request.",
		Modality:       ConversationInputModalityText,
		SubmittedAt:    "2026-07-13T18:00:00Z",
	}
	decision, command := validConversationRouteDecisionAndCommand(
		ConversationRouteDecisionKindSendToParent,
		input.Text,
	)
	commit := validConversationRouteDecisionCommit("decision_lifecycle", decision, command)
	commit.InputID = input.ID
	record := conversationRouteDecisionRecordFromCommit(commit)
	record.StreamSequence = 1

	wrongAttempt := ConversationInputRoutingState{
		Input: ConversationInputState{
			Sequence:       1,
			Input:          input,
			Status:         ConversationInputStatusDispatched,
			AcceptedAt:     "2026-07-13T18:00:01Z",
			RoutingAttempt: 2,
		},
		Decisions: []ConversationRouteDecisionRecord{record},
	}
	assertValidationErrorContains(t, wrongAttempt.Validate(), "wrong routing attempt")

	backdatedRouting := ConversationInputState{
		Sequence:         1,
		Input:            input,
		Status:           ConversationInputStatusRouting,
		AcceptedAt:       "2026-07-13T18:00:02Z",
		RoutingAttempt:   1,
		RoutingStartedAt: stringPointer("2026-07-13T18:00:01Z"),
	}
	assertValidationErrorContains(t, backdatedRouting.Validate(), "before input acceptance")

	record.RoutingAttempt = 2
	replyInput := input
	replyInput.ID = "input_lifecycle_reply"
	replyInput.ReplyToInputID = &input.ID
	resolvedReplyWithoutClarification := wrongAttempt
	resolvedReplyWithoutClarification.Decisions = []ConversationRouteDecisionRecord{record}
	resolvedReplyWithoutClarification.ClarificationReply = &ConversationInputState{
		Sequence:       2,
		Input:          replyInput,
		Status:         ConversationInputStatusDispatched,
		AcceptedAt:     "2026-07-13T18:00:03Z",
		RoutingAttempt: 1,
	}
	assertValidationErrorContains(
		t,
		resolvedReplyWithoutClarification.Validate(),
		"requires two decisions",
	)
}

func validConversationRouteDecisionAndCommand(
	kind ConversationRouteDecisionKind,
	text string,
) (ConversationRouteDecision, ConversationRouteCommand) {
	input := AuthoredInput{Text: text}
	switch kind {
	case ConversationRouteDecisionKindSendToParent:
		return ConversationRouteDecision{
				Kind:         kind,
				SendToParent: &SendToParentConversationRouteDecision{AuthoredInput: input},
			}, ConversationRouteCommand{
				Kind:         kind,
				SendToParent: &SendToParentConversationRouteCommand{TurnID: "turn_routed", AuthoredInput: input},
			}
	case ConversationRouteDecisionKindQueueParentTurn:
		return ConversationRouteDecision{
				Kind:            kind,
				QueueParentTurn: &QueueParentTurnConversationRouteDecision{AuthoredInput: input},
			}, ConversationRouteCommand{
				Kind:            kind,
				QueueParentTurn: &QueueParentTurnConversationRouteCommand{TurnID: "turn_queued", AuthoredInput: input},
			}
	case ConversationRouteDecisionKindSteerParentTurn:
		return ConversationRouteDecision{
				Kind:            kind,
				SteerParentTurn: &SteerParentTurnConversationRouteDecision{AuthoredInput: input},
			}, ConversationRouteCommand{
				Kind: kind,
				SteerParentTurn: &SteerParentTurnConversationRouteCommand{
					TargetTurnID:  "turn_running",
					AuthoredInput: input,
				},
			}
	case ConversationRouteDecisionKindAnswerAsNarrator:
		return ConversationRouteDecision{
				Kind:             kind,
				AnswerAsNarrator: &AnswerAsNarratorConversationRouteDecision{Question: text},
			}, ConversationRouteCommand{
				Kind: kind,
				AnswerAsNarrator: &AnswerAsNarratorConversationRouteCommand{
					RequestID: "narrator_request",
					Question:  text,
				},
			}
	case ConversationRouteDecisionKindCreateSideConversation:
		return ConversationRouteDecision{
				Kind:                   kind,
				CreateSideConversation: &CreateSideConversationRouteDecision{Input: input},
			}, ConversationRouteCommand{
				Kind: kind,
				CreateSideConversation: &CreateSideConversationRouteCommand{
					SideConversationID: "side_routed",
					ParentPaneID:       "pane_origin",
					TurnID:             "side_turn_routed",
					Input:              input,
				},
			}
	case ConversationRouteDecisionKindForkConversation:
		return ConversationRouteDecision{
				Kind: kind,
				ForkConversation: &ForkConversationRouteDecision{
					ForkedAtTurnID: "turn_completed",
					Input:          input,
					ProposedTitle:  "Durable routed fork",
				},
			}, ConversationRouteCommand{
				Kind: kind,
				ForkConversation: &ForkConversationRouteCommand{
					ChildConversationID: "conversation_child",
					ForkedAtTurnID:      "turn_completed",
					TurnID:              "turn_child_routed",
					Input:               input,
					ProposedTitle:       "Durable routed fork",
				},
			}
	case ConversationRouteDecisionKindEscalateToMaster:
		return ConversationRouteDecision{
				Kind:             kind,
				EscalateToMaster: &EscalateToMasterConversationRouteDecision{Input: input},
			}, ConversationRouteCommand{
				Kind: kind,
				EscalateToMaster: &EscalateToMasterConversationRouteCommand{
					MasterInputID: "master_input_routed",
					Input:         input,
				},
			}
	case ConversationRouteDecisionKindClarify:
		return ConversationRouteDecision{
				Kind:    kind,
				Clarify: &ClarifyConversationRouteDecision{Question: text},
			}, ConversationRouteCommand{
				Kind:    kind,
				Clarify: &ClarifyConversationRouteCommand{Question: text},
			}
	default:
		panic("unsupported conversation route decision test kind: " + kind)
	}
}

func validConversationRouteDecisionCommit(
	id string,
	decision ConversationRouteDecision,
	command ConversationRouteCommand,
) ConversationRouteDecisionCommit {
	invocation := validInvocation(RoleNarrator, InvocationOutcomeSucceeded)
	invocation.ID = "invocation_" + id
	invocation.StartedAt = "2026-07-11T19:59:58Z"
	invocation.EndedAt = stringPointer("2026-07-11T19:59:59Z")
	return withTestConversationRouteAttempt(ConversationRouteDecisionCommit{
		ID:             id,
		ConversationID: "conversation_alpha",
		InputID:        "input_alpha",
		RoutingAttempt: 1,
		RouterContext: ConversationRouteContextAudit{
			InputSequence:        1,
			AllowedDecisionKinds: []ConversationRouteDecisionKind{decision.Kind},
		},
		ResolvedInvocation: invocation,
		Decision:           decision,
		ResultingCommand:   command,
		DecidedAt:          "2026-07-13T18:00:01Z",
	})
}
