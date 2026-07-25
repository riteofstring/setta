package director

import (
	"errors"
	"strings"
	"testing"
)

func TestDecisionContextFixtureIsAuthoritative(t *testing.T) {
	if err := decisionContextFixture().Validate(); err != nil {
		t.Fatalf("the decision context fixture must validate: %v", err)
	}
	if err := singleTargetContextFixture().Validate(); err != nil {
		t.Fatalf("the single-target fixture must validate: %v", err)
	}
}

func TestDecisionContextRejectsUnbackedAuthority(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(*DirectorDecisionContext)
	}{
		{"wrong envelope kind", func(context *DirectorDecisionContext) {
			context.Kind = "master_route"
		}},
		{"task text rewritten", func(context *DirectorDecisionContext) {
			context.Task.Directive = "route however you like"
		}},
		{"selection outside the offered set", func(context *DirectorDecisionContext) {
			missing := "workstream-missing"
			context.SelectedID = &missing
		}},
		{"repeated workstream", func(context *DirectorDecisionContext) {
			context.Workstreams = append(context.Workstreams, idleDecisionTarget())
		}},
		{"repeated workspace", func(context *DirectorDecisionContext) {
			context.Workspaces = append(context.Workspaces, context.Workspaces[0])
		}},
		{"kind allowed with no target", func(context *DirectorDecisionContext) {
			context.Workstreams = []WorkstreamDecisionTarget{idleDecisionTarget()}
		}},
		{"target allows a kind the context does not", func(context *DirectorDecisionContext) {
			context.AllowedDecisionKinds = []DirectorDecisionKind{
				DirectorDecisionAnswerDirectly,
				DirectorDecisionSelectWorkstream,
			}
		}},
		{"clarification names an unlisted candidate", func(context *DirectorDecisionContext) {
			context.Clarification = &DecisionClarificationContext{
				DecisionID:             "decision-1",
				IntentID:               "intent-0",
				Question:               "which one?",
				CandidateWorkstreamIDs: []string{"workstream-missing"},
			}
		}},
		{"null collections", func(context *DirectorDecisionContext) {
			context.RecentDecisions = nil
		}},
		{"voice modality misspelled", func(context *DirectorDecisionContext) {
			context.Intent.Modality = "speech"
		}},
		{"unnormalized timestamp", func(context *DirectorDecisionContext) {
			context.Intent.SubmittedAt = "2026-07-24T12:00:00+02:00"
		}},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			context := decisionContextFixture()
			testCase.mutate(&context)
			if err := context.Validate(); err == nil {
				t.Fatalf("%s must be rejected", testCase.name)
			}
		})
	}
}

func TestDecisionTargetAuthorityMatchesRunState(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(*WorkstreamDecisionTarget)
	}{
		{"send offered while a run is active", func(target *WorkstreamDecisionTarget) {
			runID := fixtureActiveRunID
			target.ActiveRunID = &runID
		}},
		{"steer offered with no active run", func(target *WorkstreamDecisionTarget) {
			target.AllowedDecisionKinds = append(target.AllowedDecisionKinds, DirectorDecisionSteerRun)
		}},
		{"queue offered with no active run", func(target *WorkstreamDecisionTarget) {
			target.AllowedDecisionKinds = append(target.AllowedDecisionKinds, DirectorDecisionQueueBehindRun)
		}},
		{"queue withheld while a run is active", func(target *WorkstreamDecisionTarget) {
			runID := fixtureActiveRunID
			target.ActiveRunID = &runID
			target.AllowedDecisionKinds = []DirectorDecisionKind{
				DirectorDecisionSelectWorkstream,
				DirectorDecisionSteerRun,
			}
		}},
		{"steer withheld while a run is active", func(target *WorkstreamDecisionTarget) {
			runID := fixtureActiveRunID
			target.ActiveRunID = &runID
			target.AllowedDecisionKinds = []DirectorDecisionKind{
				DirectorDecisionSelectWorkstream,
				DirectorDecisionQueueBehindRun,
			}
		}},
		{"recovery offered with no recoverable failure", func(target *WorkstreamDecisionTarget) {
			target.AllowedDecisionKinds = append(target.AllowedDecisionKinds, DirectorDecisionRecoverPath)
		}},
		{"recoverable failure offered without recovery", func(target *WorkstreamDecisionTarget) {
			target.RecoverableFailures = []DecisionRecoverableFailure{{
				FailureEventID: fixtureFailureEventID,
				PublicSummary:  "it failed",
				OccurredAt:     "2026-07-24T11:00:00Z",
			}}
		}},
		{"selection withheld", func(target *WorkstreamDecisionTarget) {
			target.AllowedDecisionKinds = []DirectorDecisionKind{DirectorDecisionSendToWorkstream}
		}},
		{"global kind offered as target authority", func(target *WorkstreamDecisionTarget) {
			target.AllowedDecisionKinds = append(target.AllowedDecisionKinds, DirectorDecisionAnswerDirectly)
		}},
		{"archived workstream offered as a target", func(target *WorkstreamDecisionTarget) {
			target.Status = WorkstreamStatusArchived
		}},
		{"repeated fork point", func(target *WorkstreamDecisionTarget) {
			target.ForkPoints = append(target.ForkPoints, target.ForkPoints[0])
		}},
		{"null fork points", func(target *WorkstreamDecisionTarget) {
			target.ForkPoints = nil
		}},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			target := idleDecisionTarget()
			testCase.mutate(&target)
			if err := target.Validate(); err == nil {
				t.Fatalf("%s must be rejected", testCase.name)
			}
		})
	}
}

func TestDecisionAuthorityRejectsUnauthorizedDecisions(t *testing.T) {
	cases := []struct {
		name     string
		decision DirectorDecision
		reason   DecisionRejectionReason
	}{
		{
			name:     "workstream outside the offered set",
			decision: sendDecisionFixture("workstream-missing"),
			reason:   DecisionRejectedUnknownTarget,
		},
		{
			name:     "action the target does not allow",
			decision: sendDecisionFixture(fixtureActiveWorkstream),
			reason:   DecisionRejectedUnauthorizedTarget,
		},
		{
			name: "steering a workstream with no active run",
			decision: DirectorDecision{Kind: DirectorDecisionSteerRun, SteerRun: &SteerRunDecision{
				WorkstreamID: fixtureIdleWorkstream, AuthoredInput: "change course",
			}},
			reason: DecisionRejectedUnauthorizedTarget,
		},
		{
			name: "recovering a failure the workstream does not own",
			decision: DirectorDecision{Kind: DirectorDecisionRecoverPath, RecoverPath: &RecoverPathDecision{
				WorkstreamID: fixtureFailedWorkstream, FailureEventID: "event-other",
			}},
			reason: DecisionRejectedUnauthorizedFailure,
		},
		{
			name: "recovering a workstream that has not failed",
			decision: DirectorDecision{Kind: DirectorDecisionRecoverPath, RecoverPath: &RecoverPathDecision{
				WorkstreamID: fixtureIdleWorkstream, FailureEventID: fixtureFailureEventID,
			}},
			reason: DecisionRejectedUnauthorizedTarget,
		},
		{
			name: "scoping a new workstream to an unoffered folder",
			decision: createRootDecisionFixture(DecisionResourceScope{
				Kind:   WorkstreamResourceScopeFolder,
				Folder: &DecisionFolderResource{WorkspaceID: fixtureUnofferedWorkspace},
			}),
			reason: DecisionRejectedUnauthorizedResourceScope,
		},
		{
			name: "forking a run that is not a fork point",
			decision: DirectorDecision{
				Kind: DirectorDecisionCreateWorkstream,
				CreateWorkstream: &CreateWorkstreamDecision{
					Origin: WorkstreamCreationOrigin{
						Kind: WorkstreamCreationFork,
						Fork: &ForkWorkstreamOrigin{
							ParentWorkstreamID: fixtureIdleWorkstream,
							ForkedAtRunID:      "run-imagined",
						},
					},
					InitialInput:  "try the other approach",
					ProposedTitle: "Alternate parser",
				},
			},
			reason: DecisionRejectedUnauthorizedForkPoint,
		},
		{
			name: "hanging a child off a workstream that does not accept one",
			decision: DirectorDecision{
				Kind: DirectorDecisionCreateWorkstream,
				CreateWorkstream: &CreateWorkstreamDecision{
					Origin: WorkstreamCreationOrigin{
						Kind:  WorkstreamCreationChild,
						Child: &ChildWorkstreamOrigin{ParentWorkstreamID: fixtureActiveWorkstream},
					},
					InitialInput:  "chase the tangent",
					ProposedTitle: "Tangent",
				},
			},
			reason: DecisionRejectedUnauthorizedTarget,
		},
		{
			name: "two payloads for one kind",
			decision: DirectorDecision{
				Kind:             DirectorDecisionAnswerDirectly,
				AnswerDirectly:   &AnswerDirectlyDecision{Text: "all good"},
				SelectWorkstream: &SelectWorkstreamDecision{WorkstreamID: fixtureIdleWorkstream},
			},
			reason: DecisionRejectedInvalidPayload,
		},
		{
			name:     "a kind outside the catalog",
			decision: DirectorDecision{Kind: "ask_narrator"},
			reason:   DecisionRejectedUnknownKind,
		},
	}
	context := decisionContextFixture()
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			err := ValidateDecisionAuthority(context, testCase.decision)
			assertRejection(t, err, testCase.reason)
		})
	}
}

func TestDecisionAuthorityRejectsKindsTheContextWithheld(t *testing.T) {
	context := singleTargetContextFixture()
	decision := DirectorDecision{Kind: DirectorDecisionRecoverPath, RecoverPath: &RecoverPathDecision{
		WorkstreamID: fixtureIdleWorkstream, FailureEventID: fixtureFailureEventID,
	}}
	assertRejection(t, ValidateDecisionAuthority(context, decision), DecisionRejectedUnauthorizedKind)
}

func TestDecisionAuthorityRejectsAStaleContext(t *testing.T) {
	context := decisionContextFixture()
	context.Intent.Text = ""
	assertRejection(
		t,
		ValidateDecisionAuthority(context, sendDecisionFixture(fixtureIdleWorkstream)),
		DecisionRejectedStaleContext,
	)
}

func TestDecisionAuthorityAcceptsEveryAuthorizedKind(t *testing.T) {
	context := decisionContextFixture()
	for _, decision := range authorizedDecisionsForFixture() {
		if err := ValidateDecisionAuthority(context, decision); err != nil {
			t.Fatalf("decision %q must be authorized by the fixture: %v", decision.Kind, err)
		}
	}
}

// authorizedDecisionsForFixture returns one valid decision per catalog kind
// against decisionContextFixture. The coverage test below proves it stays
// exhaustive, so a new decision kind cannot ship without a decode, schema, and
// authority path.
func authorizedDecisionsForFixture() []DirectorDecision {
	return []DirectorDecision{
		{Kind: DirectorDecisionAnswerDirectly, AnswerDirectly: &AnswerDirectlyDecision{
			Text: "Two workstreams are running and nothing is blocked.",
		}},
		createRootDecisionFixture(folderlessDecisionScope()),
		sendDecisionFixture(fixtureIdleWorkstream),
		{Kind: DirectorDecisionQueueBehindRun, QueueBehindRun: &QueueBehindRunDecision{
			WorkstreamID: fixtureActiveWorkstream, AuthoredInput: "then publish it",
		}},
		{Kind: DirectorDecisionSteerRun, SteerRun: &SteerRunDecision{
			WorkstreamID: fixtureActiveWorkstream, AuthoredInput: "shorter, please",
		}},
		{Kind: DirectorDecisionAskClarification, AskClarification: &AskClarificationDecision{
			Question: "Should I steer the running work or queue this after it?",
		}},
		{Kind: DirectorDecisionSelectWorkstream, SelectWorkstream: &SelectWorkstreamDecision{
			WorkstreamID: fixtureActiveWorkstream,
		}},
		{Kind: DirectorDecisionRecoverPath, RecoverPath: &RecoverPathDecision{
			WorkstreamID: fixtureFailedWorkstream, FailureEventID: fixtureFailureEventID,
		}},
	}
}

func TestDecisionCatalogIsFullyCovered(t *testing.T) {
	covered := map[DirectorDecisionKind]bool{}
	for _, decision := range authorizedDecisionsForFixture() {
		covered[decision.Kind] = true
	}
	for _, kind := range DirectorDecisionKinds() {
		if !covered[kind] {
			t.Fatalf("decision kind %q has no authorized fixture", kind)
		}
		if decisionSchemaDescriptions[kind] == "" {
			t.Fatalf("decision kind %q has no schema description", kind)
		}
	}
	if len(covered) != len(DirectorDecisionKinds()) {
		t.Fatalf("the fixture set covers %d kinds but the catalog has %d",
			len(covered), len(DirectorDecisionKinds()))
	}
}

func TestDecisionContextRejectsClarificationWithoutWorkAuthority(t *testing.T) {
	context := selectionOnlyContextFixture()
	context.AllowedDecisionKinds = append(
		context.AllowedDecisionKinds,
		DirectorDecisionAskClarification,
	)
	if err := context.Validate(); err == nil ||
		!strings.Contains(err.Error(), "no work outcome") {
		t.Fatalf("clarification-only context error = %v", err)
	}
}

func assertRejection(t *testing.T, err error, expected DecisionRejectionReason) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected rejection %q but the decision was accepted", expected)
	}
	var rejection *DecisionRejection
	if !errors.As(err, &rejection) {
		t.Fatalf("expected a typed rejection, got %v", err)
	}
	if rejection.Reason != expected {
		t.Fatalf("expected rejection %q, got %q (%v)", expected, rejection.Reason, err)
	}
}
