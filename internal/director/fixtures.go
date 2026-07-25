package director

import (
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
		validationAndInterpretationFixture(),
		blockedAndCancelledFixture(),
	}
}

// fixtureBuilder assigns stream positions, event ids, and timestamps so a
// history reads as the sequence of facts it is rather than as bookkeeping.
type fixtureBuilder struct {
	events              []ProjectorEvent
	trajectorySequences map[string]int
	tick                int
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
		WorkstreamID: workstreamID,
		Actor:        actor,
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

// register admits a workstream and selects it, which is how every history
// starts: the app has an app-scoped owner for the work before any work happens.
func (builder *fixtureBuilder) register(workstreamID string, conversationID string, title string, scope WorkstreamResourceScope) {
	builder.director(workstreamID, DirectorFactWorkstreamRegistered, SemanticActorSystem, func(fact *DirectorFactEvent) {
		fact.WorkstreamRegistered = &DirectorWorkstreamRegistered{
			Title:          title,
			ConversationID: conversationID,
			ResourceScope:  scope,
		}
	})
	builder.director(workstreamID, DirectorFactWorkstreamSelected, SemanticActorUser, func(fact *DirectorFactEvent) {
		fact.WorkstreamSelected = &DirectorWorkstreamSelected{}
	})
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

func folderlessScope() WorkstreamResourceScope {
	return WorkstreamResourceScope{Kind: WorkstreamResourceScopeFolderless}
}

func folderScope(workspaceID string, rootPath string) WorkstreamResourceScope {
	return WorkstreamResourceScope{
		Kind:   WorkstreamResourceScopeFolder,
		Folder: &FolderResourceBinding{WorkspaceID: workspaceID, RootPath: rootPath},
	}
}

// folderlessStartFixture is the product's first promise: open the app with no
// folder chosen and get useful work immediately.
func folderlessStartFixture() ProjectionFixture {
	builder := &fixtureBuilder{}
	const workstreamID = "ws-alpha"
	const conversationID = "conv-alpha"
	const turnID = "turn-alpha-1"
	builder.register(workstreamID, conversationID, "Summarize the release notes", folderlessScope())
	builder.acceptInput(conversationID, turnID, "Summarize the release notes")
	builder.director(workstreamID, DirectorFactDecisionCommitted, SemanticActorDirector, func(fact *DirectorFactEvent) {
		target := workstreamID
		fact.RunID = stringPointer(turnID)
		fact.DecisionCommitted = &DirectorDecisionCommitted{
			Decision:           DirectorDecisionSendToWorkstream,
			PublicSummary:      "Send the summary request to this workstream",
			TargetWorkstreamID: &target,
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
				Kind:       conversation.ArtifactKindMarkdown,
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
	const workstreamID = "ws-beta"
	const conversationID = "conv-beta"
	const firstTurn = "turn-beta-1"
	const secondTurn = "turn-beta-2"
	builder.register(workstreamID, conversationID, "Refactor the importer", folderScope("workspace-beta", "/repo/beta"))
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
	const workstreamID = "ws-gamma"
	const conversationID = "conv-gamma"
	const turnID = "turn-gamma-1"
	const approvalID = "approval-gamma-1"
	const itemID = "item-gamma-1"
	builder.register(workstreamID, conversationID, "Fix the parser", folderScope("workspace-gamma", "/repo/gamma"))
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
	const workstreamID = "ws-delta"
	const conversationID = "conv-delta"
	const turnID = "turn-delta-1"
	builder.register(workstreamID, conversationID, "Research the migration", folderlessScope())
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

// delegationFixture covers both delegations the product has: a durable child
// workstream, and a provider subagent that never earns its own address.
func delegationFixture() ProjectionFixture {
	builder := &fixtureBuilder{}
	const parentID = "ws-parent"
	const childID = "ws-child"
	const parentConversation = "conv-parent"
	const childConversation = "conv-child"
	const parentTurn = "turn-parent-1"
	const childTurn = "turn-child-1"
	builder.register(parentID, parentConversation, "Ship the release", folderScope("workspace-parent", "/repo/parent"))
	builder.acceptInput(parentConversation, parentTurn, "Ship the release")
	builder.startTurn(parentConversation, parentTurn)
	builder.director(parentID, DirectorFactDecisionCommitted, SemanticActorDirector, func(fact *DirectorFactEvent) {
		target := childID
		fact.RunID = stringPointer(parentTurn)
		fact.DecisionCommitted = &DirectorDecisionCommitted{
			Decision:           DirectorDecisionCreateWorkstream,
			PublicSummary:      "Delegate the changelog to its own workstream",
			TargetWorkstreamID: &target,
		}
	})
	builder.director(childID, DirectorFactWorkstreamRegistered, SemanticActorDirector, func(fact *DirectorFactEvent) {
		parent := parentID
		fact.WorkstreamRegistered = &DirectorWorkstreamRegistered{
			Title:          "Update the changelog",
			ConversationID: childConversation,
			ParentID:       &parent,
			ResourceScope:  folderScope("workspace-parent", "/repo/parent"),
		}
	})
	builder.acceptInput(childConversation, childTurn, "Update the changelog")
	builder.startTurn(childConversation, childTurn)
	subagent := conversation.Subagent{
		ID:               "subagent-parent-1",
		ProviderThreadID: "provider-thread-1",
		Status:           conversation.SubagentStatusRunning,
		Message:          stringPointer("Checking the tag history"),
	}
	builder.trajectory(parentConversation, stringPointer(parentTurn), conversation.TrajectoryEventSubagentStarted, conversation.TrajectoryActorAgent,
		func(event *conversation.TrajectoryEvent) {
			event.SubagentStarted = &conversation.TrajectorySubagentStarted{Subagent: subagent}
		})
	completed := subagent
	completed.Status = conversation.SubagentStatusCompleted
	completed.Message = stringPointer("Tag history is clean")
	builder.trajectory(parentConversation, stringPointer(parentTurn), conversation.TrajectoryEventSubagentCompleted, conversation.TrajectoryActorAgent,
		func(event *conversation.TrajectoryEvent) {
			event.SubagentCompleted = &conversation.TrajectorySubagentCompleted{Subagent: completed}
		})
	builder.completeTurn(childConversation, childTurn)
	builder.completeTurn(parentConversation, parentTurn)
	return ProjectionFixture{
		Name:        "delegation",
		Description: "A decision that delegates to a child workstream, plus a provider subagent inside the parent run.",
		Events:      builder.events,
	}
}

// failureAndRecoveryFixture covers the path the product must never show as an
// internal error: work fails, trusted code retries, and the run recovers.
func failureAndRecoveryFixture() ProjectionFixture {
	builder := &fixtureBuilder{}
	const workstreamID = "ws-epsilon"
	const conversationID = "conv-epsilon"
	const failedTurn = "turn-epsilon-1"
	const retriedTurn = "turn-epsilon-2"
	builder.register(workstreamID, conversationID, "Build the installer", folderScope("workspace-epsilon", "/repo/epsilon"))
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
					Reason:      "Rerouted after a capacity error",
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

// resourceRequestFixture covers work that cannot start until the user supplies a
// resource, which is the case the old routing-failure affordance could not
// render without a pane.
func resourceRequestFixture() ProjectionFixture {
	builder := &fixtureBuilder{}
	const workstreamID = "ws-zeta"
	const conversationID = "conv-zeta"
	const turnID = "turn-zeta-1"
	const requestID = "resource-zeta-1"
	builder.register(workstreamID, conversationID, "Run the test suite", folderlessScope())
	builder.acceptInput(conversationID, turnID, "Run the test suite")
	builder.director(workstreamID, DirectorFactDecisionCommitted, SemanticActorDirector, func(fact *DirectorFactEvent) {
		target := workstreamID
		fact.DecisionCommitted = &DirectorDecisionCommitted{
			Decision:           DirectorDecisionSendToWorkstream,
			PublicSummary:      "Run the tests in this workstream",
			TargetWorkstreamID: &target,
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
		Folder: &FolderResourceBinding{WorkspaceID: "workspace-zeta", RootPath: "/repo/zeta"},
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
		Description: "Folderless work blocked on a durable resource request, then unblocked by the folder the user chose.",
		Events:      builder.events,
	}
}

// validationAndInterpretationFixture covers the two facts that keep model output
// honest: what was checked before it took effect, and what the Director
// concluded from facts the app already committed.
func validationAndInterpretationFixture() ProjectionFixture {
	builder := &fixtureBuilder{}
	const workstreamID = "ws-eta"
	const conversationID = "conv-eta"
	const turnID = "turn-eta-1"
	builder.register(workstreamID, conversationID, "Audit the dependencies", folderScope("workspace-eta", "/repo/eta"))
	inputEventID := builder.acceptInput(conversationID, turnID, "Audit the dependencies")
	decisionEventID := builder.director(workstreamID, DirectorFactDecisionCommitted, SemanticActorDirector, func(fact *DirectorFactEvent) {
		target := workstreamID
		fact.RunID = stringPointer(turnID)
		fact.DecisionCommitted = &DirectorDecisionCommitted{
			Decision:           DirectorDecisionSendToWorkstream,
			PublicSummary:      "Audit dependencies in this workstream",
			TargetWorkstreamID: &target,
		}
	})
	builder.director(workstreamID, DirectorFactValidationRecorded, SemanticActorSystem, func(fact *DirectorFactEvent) {
		fact.RunID = stringPointer(turnID)
		fact.ValidationRecorded = &DirectorValidationRecorded{
			ValidationID:   "validation-eta-1",
			Outcome:        DirectorValidationPassed,
			SubjectEventID: decisionEventID,
			PublicSummary:  "The routing decision named an authorized workstream",
		}
	})
	builder.startTurn(conversationID, turnID)
	builder.director(workstreamID, DirectorFactInterpretationPublished, SemanticActorDirector, func(fact *DirectorFactEvent) {
		fact.RunID = stringPointer(turnID)
		confidence := 0.8
		fact.InterpretationPublished = &DirectorInterpretationPublished{
			InterpretationID: "interpretation-eta-1",
			PublicSummary:    "The audit will need a second pass for transitive pins",
			Metadata: InterpretationMetadata{
				InterpretedBy: SemanticActorDirector,
				Model: InterpretationModelIdentity{
					Provider:  "codex",
					Model:     "gpt-5.1-codex",
					RuntimeID: "runtime-eta-1",
				},
				Confidence:    &confidence,
				InterpretedAt: fixtureEpoch.Format(time.RFC3339Nano),
			},
			InterpretedEventIDs: []string{inputEventID, decisionEventID},
		}
	})
	builder.completeTurn(conversationID, turnID)
	return ProjectionFixture{
		Name:        "validation_and_interpretation",
		Description: "A validated routing decision and a sourced Director interpretation alongside runtime facts.",
		Events:      builder.events,
	}
}

// blockedAndCancelledFixture covers the lifecycle facts that tell the user the
// app is stuck: a lost agent, an unavailable provider, and a cancelled run.
func blockedAndCancelledFixture() ProjectionFixture {
	builder := &fixtureBuilder{}
	const workstreamID = "ws-theta"
	const conversationID = "conv-theta"
	const turnID = "turn-theta-1"
	builder.register(workstreamID, conversationID, "Deploy the preview", folderScope("workspace-theta", "/repo/theta"))
	builder.acceptInput(conversationID, turnID, "Deploy the preview")
	builder.startTurn(conversationID, turnID)
	builder.liveness(conversationID, turnID, conversation.AgentLiveness{
		Status:    conversation.AgentLivenessLost,
		Reason:    conversation.AgentLivenessReasonProviderInactive,
		Retryable: true,
		Message:   "Lost the provider attachment for this run",
	})
	builder.liveness(conversationID, turnID, conversation.AgentLiveness{
		Status:  conversation.AgentLivenessReconciling,
		Reason:  conversation.AgentLivenessReasonStreamResync,
		Message: "Reattaching to the provider run",
	})
	builder.liveness(conversationID, turnID, conversation.AgentLiveness{
		Status:  conversation.AgentLivenessAttached,
		Reason:  conversation.AgentLivenessReasonProviderTurnLinked,
		Message: "Provider run reattached",
	})
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
	return ProjectionFixture{
		Name:        "blocked_and_cancelled",
		Description: "A lost agent, a reconciliation, a disconnected then reconnected environment, an approval superseded by the provider, and a user cancellation.",
		Events:      builder.events,
	}
}

func (builder *fixtureBuilder) liveness(conversationID string, turnID string, liveness conversation.AgentLiveness) {
	builder.trajectory(conversationID, &turnID, conversation.TrajectoryEventAgentLivenessChanged, conversation.TrajectoryActorSystem,
		func(event *conversation.TrajectoryEvent) {
			event.AgentLivenessChanged = &conversation.TrajectoryAgentLivenessChanged{Liveness: liveness}
		})
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
