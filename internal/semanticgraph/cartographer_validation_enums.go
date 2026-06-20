package semanticgraph

func isCartographerRunStatus(status CartographerRunStatus) bool {
	switch status {
	case CartographerRunQueued,
		CartographerRunRunning,
		CartographerRunCompletedNoop,
		CartographerRunApplied,
		CartographerRunPendingReview,
		CartographerRunFailed,
		CartographerRunSuperseded,
		CartographerRunCancelled,
		CartographerRunAbandoned,
		CartographerRunRejected:
		return true
	default:
		return false
	}
}

func isCartographerRunTriggerKind(kind CartographerRunTriggerKind) bool {
	switch kind {
	case CartographerTriggerManual, CartographerTriggerWorkflowWindow, CartographerTriggerWorkflowDone, CartographerTriggerExplicitRetry, CartographerTriggerExplicitReview:
		return true
	default:
		return false
	}
}

func isCartographerTaskProfile(profile CartographerTaskProfile) bool {
	switch profile {
	case CartographerTaskProfileLiveWindow,
		CartographerTaskProfileFinalSynthesis,
		CartographerTaskProfileManual,
		CartographerTaskProfileRetry,
		CartographerTaskProfileReview:
		return true
	default:
		return false
	}
}

func isSemanticCartographerModelSelection(selection SemanticCartographerModelSelection) bool {
	switch selection {
	case SemanticCartographerModelSelectionProviderDefault,
		SemanticCartographerModelSelectionExplicit:
		return true
	default:
		return false
	}
}

func isCartographerWindowStatus(status CartographerWindowStatus) bool {
	switch status {
	case CartographerWindowOpen, CartographerWindowClosed, CartographerWindowProcessed:
		return true
	default:
		return false
	}
}

func isCartographerSourceKind(kind CartographerSourceKind) bool {
	switch kind {
	case CartographerSourceWorkflowExecution, CartographerSourceChatRun, CartographerSourceSemanticTarget:
		return true
	default:
		return false
	}
}

func isCartographerTrajectoryEventSource(source CartographerTrajectoryEventSource) bool {
	switch source {
	case CartographerTrajectorySourceChat, CartographerTrajectorySourceWorkflow:
		return true
	default:
		return false
	}
}

func isCartographerWindowCloseReason(reason CartographerWindowCloseReason) bool {
	switch reason {
	case CartographerCloseNone,
		CartographerCloseRunItemTerminal,
		CartographerCloseApprovalRequired,
		CartographerCloseAssistantComplete,
		CartographerCloseAssistantThreshold,
		CartographerCloseOutputThreshold,
		CartographerCloseWorkflowNodeTerminal,
		CartographerCloseWorkflowRunTerminal,
		CartographerCloseQuietPeriod,
		CartographerCloseManual:
		return true
	default:
		return false
	}
}

func isCartographerObservationKind(kind CartographerObservationKind) bool {
	switch kind {
	case CartographerObservationPromptMessage,
		CartographerObservationAssistantMessageCompleted,
		CartographerObservationAssistantTextChunkAggregate,
		CartographerObservationCommandStarted,
		CartographerObservationCommandCompleted,
		CartographerObservationCommandFailed,
		CartographerObservationFileReadObserved,
		CartographerObservationFileChangeObserved,
		CartographerObservationDiffObserved,
		CartographerObservationTestResultObserved,
		CartographerObservationWorkflowNodeStarted,
		CartographerObservationWorkflowNodeCompleted,
		CartographerObservationApprovalRequested,
		CartographerObservationRunCompleted:
		return true
	default:
		return false
	}
}

func isCartographerPatchStatus(status CartographerPatchStatus) bool {
	switch status {
	case CartographerPatchProposed, CartographerPatchValidated, CartographerPatchPendingReview, CartographerPatchRejected, CartographerPatchApplied:
		return true
	default:
		return false
	}
}

func isCartographerPatchOperation(operation CartographerPatchOperation) bool {
	switch operation {
	case CartographerPatchRecordFinding,
		CartographerPatchRecordDecision,
		CartographerPatchRecordConstraint,
		CartographerPatchRecordOpenQuestion,
		CartographerPatchUpdateNodeSummary,
		CartographerPatchAttachEvidence,
		CartographerPatchCreateEdge,
		CartographerPatchStartActivity,
		CartographerPatchEndActivity,
		CartographerPatchSplitNode,
		CartographerPatchMergeNodes,
		CartographerPatchMarkResolved:
		return true
	default:
		return false
	}
}

func isCartographerPatchNodeScope(scope CartographerPatchNodeScope) bool {
	switch scope {
	case CartographerPatchNodeScopeSession, CartographerPatchNodeScopeWorkspace:
		return true
	default:
		return false
	}
}

func isCartographerDiagnosticSeverity(severity CartographerDiagnosticSeverity) bool {
	switch severity {
	case CartographerDiagnosticInfo, CartographerDiagnosticWarning, CartographerDiagnosticError:
		return true
	default:
		return false
	}
}
