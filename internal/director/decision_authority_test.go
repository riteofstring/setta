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
				DirectorDecisionCreateWorkstream,
				DirectorDecisionSelectWorkstream,
			}
		}},
		{"recent decision names an unlisted workstream", func(context *DirectorDecisionContext) {
			missing := "workstream-missing"
			context.RecentDecisions = []DecisionSummary{{
				IntentID:           "intent-0",
				Decision:           DirectorDecisionSelectWorkstream,
				TargetWorkstreamID: &missing,
				DecidedAt:          "2026-07-24T11:59:00Z",
			}}
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
			target.AllowedDecisionKinds = append(target.AllowedDecisionKinds, DirectorDecisionCreateWorkstream)
		}},
		{"archived workstream offered as a target", func(target *WorkstreamDecisionTarget) {
			target.Status = WorkstreamStatusArchived
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
		detail   string
	}{
		{
			name:     "workstream outside the offered set",
			decision: sendDecisionFixture("workstream-missing"),
			detail:   "was not supplied by authoritative context",
		},
		{
			name:     "action the target does not allow",
			decision: sendDecisionFixture(fixtureActiveWorkstream),
			detail:   "does not allow",
		},
		{
			name: "steering a workstream with no active run",
			decision: DirectorDecision{Kind: DirectorDecisionSteerRun, SteerRun: &SteerRunDecision{
				WorkstreamID: fixtureIdleWorkstream, AuthoredInput: "change course",
			}},
			detail: "does not allow",
		},
		{
			name: "recovering a failure the workstream does not own",
			decision: DirectorDecision{Kind: DirectorDecisionRecoverPath, RecoverPath: &RecoverPathDecision{
				WorkstreamID: fixtureFailedWorkstream, FailureEventID: "event-other",
			}},
			detail: "is not recoverable on workstream",
		},
		{
			name: "recovering a workstream that has not failed",
			decision: DirectorDecision{Kind: DirectorDecisionRecoverPath, RecoverPath: &RecoverPathDecision{
				WorkstreamID: fixtureIdleWorkstream, FailureEventID: fixtureFailureEventID,
			}},
			detail: "does not allow",
		},
		{
			name: "scoping a new workstream to an unoffered folder",
			decision: createRootDecisionFixture(DecisionResourceScope{
				Kind:   WorkstreamResourceScopeFolder,
				Folder: &DecisionFolderResource{WorkspaceID: fixtureUnofferedWorkspace},
			}),
			detail: "is not an offered folder resource",
		},
		{
			name: "two payloads for one kind",
			decision: DirectorDecision{
				Kind:             DirectorDecisionSelectWorkstream,
				SelectWorkstream: &SelectWorkstreamDecision{WorkstreamID: fixtureIdleWorkstream},
				RecoverPath: &RecoverPathDecision{
					WorkstreamID:   fixtureFailedWorkstream,
					FailureEventID: fixtureFailureEventID,
				},
			},
			detail: "must",
		},
		{
			name:     "a kind outside the catalog",
			decision: DirectorDecision{Kind: "ask_narrator"},
			detail:   "unknown director decision kind",
		},
		{
			name: "an unknown workspace requirement",
			decision: DirectorDecision{
				Kind: DirectorDecisionSendToWorkstream,
				SendToWorkstream: &SendToWorkstreamDecision{
					WorkstreamID:         fixtureIdleWorkstream,
					AuthoredInput:        "keep going on the parser",
					WorkspaceRequirement: "sometimes",
				},
			},
			detail: "workspace requirement \"sometimes\" is unknown",
		},
	}
	context := decisionContextFixture()
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			err := ValidateDecisionAuthority(context, testCase.decision)
			assertRejection(t, err, testCase.detail)
		})
	}
}

func TestDecisionAuthorityRejectsKindsTheContextWithheld(t *testing.T) {
	context := singleTargetContextFixture()
	decision := DirectorDecision{Kind: DirectorDecisionRecoverPath, RecoverPath: &RecoverPathDecision{
		WorkstreamID: fixtureIdleWorkstream, FailureEventID: fixtureFailureEventID,
	}}
	assertRejection(t, ValidateDecisionAuthority(context, decision), "is not allowed by the supplied context")
}

func TestDecisionAuthorityRejectsAStaleContext(t *testing.T) {
	context := decisionContextFixture()
	context.Intent.Text = ""
	assertRejection(
		t,
		ValidateDecisionAuthority(context, sendDecisionFixture(fixtureIdleWorkstream)),
		"director decision intent text is required",
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
		createRootDecisionFixture(folderlessDecisionScope()),
		sendDecisionFixture(fixtureIdleWorkstream),
		{Kind: DirectorDecisionQueueBehindRun, QueueBehindRun: &QueueBehindRunDecision{
			WorkstreamID:         fixtureActiveWorkstream,
			AuthoredInput:        "then publish it",
			WorkspaceRequirement: WorkspaceOptional,
		}},
		{Kind: DirectorDecisionSteerRun, SteerRun: &SteerRunDecision{
			WorkstreamID: fixtureActiveWorkstream, AuthoredInput: "shorter, please",
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
	}
	if len(covered) != len(DirectorDecisionKinds()) {
		t.Fatalf("the fixture set covers %d kinds but the catalog has %d",
			len(covered), len(DirectorDecisionKinds()))
	}
}

// assertRejection proves an unauthorized call was refused specifically. The
// sentence is what Setta hands back to the Director as its own tool result, so
// the reason has to name what was wrong rather than only that something was.
func assertRejection(t *testing.T, err error, detail string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected a rejection mentioning %q but the decision was accepted", detail)
	}
	if !errors.Is(err, ErrDirectorIntentRejected) {
		t.Fatalf("expected a rejected intent, got %v", err)
	}
	if !strings.Contains(err.Error(), detail) {
		t.Fatalf("rejection %v does not mention %q", err, detail)
	}
}
