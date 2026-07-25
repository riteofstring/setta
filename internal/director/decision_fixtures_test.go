package director

// Deterministic decision contexts built from production contracts. Every test
// below starts from decisionContextFixture so an authority change fails once,
// loudly, rather than in a dozen hand-built literals.

const (
	fixtureIdleWorkstream     = "workstream-idle"
	fixtureActiveWorkstream   = "workstream-active"
	fixtureFailedWorkstream   = "workstream-failed"
	fixtureActiveRunID        = "run-active"
	fixtureForkRunID          = "run-completed"
	fixtureFailureEventID     = "event-turn-failed"
	fixtureWorkspaceID        = "workspace-setta"
	fixtureUnofferedWorkspace = "workspace-unoffered"
)

func folderlessDecisionScope() DecisionResourceScope {
	return DecisionResourceScope{Kind: WorkstreamResourceScopeFolderless}
}

func idleDecisionTarget() WorkstreamDecisionTarget {
	return WorkstreamDecisionTarget{
		WorkstreamID:  fixtureIdleWorkstream,
		Title:         "Parser rewrite",
		Status:        WorkstreamStatusIdle,
		ResourceScope: folderlessDecisionScope(),
		AllowedDecisionKinds: []DirectorDecisionKind{
			DirectorDecisionSelectWorkstream,
			DirectorDecisionSendToWorkstream,
		},
		AllowsChildWorkstream: true,
		ForkPoints: []DecisionForkPoint{{
			RunID:        fixtureForkRunID,
			InputExcerpt: "rewrite the tokenizer",
			CompletedAt:  "2026-07-24T10:00:00Z",
		}},
		RecoverableFailures: []DecisionRecoverableFailure{},
	}
}

func activeDecisionTarget() WorkstreamDecisionTarget {
	runID := fixtureActiveRunID
	return WorkstreamDecisionTarget{
		WorkstreamID:  fixtureActiveWorkstream,
		Title:         "Release notes",
		Status:        WorkstreamStatusRunning,
		ResourceScope: folderlessDecisionScope(),
		ActiveRunID:   &runID,
		AllowedDecisionKinds: []DirectorDecisionKind{
			DirectorDecisionSelectWorkstream,
			DirectorDecisionQueueBehindRun,
			DirectorDecisionSteerRun,
		},
		ForkPoints:          []DecisionForkPoint{},
		RecoverableFailures: []DecisionRecoverableFailure{},
	}
}

func failedDecisionTarget() WorkstreamDecisionTarget {
	return WorkstreamDecisionTarget{
		WorkstreamID:  fixtureFailedWorkstream,
		Title:         "Nightly import",
		Status:        WorkstreamStatusFailed,
		ResourceScope: folderlessDecisionScope(),
		AllowedDecisionKinds: []DirectorDecisionKind{
			DirectorDecisionSelectWorkstream,
			DirectorDecisionSendToWorkstream,
			DirectorDecisionRecoverPath,
		},
		ForkPoints: []DecisionForkPoint{},
		RecoverableFailures: []DecisionRecoverableFailure{{
			FailureEventID: fixtureFailureEventID,
			PublicSummary:  "the run ended before it finished importing",
			OccurredAt:     "2026-07-24T11:00:00Z",
		}},
	}
}

// decisionContextFixture authorizes every decision kind, so a test that needs
// a narrower context removes authority rather than assembling it.
func decisionContextFixture() DirectorDecisionContext {
	selected := fixtureIdleWorkstream
	return DirectorDecisionContext{
		Intent: SubmittedIntent{
			ID:          "intent-1",
			Text:        "keep going on the parser",
			Modality:    DecisionIntentModalityText,
			SubmittedAt: "2026-07-24T12:00:00Z",
		},
		SelectedID: &selected,
		Workspaces: []DecisionWorkspaceOption{{
			WorkspaceID:   fixtureWorkspaceID,
			WorkspaceName: "setta",
		}},
		Workstreams: []WorkstreamDecisionTarget{
			idleDecisionTarget(),
			activeDecisionTarget(),
			failedDecisionTarget(),
		},
		RecentDecisions:      []DecisionSummary{},
		AllowedDecisionKinds: DirectorDecisionKinds(),
	}
}

// singleTargetContextFixture leaves exactly one authorized way to put an
// intent into work.
func singleTargetContextFixture() DirectorDecisionContext {
	context := decisionContextFixture()
	context.SelectedID = nil
	context.Workstreams = []WorkstreamDecisionTarget{idleDecisionTarget()}
	context.AllowedDecisionKinds = []DirectorDecisionKind{
		DirectorDecisionCreateWorkstream,
		DirectorDecisionSendToWorkstream,
		DirectorDecisionSelectWorkstream,
	}
	return context
}

func sendDecisionFixture(workstreamID string) DirectorDecision {
	return DirectorDecision{
		Kind: DirectorDecisionSendToWorkstream,
		SendToWorkstream: &SendToWorkstreamDecision{
			WorkstreamID:  workstreamID,
			AuthoredInput: "keep going on the parser",
		},
	}
}

func createRootDecisionFixture(scope DecisionResourceScope) DirectorDecision {
	return DirectorDecision{
		Kind: DirectorDecisionCreateWorkstream,
		CreateWorkstream: &CreateWorkstreamDecision{
			Origin: WorkstreamCreationOrigin{
				Kind: WorkstreamCreationRoot,
				Root: &RootWorkstreamOrigin{ResourceScope: scope},
			},
			InitialInput:  "draft the migration",
			ProposedTitle: "Migration draft",
		},
	}
}
