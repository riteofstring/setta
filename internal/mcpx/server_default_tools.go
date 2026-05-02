package mcpx

import (
	"setta/internal/projectstate"
	"setta/internal/tools"
)

func defaultToolDefinitions(
	server *Server,
	workspaceRoot string,
	registry *tools.Registry,
	projectState projectStateProvider,
	codegenTargetValidator projectstate.CodegenTargetValidator,
	pythonCodegenSectionReconciler projectstate.PythonCodegenSectionReconciler,
	codeUpdates codeUpdateProvider,
	settingsState settingsStateProvider,
	sectionNames sectionNameProvider,
	callableSignatures projectstate.CallableSignatureResolver,
	lspDiagnostics lspDiagnosticsProvider,
	stateMachineRuns stateMachineRunProvider,
) []toolDefinition {
	definitions := defaultBaseToolDefinitions(
		server,
		workspaceRoot,
		registry,
		projectState,
		codegenTargetValidator,
		pythonCodegenSectionReconciler,
		codeUpdates,
		settingsState,
		sectionNames,
		callableSignatures,
		lspDiagnostics,
		stateMachineRuns,
	)
	if projectState != nil {
		definitions = append(definitions, defaultProjectUIToolDefinitions(
			server,
			workspaceRoot,
			registry,
			projectState,
			codegenTargetValidator,
			pythonCodegenSectionReconciler,
			codeUpdates,
			settingsState,
			sectionNames,
			callableSignatures,
			lspDiagnostics,
			stateMachineRuns,
		)...)
		definitions = append(definitions, defaultProjectStructureToolDefinitions(
			server,
			workspaceRoot,
			registry,
			projectState,
			codegenTargetValidator,
			pythonCodegenSectionReconciler,
			codeUpdates,
			settingsState,
			sectionNames,
			callableSignatures,
			lspDiagnostics,
			stateMachineRuns,
		)...)
		definitions = append(definitions, defaultProjectLayoutToolDefinitions(
			server,
			workspaceRoot,
			registry,
			projectState,
			codegenTargetValidator,
			pythonCodegenSectionReconciler,
			codeUpdates,
			settingsState,
			sectionNames,
			callableSignatures,
			lspDiagnostics,
			stateMachineRuns,
		)...)
		definitions = append(definitions, defaultProjectCodeToolDefinitions(
			server,
			workspaceRoot,
			registry,
			projectState,
			codegenTargetValidator,
			pythonCodegenSectionReconciler,
			codeUpdates,
			settingsState,
			sectionNames,
			callableSignatures,
			lspDiagnostics,
			stateMachineRuns,
		)...)
	}
	if projectState != nil && lspDiagnostics != nil {
		definitions = append(definitions, defaultProjectParamToolDefinitions(
			server,
			workspaceRoot,
			registry,
			projectState,
			codegenTargetValidator,
			pythonCodegenSectionReconciler,
			codeUpdates,
			settingsState,
			sectionNames,
			callableSignatures,
			lspDiagnostics,
			stateMachineRuns,
		)...)
		definitions = append(definitions, defaultProjectMetadataToolDefinitions(
			server,
			workspaceRoot,
			registry,
			projectState,
			codegenTargetValidator,
			pythonCodegenSectionReconciler,
			codeUpdates,
			settingsState,
			sectionNames,
			callableSignatures,
			lspDiagnostics,
			stateMachineRuns,
		)...)
		definitions = append(definitions, defaultProjectParamValueToolDefinitions(
			server,
			workspaceRoot,
			registry,
			projectState,
			codegenTargetValidator,
			pythonCodegenSectionReconciler,
			codeUpdates,
			settingsState,
			sectionNames,
			callableSignatures,
			lspDiagnostics,
			stateMachineRuns,
		)...)
		definitions = append(definitions, defaultProjectDiagnosticsToolDefinitions(
			server,
			workspaceRoot,
			registry,
			projectState,
			codegenTargetValidator,
			pythonCodegenSectionReconciler,
			codeUpdates,
			settingsState,
			sectionNames,
			callableSignatures,
			lspDiagnostics,
			stateMachineRuns,
		)...)
	}
	definitions = append(definitions, defaultFileToolDefinitions(workspaceRoot)...)
	return definitions
}
