// Package project owns the canonical initial Python Canvas project state.
package project

import "github.com/setta/python-canvas/backend/internal/contracts"

const (
	initialProjectID       = "project:python-canvas"
	initialProjectRevision = 1
	squareRootCallableID   = "callable:square-root"
	squareRootCallableName = "Square Root"
	pythonPrefix           = "import math"
	pythonSuffix           = "state = SettaState()"
	initialGeneratedCode   = pythonPrefix + "\n\n" + pythonSuffix
)

// InitialProjectSnapshot is the sole canonical V1 document until a later
// phase introduces a real project store.
func InitialProjectSnapshot() contracts.ProjectSnapshotV1 {
	return contracts.ProjectSnapshotV1{
		Version: contracts.ProjectSnapshotVersionV1,
		Project: contracts.ProjectV1{
			ID:       initialProjectID,
			Revision: initialProjectRevision,
		},
		PythonTarget: contracts.PythonTargetV1{
			Prefix: pythonPrefix,
			Suffix: pythonSuffix,
		},
		Callables: []contracts.CallableV1{{
			ID:                 squareRootCallableID,
			Name:               squareRootCallableName,
			AuthoredExpression: "",
			ParameterIDs:       []string{},
		}},
		Parameters: []contracts.ParameterV1{},
		GeneratedCode: contracts.GeneratedCodeV1{
			Code:         initialGeneratedCode,
			Body:         "",
			SourceRanges: []contracts.GeneratedSourceRangeV1{},
		},
		Diagnostics: []contracts.DiagnosticV1{},
		ProviderStatus: contracts.ProviderStatusV1{
			Provider: contracts.ProviderBasedpyrightV1,
			Status:   contracts.ProviderAvailabilityUnavailableV1,
			State:    contracts.ProviderLifecycleStateNotStartedV1,
		},
	}
}
