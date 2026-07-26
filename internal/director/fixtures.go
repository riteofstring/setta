package director

import (
	"encoding/json"
	"fmt"
	"time"

	"setta/internal/conversation"
)

// Deterministic durable histories.
//
// These are the projector's reference inputs: ordered durable facts with fixed
// ids and fixed timestamps, so replaying one always produces the same semantic
// graph. Together they cover every node kind, every edge kind, and the lifecycle
// boundaries the command center has to survive — queueing, steering, approval,
// delegation, failure, recovery, blocking, and cancellation.
//
// They are built from the production contracts, not from a parallel mock
// vocabulary, so a contract change breaks them instead of leaving them stale.

// fixtureEpoch anchors every fixture timestamp. A fixed epoch is what lets a
// projection be compared by value across runs.
var fixtureEpoch = time.Date(2026, time.July, 24, 12, 0, 0, 0, time.UTC)

// ProjectionFixture is one deterministic durable history.
type ProjectionFixture struct {
	Name        string
	Description string
	Events      []ProjectorEvent
}

// ProjectionFixtures returns the ordered fixture catalog.
func ProjectionFixtures() []ProjectionFixture {
	return []ProjectionFixture{
		folderlessStartFixture(),
		queueAndSteeringFixture(),
		approvalAndFileChangeFixture(),
		planAndInvestigationFixture(),
		delegationFixture(),
		failureAndRecoveryFixture(),
		resourceRequestFixture(),
		directorConversationFixture(),
		blockedAndCancelledFixture(),
	}
}

// fixtureBuilder assigns stream positions, event ids, and timestamps so a
// history reads as the sequence of facts it is rather than as bookkeeping.
type fixtureBuilder struct {
	events              []ProjectorEvent
	trajectorySequences map[string]int
	tick                int
	// selected is the workstream the history has focused so far. A selection
	// fact names the one it replaced, so the builder has to remember it.
	selected string
}

func (builder *fixtureBuilder) next() (int, string) {
	builder.tick++
	return len(builder.events) + 1, fixtureEpoch.Add(time.Duration(builder.tick) * time.Second).Format(time.RFC3339Nano)
}

// director appends one Director-owned fact.
func (builder *fixtureBuilder) director(workstreamID string, kind DirectorSourceFact, actor SemanticActor, apply func(*DirectorFactEvent)) string {
	sequence, emittedAt := builder.next()
	fact := DirectorFactEvent{
		ID:           fmt.Sprintf("director-%02d", sequence),
		EmittedAt:    emittedAt,
		Kind:         kind,
		WorkstreamID: &workstreamID,
		Actor:        actor,
	}
	apply(&fact)
	builder.events = append(builder.events, ProjectorEvent{Sequence: sequence, Director: &fact})
	return fact.ID
}

// directorApp appends one Director-owned fact that happened in no workstream.
// A decision that creates a workstream is made before that workstream exists,
// so it belongs to the Director's own lane.
func (builder *fixtureBuilder) directorApp(kind DirectorSourceFact, actor SemanticActor, apply func(*DirectorFactEvent)) string {
	sequence, emittedAt := builder.next()
	fact := DirectorFactEvent{
		ID:        fmt.Sprintf("director-%02d", sequence),
		EmittedAt: emittedAt,
		Kind:      kind,
		Actor:     actor,
	}
	apply(&fact)
	builder.events = append(builder.events, ProjectorEvent{Sequence: sequence, Director: &fact})
	return fact.ID
}

// trajectory appends one conversation trajectory event.
func (builder *fixtureBuilder) trajectory(
	conversationID string,
	turnID *string,
	kind conversation.TrajectoryEventKind,
	actor conversation.TrajectoryActor,
	apply func(*conversation.TrajectoryEvent),
) string {
	sequence, emittedAt := builder.next()
	if builder.trajectorySequences == nil {
		builder.trajectorySequences = map[string]int{}
	}
	builder.trajectorySequences[conversationID]++
	event := conversation.TrajectoryEvent{
		ID:             fmt.Sprintf("trajectory-%02d", sequence),
		ConversationID: conversationID,
		TurnID:         turnID,
		Sequence:       builder.trajectorySequences[conversationID],
		EmittedAt:      emittedAt,
		Kind:           kind,
		Actor:          actor,
	}
	apply(&event)
	builder.events = append(builder.events, ProjectorEvent{Sequence: sequence, Trajectory: &event})
	return event.ID
}

// directorConversation appends one durable Director conversation entry. The
// Director's own lane is a conversation rather than a workstream, so its facts
// carry no workstream at all.
func (builder *fixtureBuilder) directorConversation(
	turnID string,
	kind conversation.DirectorConversationEntryKind,
	apply func(*conversation.DirectorConversationEntry),
) string {
	sequence, recordedAt := builder.next()
	entry := conversation.DirectorConversationEntry{
		ID:         fmt.Sprintf("director-entry-%02d", sequence),
		Kind:       kind,
		TurnID:     turnID,
		RecordedAt: recordedAt,
	}
	apply(&entry)
	builder.events = append(builder.events, ProjectorEvent{Sequence: sequence, DirectorConversation: &entry})
	return entry.ID
}

// register admits a workstream and selects it, which is how every history
// starts: the app has an app-scoped owner for the work before any work happens.
// The anchor comes from the durable conversation record, which is the same fact
// production folds, so a fixture cannot mint a workstream the app could not.
func (builder *fixtureBuilder) register(conversationID string, title string) string {
	workstreamID := fixtureWorkstreamID(conversationID)
	sequence, emittedAt := builder.next()
	builder.events = append(builder.events, ProjectorEvent{
		Sequence: sequence,
		WorkstreamRecord: &WorkstreamRecordProjection{
			ID:             fmt.Sprintf("conversation-%02d", sequence),
			EmittedAt:      emittedAt,
			WorkstreamID:   workstreamID,
			ConversationID: conversationID,
			Title:          title,
		},
	})
	previous := builder.selected
	builder.director(workstreamID, DirectorFactWorkstreamSelected, SemanticActorUser, func(fact *DirectorFactEvent) {
		fact.WorkstreamSelected = &DirectorWorkstreamSelected{}
		if previous != "" {
			fact.WorkstreamSelected.PreviousWorkstreamID = stringPointer(previous)
		}
	})
	builder.selected = workstreamID
	return workstreamID
}

// fixtureWorkstreamID derives a workstream identity the way the registry does.
// A fixture that named work by an id the app could never mint would prove
// nothing about the projection production runs.
func fixtureWorkstreamID(conversationID string) string {
	workstreamID, err := WorkstreamIDForConversation(conversationID)
	if err != nil {
		panic("fixture conversation id: " + err.Error())
	}
	return workstreamID
}

// fixtureJSON encodes a durable payload a fixture carries across the tool
// boundary as the JSON the boundary itself carries.
func fixtureJSON(payload any) json.RawMessage {
	encoded, err := json.Marshal(payload)
	if err != nil {
		panic("encode fixture payload: " + err.Error())
	}
	return encoded
}

func (builder *fixtureBuilder) acceptInput(conversationID string, turnID string, text string) string {
	return builder.trajectory(conversationID, &turnID, conversation.TrajectoryEventUserInputAccepted, conversation.TrajectoryActorUser,
		func(event *conversation.TrajectoryEvent) {
			event.UserInputAccepted = &conversation.TrajectoryUserInputAccepted{
				Input:    conversation.AuthoredInput{Text: text},
				Delivery: conversation.TurnDeliveryNormal,
			}
		})
}

func (builder *fixtureBuilder) startTurn(conversationID string, turnID string) string {
	return builder.trajectory(conversationID, &turnID, conversation.TrajectoryEventTurnStarted, conversation.TrajectoryActorSystem,
		func(event *conversation.TrajectoryEvent) {
			event.TurnStarted = &conversation.TrajectoryTurnStarted{Invocation: fixtureInvocation(turnID)}
		})
}

func (builder *fixtureBuilder) completeTurn(conversationID string, turnID string) string {
	return builder.trajectory(conversationID, &turnID, conversation.TrajectoryEventTurnCompleted, conversation.TrajectoryActorSystem,
		func(event *conversation.TrajectoryEvent) {
			event.TurnCompleted = &conversation.TrajectoryTurnCompleted{}
		})
}

func fixtureInvocation(turnID string) conversation.ResolvedInvocation {
	modelID := "gpt-5.1-codex"
	permissions := conversation.PermissionProfile{
		ApprovalPolicy:            conversation.ApprovalPolicyOnRequest,
		ProviderPermissionProfile: "workspace-write",
		ToolAccess: conversation.ToolAccessPolicy{
			Mode:         conversation.ToolAccessAll,
			AllowedTools: []string{},
		},
		WorkspaceMutation: true,
		Approvals:         true,
	}
	return conversation.ResolvedInvocation{
		ID:       "invocation-" + turnID,
		Role:     conversation.RoleAgent,
		Provider: conversation.ProviderCodex,
		Requested: conversation.RoleProfile{
			Role:              conversation.RoleAgent,
			Provider:          conversation.ProviderCodex,
			ModelSelection:    conversation.ModelSelection{Mode: conversation.ModelSelectionExact, ModelID: &modelID},
			ReasoningEffort:   conversation.ReasoningEffortHigh,
			PermissionProfile: permissions,
			ContextBudget: conversation.ContextBudget{
				MaxInputBytes:        64 * 1024,
				MaxInputTokens:       16 * 1024,
				ReservedOutputTokens: 1024,
			},
		},
		Resolved: conversation.ResolvedInvocationSettings{
			ModelID:           modelID,
			ReasoningEffort:   conversation.ReasoningEffortHigh,
			PermissionProfile: permissions,
		},
		ModelReroutes: []conversation.InvocationModelReroute{},
		StartedAt:     fixtureEpoch.Format(time.RFC3339Nano),
		Outcome:       conversation.InvocationOutcomeRunning,
	}
}

// folderlessStartFixture is the product's first promise: open the app with no
// folder chosen and get useful work immediately. The work declares that it
// needs none of the user's files, which is what lets it start at all.
func folderlessStartFixture() ProjectionFixture {
	builder := &fixtureBuilder{}
	const conversationID = "conv-alpha"
	const turnID = "turn-alpha-1"
	workstreamID := builder.register(conversationID, "Summarize the release notes")
	builder.acceptInput(conversationID, turnID, "Summarize the release notes")
	builder.director(workstreamID, DirectorFactDecisionCommitted, SemanticActorDirector, func(fact *DirectorFactEvent) {
		target := workstreamID
		fact.RunID = stringPointer(turnID)
		fact.DecisionCommitted = &DirectorDecisionCommitted{
			Decision:             DirectorDecisionSendToWorkstream,
			IntentID:             "intent-alpha-1",
			PublicSummary:        "Send the summary request to this workstream",
			TargetWorkstreamID:   &target,
			WorkspaceRequirement: workspaceRequirementPointer(WorkspaceOptional),
		}
	})
	builder.startTurn(conversationID, turnID)
	builder.trajectory(conversationID, stringPointer(turnID), conversation.TrajectoryEventAgentPublicTextDelta, conversation.TrajectoryActorAgent,
		func(event *conversation.TrajectoryEvent) {
			event.AgentPublicTextDelta = &conversation.TrajectoryAgentPublicTextDelta{ProviderItemID: "item-1", Delta: "Reading "}
		})
	builder.activity(conversationID, turnID, conversation.TrajectoryActivity{
		ID: "activity-alpha-1", Kind: conversation.TrajectoryActivityCommand, Title: "rg release notes",
		Command: stringPointer("rg release notes"), CWD: stringPointer("/tmp"),
	}, "Found 3 release notes")
	builder.trajectory(conversationID, stringPointer(turnID), conversation.TrajectoryEventArtifactEmitted, conversation.TrajectoryActorSystem,
		func(event *conversation.TrajectoryEvent) {
			event.ArtifactEmitted = &conversation.TrajectoryArtifactEmitted{
				ArtifactID: "artifact-alpha-1",
				Title:      "Release notes summary",
			}
		})
	builder.trajectory(conversationID, stringPointer(turnID), conversation.TrajectoryEventAgentMessageCompleted, conversation.TrajectoryActorAgent,
		func(event *conversation.TrajectoryEvent) {
			event.AgentMessageCompleted = &conversation.TrajectoryAgentMessageCompleted{
				ProviderItemID: "item-1",
				Text:           "Summarized three release notes into one artifact.",
			}
		})
	builder.completeTurn(conversationID, turnID)
	return ProjectionFixture{
		Name:        "folderless_start",
		Description: "A folderless workstream accepts a goal, runs one command, produces an artifact, and completes.",
		Events:      builder.events,
	}
}

// activity appends a started/completed activity pair.
func (builder *fixtureBuilder) activity(
	conversationID string,
	turnID string,
	activity conversation.TrajectoryActivity,
	summary string,
) {
	builder.trajectory(conversationID, &turnID, conversation.TrajectoryEventActivityStarted, conversation.TrajectoryActorAgent,
		func(event *conversation.TrajectoryEvent) {
			event.ActivityStarted = &conversation.TrajectoryActivityStarted{Activity: activity}
		})
	builder.trajectory(conversationID, &turnID, conversation.TrajectoryEventActivityCompleted, conversation.TrajectoryActorAgent,
		func(event *conversation.TrajectoryEvent) {
			event.ActivityCompleted = &conversation.TrajectoryActivityCompleted{Activity: activity, Summary: summary}
		})
}

// queueAndSteeringFixture covers work submitted during an active run and an
// instruction changed mid-run.
func queueAndSteeringFixture() ProjectionFixture {
	builder := &fixtureBuilder{}
	const conversationID = "conv-beta"
	const firstTurn = "turn-beta-1"
	const secondTurn = "turn-beta-2"
	builder.register(conversationID, "Refactor the importer")
	builder.acceptInput(conversationID, firstTurn, "Refactor the importer")
	builder.startTurn(conversationID, firstTurn)
	builder.acceptInput(conversationID, secondTurn, "Then update the docs")
	builder.trajectory(conversationID, stringPointer(secondTurn), conversation.TrajectoryEventTurnQueued, conversation.TrajectoryActorSystem,
		func(event *conversation.TrajectoryEvent) {
			event.TurnQueued = &conversation.TrajectoryTurnQueued{QueueOrdinal: 1}
		})
	builder.trajectory(conversationID, stringPointer(firstTurn), conversation.TrajectoryEventTurnSteered, conversation.TrajectoryActorUser,
		func(event *conversation.TrajectoryEvent) {
			event.TurnSteered = &conversation.TrajectoryTurnSteered{
				Input: conversation.AuthoredInput{Text: "Refactor the importer, but keep the public API"},
			}
		})
	builder.completeTurn(conversationID, firstTurn)
	builder.trajectory(conversationID, stringPointer(secondTurn), conversation.TrajectoryEventTurnPromoted, conversation.TrajectoryActorSystem,
		func(event *conversation.TrajectoryEvent) {
			event.TurnPromoted = &conversation.TrajectoryTurnPromoted{FormerQueueOrdinal: 1}
		})
	builder.completeTurn(conversationID, secondTurn)
	return ProjectionFixture{
		Name:        "queue_and_steering",
		Description: "Work queued behind an active run, the active run steered, then both runs completing in order.",
		Events:      builder.events,
	}
}

// approvalAndFileChangeFixture covers a gated file change: the approval blocks
// the change, and the typed decision releases it.
func approvalAndFileChangeFixture() ProjectionFixture {
	builder := &fixtureBuilder{}
	const conversationID = "conv-gamma"
	const turnID = "turn-gamma-1"
	const approvalID = "approval-gamma-1"
	const itemID = "item-gamma-1"
	builder.register(conversationID, "Fix the parser")
	builder.acceptInput(conversationID, turnID, "Fix the parser")
	builder.startTurn(conversationID, turnID)
	changes := []conversation.FileChange{{Path: "internal/parse/lexer.go", Kind: conversation.FileChangeUpdate, Diff: "@@ secret token @@"}}
	builder.trajectory(conversationID, stringPointer(turnID), conversation.TrajectoryEventFileChangeProposed, conversation.TrajectoryActorAgent,
		func(event *conversation.TrajectoryEvent) {
			event.FileChangeProposed = &conversation.TrajectoryFileChangeProposed{ProviderItemID: itemID, Changes: changes}
		})
	// The provider's automatic approval review declined to allow the change on
	// its own, which is why the user is asked next.
	builder.validation(conversationID, turnID, conversation.TrajectoryValidation{
		ID:      "review-gamma-1",
		Kind:    conversation.TrajectoryValidationGuardianReview,
		Status:  conversation.TrajectoryValidationStatusFailed,
		Risk:    validationRiskPointer(conversation.TrajectoryValidationRiskHigh),
		Subject: stringPointer(itemID),
		Summary: "Automatic approval review declined the change (risk high)",
	})
	builder.trajectory(conversationID, stringPointer(turnID), conversation.TrajectoryEventApprovalRequested, conversation.TrajectoryActorSystem,
		func(event *conversation.TrajectoryEvent) {
			event.ApprovalRequested = &conversation.TrajectoryApprovalRequested{
				Approval: conversation.TrajectoryApprovalRequest{
					ID:             approvalID,
					ProviderItemID: itemID,
					Kind:           conversation.TrajectoryApprovalKindFileChange,
					Title:          "Apply 1 file change",
					Body:           "internal/parse/lexer.go contains the deploy token",
					FilePaths:      []string{"internal/parse/lexer.go"},
					Questions: []conversation.TrajectoryApprovalQuestion{{
						ID: "question-1", Header: "Deploy token", Question: "Paste the deploy token",
						Options: []string{}, Secret: true,
					}},
					RequestedAt: fixtureEpoch.Format(time.RFC3339Nano),
				},
			}
		})
	builder.trajectory(conversationID, stringPointer(turnID), conversation.TrajectoryEventApprovalResolved, conversation.TrajectoryActorUser,
		func(event *conversation.TrajectoryEvent) {
			event.ApprovalResolved = &conversation.TrajectoryApprovalResolved{
				Resolution: conversation.TrajectoryApprovalResolution{
					ApprovalID: approvalID,
					Decision:   conversation.TrajectoryApprovalDecisionAnswered,
					Response:   "sk-live-do-not-log",
					Answers: []conversation.ConversationApprovalAnswer{{
						QuestionID: "question-1", Answers: []string{"sk-live-do-not-log"},
					}},
					SecretsRedacted: true,
					ResolvedAt:      fixtureEpoch.Format(time.RFC3339Nano),
				},
			}
		})
	builder.trajectory(conversationID, stringPointer(turnID), conversation.TrajectoryEventFileChangeCompleted, conversation.TrajectoryActorAgent,
		func(event *conversation.TrajectoryEvent) {
			event.FileChangeCompleted = &conversation.TrajectoryFileChangeCompleted{
				ProviderItemID: itemID,
				Changes:        changes,
				Outcome:        conversation.FileChangeOutcomeCompleted,
			}
		})
	builder.completeTurn(conversationID, turnID)
	return ProjectionFixture{
		Name:        "approval_and_file_change",
		Description: "A proposed file change blocked by a secret-bearing approval, then answered and applied.",
		Events:      builder.events,
	}
}

// planAndInvestigationFixture covers a plan that is superseded mid-run, which is
// the case where step identity has to be retired rather than accumulated.
func planAndInvestigationFixture() ProjectionFixture {
	builder := &fixtureBuilder{}
	const conversationID = "conv-delta"
	const turnID = "turn-delta-1"
	builder.register(conversationID, "Research the migration")
	builder.acceptInput(conversationID, turnID, "Research the migration")
	builder.startTurn(conversationID, turnID)
	builder.planChanged(conversationID, turnID, "Investigate then report", []conversation.PlanStep{
		{Text: "Search for prior art", Status: conversation.PlanStepStatusInProgress},
		{Text: "Write the comparison", Status: conversation.PlanStepStatusPending},
	})
	builder.activity(conversationID, turnID, conversation.TrajectoryActivity{
		ID: "activity-delta-1", Kind: conversation.TrajectoryActivityWebSearch, Title: "Search migration guides",
	}, "Read 4 migration guides")
	builder.planChanged(conversationID, turnID, "Investigate then report", []conversation.PlanStep{
		{Text: "Search for prior art", Status: conversation.PlanStepStatusCompleted},
		{Text: "Write the comparison", Status: conversation.PlanStepStatusCompleted},
	})
	builder.completeTurn(conversationID, turnID)
	return ProjectionFixture{
		Name:        "plan_and_investigation",
		Description: "A committed plan, an investigation, and a second plan that supersedes the first plan's steps.",
		Events:      builder.events,
	}
}

func (builder *fixtureBuilder) planChanged(
	conversationID string,
	turnID string,
	explanation string,
	steps []conversation.PlanStep,
) string {
	return builder.trajectory(conversationID, &turnID, conversation.TrajectoryEventPlanChanged, conversation.TrajectoryActorAgent,
		func(event *conversation.TrajectoryEvent) {
			event.PlanChanged = &conversation.TrajectoryPlanChanged{Explanation: &explanation, Steps: steps}
		})
}

// delegationFixture covers the one delegation the product has: a provider
// subagent that does part of a run's work without ever earning its own address.
func delegationFixture() ProjectionFixture {
	builder := &fixtureBuilder{}
	const conversationID = "conv-parent"
	const turnID = "turn-parent-1"
	builder.register(conversationID, "Ship the release")
	builder.acceptInput(conversationID, turnID, "Ship the release")
	builder.startTurn(conversationID, turnID)
	subagent := conversation.Subagent{
		ID:      "subagent-parent-1",
		Status:  conversation.SubagentStatusRunning,
		Message: stringPointer("Checking the tag history"),
	}
	builder.trajectory(conversationID, stringPointer(turnID), conversation.TrajectoryEventSubagentStarted, conversation.TrajectoryActorAgent,
		func(event *conversation.TrajectoryEvent) {
			event.SubagentStarted = &conversation.TrajectorySubagentStarted{Subagent: subagent}
		})
	completed := subagent
	completed.Status = conversation.SubagentStatusCompleted
	completed.Message = stringPointer("Tag history is clean")
	builder.trajectory(conversationID, stringPointer(turnID), conversation.TrajectoryEventSubagentCompleted, conversation.TrajectoryActorAgent,
		func(event *conversation.TrajectoryEvent) {
			event.SubagentCompleted = &conversation.TrajectorySubagentCompleted{Subagent: completed}
		})
	builder.completeTurn(conversationID, turnID)
	return ProjectionFixture{
		Name:        "delegation",
		Description: "A provider subagent that runs inside a workstream's run and closes with it.",
		Events:      builder.events,
	}
}

// failureAndRecoveryFixture covers the path the product must never show as an
// internal error: work fails, trusted code retries, and the run recovers.
func failureAndRecoveryFixture() ProjectionFixture {
	builder := &fixtureBuilder{}
	const conversationID = "conv-epsilon"
	const failedTurn = "turn-epsilon-1"
	const retriedTurn = "turn-epsilon-2"
	workstreamID := builder.register(conversationID, "Build the installer")
	builder.acceptInput(conversationID, failedTurn, "Build the installer")
	builder.startTurn(conversationID, failedTurn)
	activity := conversation.TrajectoryActivity{
		ID: "activity-epsilon-1", Kind: conversation.TrajectoryActivityCommand, Title: "make installer",
		Command: stringPointer("make installer"), CWD: stringPointer("/repo/epsilon"),
	}
	builder.trajectory(conversationID, stringPointer(failedTurn), conversation.TrajectoryEventActivityStarted, conversation.TrajectoryActorAgent,
		func(event *conversation.TrajectoryEvent) {
			event.ActivityStarted = &conversation.TrajectoryActivityStarted{Activity: activity}
		})
	builder.trajectory(conversationID, stringPointer(failedTurn), conversation.TrajectoryEventActivityFailed, conversation.TrajectoryActorAgent,
		func(event *conversation.TrajectoryEvent) {
			event.ActivityFailed = &conversation.TrajectoryActivityFailed{
				Activity: activity,
				Failure: conversation.Failure{
					Code:                "command_failed",
					Message:             "make installer exited with status 2",
					Retryable:           true,
					DiagnosticReference: "diagnostic-blob-epsilon",
				},
			}
		})
	failureEventID := builder.trajectory(conversationID, stringPointer(failedTurn), conversation.TrajectoryEventTurnFailed, conversation.TrajectoryActorSystem,
		func(event *conversation.TrajectoryEvent) {
			event.TurnFailed = &conversation.TrajectoryTurnFailed{
				Failure: conversation.Failure{
					Code:                "run_failed",
					Message:             "The installer build failed",
					Retryable:           true,
					DiagnosticReference: "diagnostic-blob-epsilon-run",
				},
			}
		})
	builder.director(workstreamID, DirectorFactRecoveryAttempted, SemanticActorDirector, func(fact *DirectorFactEvent) {
		fact.RecoveryAttempted = &DirectorRecoveryAttempted{
			RecoveryID:     "recovery-epsilon-1",
			Status:         RecoveryStatusRetrying,
			FailureEventID: failureEventID,
			PublicSummary:  "Retrying the installer build",
		}
	})
	builder.trajectory(conversationID, stringPointer(retriedTurn), conversation.TrajectoryEventModelRerouted, conversation.TrajectoryActorSystem,
		func(event *conversation.TrajectoryEvent) {
			event.ModelRerouted = &conversation.TrajectoryModelRerouted{
				Reroute: conversation.InvocationModelReroute{
					FromModelID: "gpt-5.1-codex",
					ToModelID:   "gpt-5.1-codex-mini",
					Reason:      conversation.InvocationModelRerouteReasonHighRiskCyberActivity,
				},
			}
		})
	builder.acceptInput(conversationID, retriedTurn, "Build the installer")
	builder.startTurn(conversationID, retriedTurn)
	builder.director(workstreamID, DirectorFactRecoveryAttempted, SemanticActorDirector, func(fact *DirectorFactEvent) {
		fact.RecoveryAttempted = &DirectorRecoveryAttempted{
			RecoveryID:     "recovery-epsilon-1",
			Status:         RecoveryStatusRecovered,
			FailureEventID: failureEventID,
			PublicSummary:  "Installer retry recovered",
		}
	})
	builder.completeTurn(conversationID, retriedTurn)
	return ProjectionFixture{
		Name:        "failure_and_recovery",
		Description: "A failed activity and run, a trusted retry that recovers it, a model reroute, then a successful rerun.",
		Events:      builder.events,
	}
}

// resourceRequestFixture covers work that genuinely needs the user's own files
// and so cannot start until they supply the folder, which is the case the old
// routing-failure affordance could not render without a pane.
func resourceRequestFixture() ProjectionFixture {
	builder := &fixtureBuilder{}
	const conversationID = "conv-zeta"
	const turnID = "turn-zeta-1"
	const requestID = "resource-zeta-1"
	workstreamID := builder.register(conversationID, "Run the test suite")
	builder.acceptInput(conversationID, turnID, "Run the test suite")
	builder.director(workstreamID, DirectorFactDecisionCommitted, SemanticActorDirector, func(fact *DirectorFactEvent) {
		target := workstreamID
		fact.DecisionCommitted = &DirectorDecisionCommitted{
			Decision:             DirectorDecisionSendToWorkstream,
			IntentID:             "intent-zeta-1",
			PublicSummary:        "Run the tests in this workstream",
			TargetWorkstreamID:   &target,
			WorkspaceRequirement: workspaceRequirementPointer(WorkspaceRequired),
		}
	})
	builder.director(workstreamID, DirectorFactResourceRequestOpened, SemanticActorDirector, func(fact *DirectorFactEvent) {
		fact.RunID = stringPointer(turnID)
		fact.ResourceRequestOpened = &DirectorResourceRequestOpened{
			RequestID:     requestID,
			Kind:          WorkstreamResourceKindFolder,
			PublicSummary: "Choose the folder that holds the test suite",
		}
	})
	binding := WorkstreamResourceBinding{
		Kind:   WorkstreamResourceKindFolder,
		Folder: &WorkstreamFolderResource{WorkspaceID: "workspace-zeta", RootPath: "/repo/zeta"},
	}
	builder.director(workstreamID, DirectorFactResourceRequestResolved, SemanticActorUser, func(fact *DirectorFactEvent) {
		fact.ResourceRequestResolved = &DirectorResourceRequestResolved{
			RequestID: requestID,
			Status:    ResourceRequestStatusResolved,
			Binding:   &binding,
		}
	})
	builder.director(workstreamID, DirectorFactWorkstreamResourceBound, SemanticActorSystem, func(fact *DirectorFactEvent) {
		fact.WorkstreamResourceBound = &DirectorWorkstreamResourceBound{Binding: binding}
	})
	builder.startTurn(conversationID, turnID)
	builder.completeTurn(conversationID, turnID)
	return ProjectionFixture{
		Name:        "resource_request",
		Description: "Work that needs the user's files blocked on a durable resource request, then unblocked by the folder they chose.",
		Events:      builder.events,
	}
}

// directorConversationFixture covers the Director's own lane: what the user
// asked the app for, the Setta tool the Director called, the workstream that
// call created, what the call reported back, and what the Director then said.
// It is the only lane whose label a model authored, so it is where the
// interpretation evidence class comes from.
func directorConversationFixture() ProjectionFixture {
	builder := &fixtureBuilder{}
	const conversationID = "conv-eta"
	const turnID = "director-turn-eta-1"
	builder.directorConversation(turnID, conversation.DirectorConversationUserTurn, func(entry *conversation.DirectorConversationEntry) {
		entry.Text = &conversation.DirectorConversationText{Text: "Start a workstream that audits the dependencies"}
	})
	callID := builder.directorConversation(turnID, conversation.DirectorConversationToolCall, func(entry *conversation.DirectorConversationEntry) {
		entry.Tool = &conversation.DirectorConversationToolActivity{
			Tool: "create_workstream",
			Payload: json.RawMessage(
				`{"title":"Audit the dependencies","workspaceId":"workspace-eta",` +
					`"workspaceRequirement":"required","initialInput":null}`,
			),
		}
	})
	// The decision is committed before the workstream it authorized exists, which
	// is why it is drawn in the lane rather than in the work it started.
	workstreamID := fixtureWorkstreamID(conversationID)
	builder.directorApp(DirectorFactDecisionCommitted, SemanticActorDirector, func(fact *DirectorFactEvent) {
		target := workstreamID
		fact.DecisionCommitted = &DirectorDecisionCommitted{
			Decision:             DirectorDecisionCreateWorkstream,
			IntentID:             "intent-eta-1",
			PublicSummary:        "Create a workstream for the dependency audit",
			TargetWorkstreamID:   &target,
			WorkspaceRequirement: workspaceRequirementPointer(WorkspaceRequired),
		}
	})
	builder.register(conversationID, "Audit the dependencies")
	builder.directorConversation(turnID, conversation.DirectorConversationToolReceipt, func(entry *conversation.DirectorConversationEntry) {
		receipt := SettaToolReceipt{
			Tool:                 "create_workstream",
			Summary:              "Created “Audit the dependencies” and selected it.",
			WorkstreamID:         &workstreamID,
			SelectedWorkstreamID: &workstreamID,
			WorkspaceRequirement: workspaceRequirementPointer(WorkspaceRequired),
		}
		entry.Tool = &conversation.DirectorConversationToolActivity{
			Tool:      receipt.Tool,
			Payload:   fixtureJSON(receipt),
			Succeeded: true,
			CallID:    &callID,
		}
	})
	builder.directorConversation(turnID, conversation.DirectorConversationAssistantText, func(entry *conversation.DirectorConversationEntry) {
		entry.Text = &conversation.DirectorConversationText{
			Text: "I started that workstream and selected it. Send it the audit whenever you are ready.",
			Model: &conversation.DirectorConversationModel{
				Provider: conversation.ProviderCodex,
				Model:    "gpt-5.1-codex",
			},
		}
	})
	return ProjectionFixture{
		Name:        "director_conversation",
		Description: "A Director turn that calls a Setta tool, creates and selects a workstream, and answers the user.",
		Events:      builder.events,
	}
}

// blockedAndCancelledFixture covers the lifecycle facts that tell the user the
// app is stuck: an unavailable provider and a cancelled run.
func blockedAndCancelledFixture() ProjectionFixture {
	builder := &fixtureBuilder{}
	const conversationID = "conv-theta"
	const turnID = "turn-theta-1"
	builder.register(conversationID, "Deploy the preview")
	builder.acceptInput(conversationID, turnID, "Deploy the preview")
	builder.startTurn(conversationID, turnID)
	builder.providerLifecycle(conversationID, turnID, conversation.ProviderLifecycle{
		Provider: conversation.ProviderCodex,
		Status:   conversation.ProviderLifecycleUnavailable,
		Reason:   conversation.ProviderLifecycleReasonEnvironmentDisconnected,
	})
	builder.providerLifecycle(conversationID, turnID, conversation.ProviderLifecycle{
		Provider: conversation.ProviderCodex,
		Status:   conversation.ProviderLifecycleReady,
		Reason:   conversation.ProviderLifecycleReasonEnvironmentConnected,
	})
	// The provider answered this request somewhere else, so the prompt is
	// withdrawn without anyone here deciding it.
	builder.trajectory(conversationID, stringPointer(turnID), conversation.TrajectoryEventApprovalRequested, conversation.TrajectoryActorSystem,
		func(event *conversation.TrajectoryEvent) {
			event.ApprovalRequested = &conversation.TrajectoryApprovalRequested{
				Approval: conversation.TrajectoryApprovalRequest{
					ID:             "approval-theta-1",
					ProviderItemID: "item-theta-1",
					Kind:           conversation.TrajectoryApprovalKindCommand,
					Title:          "Run the preview deploy",
					Body:           "The preview deploy is ready to run",
					Command:        stringPointer("deploy preview"),
					CWD:            stringPointer("/repo/theta"),
					FilePaths:      []string{},
					Questions:      []conversation.TrajectoryApprovalQuestion{},
					RequestedAt:    fixtureEpoch.Format(time.RFC3339Nano),
				},
			}
		})
	builder.trajectory(conversationID, stringPointer(turnID), conversation.TrajectoryEventApprovalResolved, conversation.TrajectoryActorProvider,
		func(event *conversation.TrajectoryEvent) {
			event.ApprovalResolved = &conversation.TrajectoryApprovalResolved{
				Resolution: conversation.TrajectoryApprovalResolution{
					ApprovalID: "approval-theta-1",
					Decision:   conversation.TrajectoryApprovalDecisionSuperseded,
					Answers:    []conversation.ConversationApprovalAnswer{},
					ResolvedAt: fixtureEpoch.Format(time.RFC3339Nano),
				},
			}
		})
	builder.trajectory(conversationID, stringPointer(turnID), conversation.TrajectoryEventTurnInterrupted, conversation.TrajectoryActorUser,
		func(event *conversation.TrajectoryEvent) {
			event.TurnInterrupted = &conversation.TrajectoryTurnInterrupted{Reason: conversation.TurnInterruptionUserRequested}
		})
	builder.trajectory(conversationID, stringPointer(turnID), conversation.TrajectoryEventTurnInterrupted, conversation.TrajectoryActorProvider,
		func(event *conversation.TrajectoryEvent) {
			event.TurnInterrupted = &conversation.TrajectoryTurnInterrupted{Reason: conversation.TurnInterruptionProviderInterrupted}
		})
	return ProjectionFixture{
		Name:        "blocked_and_cancelled",
		Description: "A disconnected then reconnected environment, an approval superseded by the provider, and a user cancellation confirmed by the provider.",
		Events:      builder.events,
	}
}

func (builder *fixtureBuilder) providerLifecycle(conversationID string, turnID string, lifecycle conversation.ProviderLifecycle) {
	builder.trajectory(conversationID, &turnID, conversation.TrajectoryEventProviderLifecycleChanged, conversation.TrajectoryActorProvider,
		func(event *conversation.TrajectoryEvent) {
			event.ProviderLifecycleChanged = &conversation.TrajectoryProviderLifecycleChanged{Lifecycle: lifecycle}
		})
}

func (builder *fixtureBuilder) validation(conversationID string, turnID string, validation conversation.TrajectoryValidation) {
	builder.trajectory(conversationID, &turnID, conversation.TrajectoryEventValidationRecorded, conversation.TrajectoryActorProvider,
		func(event *conversation.TrajectoryEvent) {
			event.ValidationRecorded = &conversation.TrajectoryValidationRecorded{Validation: validation}
		})
}

func stringPointer(value string) *string {
	return &value
}

func validationRiskPointer(value conversation.TrajectoryValidationRisk) *conversation.TrajectoryValidationRisk {
	return &value
}
