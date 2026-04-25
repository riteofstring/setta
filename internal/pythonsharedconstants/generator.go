package pythonsharedconstants

import (
	"fmt"
	"maps"
	"slices"
	"strconv"
	"strings"
	"time"

	backendruntime "setta/internal/appsubsystem/backendruntime"
	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/hostnames"
	"setta/internal/localsessions"
	"setta/internal/mcpx"
	"setta/internal/projectstate"
	"setta/internal/pythonsdklocalcore"
	"setta/internal/realtime"
	"setta/internal/workspacelaunch"
)

const GeneratedPythonModulePath = "backend/setta/types/generated/go_shared_constants.py"

type GeneratedConstants struct {
	PythonModule string
}

type constantSpec struct {
	Name       string
	PythonExpr string
}

func Build() (GeneratedConstants, error) {
	specs := []constantSpec{
		{Name: "WORKSPACE_ROOT_ENV", PythonExpr: pythonStringLiteral(config.WorkspaceRootEnv)},
		{Name: "RUNTIME_ROOT_ENV", PythonExpr: pythonStringLiteral(config.RuntimeRootEnv)},
		{Name: "FILES_ROOT_ENV", PythonExpr: pythonStringLiteral(config.FilesRootEnv)},
		{Name: "PROFILE_ENV", PythonExpr: pythonStringLiteral(config.ProfileEnv)},
		{Name: "PROFILE_LOOKUP_HOME_ENV", PythonExpr: pythonStringLiteral(config.ProfileLookupHomeEnv)},
		{Name: "SETTA_HOME_ENV", PythonExpr: pythonStringLiteral(config.SettaHomeEnv)},
		{Name: "FILES_LOCATION_ENV", PythonExpr: pythonStringLiteral(config.FilesLocationEnv)},
		{Name: "SETTA_FILES_LOCATION_VALUES", PythonExpr: pythonStringTupleExpr(filesLocationValuesToStrings(config.RequestedFilesLocations()))},
		{Name: "RESOLVED_SETTA_FILES_LOCATION_VALUES", PythonExpr: pythonStringTupleExpr(resolvedFilesLocationValuesToStrings(config.ResolvedFilesLocations()))},
		{Name: "SESSION_ID_ENV_VAR", PythonExpr: pythonStringLiteral(auth.SessionIDEnv)},
		{Name: "SESSIONS_ROOT_ENV_VAR", PythonExpr: pythonStringLiteral(auth.SessionsRootEnv)},
		{Name: "IN_PROCESS_ENV_VAR", PythonExpr: pythonStringLiteral(localsessions.InProcessBackendEnvVar)},
		{Name: "ALLOWED_SETTA_HOME_NAMES", PythonExpr: pythonFrozenStringSetExpr(config.AllowedSettaHomeNames())},
		{Name: "ALLOWED_SETTA_FILES_ROOT_SEGMENTS", PythonExpr: pythonFrozenStringSetExpr(config.AllowedSettaFilesRootSegments())},
		{Name: "DEFAULT_HOST", PythonExpr: pythonStringLiteral(config.DefaultServerHost)},
		{Name: "DEFAULT_PORT", PythonExpr: strconv.Itoa(config.DefaultServerPort)},
		{Name: "DEFAULT_AUTH_COOKIE_NAME", PythonExpr: pythonStringLiteral(auth.DefaultAuthCookieName)},
		{Name: "AUTH_COOKIE_MAX_AGE_SECONDS", PythonExpr: strconv.Itoa(int(auth.DefaultAuthCookieTTL / time.Second))},
		{Name: "BOOTSTRAP_TOKEN_TTL_SECONDS", PythonExpr: strconv.Itoa(int(auth.DefaultBootstrapTokenTTL / time.Second))},
		{Name: "LAUNCH_INTENT_TOKEN_TTL_SECONDS", PythonExpr: strconv.Itoa(int(workspacelaunch.DefaultIntentTTL / time.Second))},
		{Name: "SESSION_SECRET_BYTES", PythonExpr: strconv.Itoa(localsessions.SessionSecretBytes)},
		{Name: "SESSION_METADATA_FILENAME", PythonExpr: pythonStringLiteral(localsessions.SessionMetadataFileName)},
		{Name: "SESSION_SECRET_FILENAME", PythonExpr: pythonStringLiteral(localsessions.SessionSecretFileName)},
		{Name: "SESSION_PROCESS_BASENAMES", PythonExpr: pythonFrozenStringSetExpr(localsessions.RecognizedSessionProcessBasenames())},
		{Name: "SESSION_PROCESS_INVOCATION_ARGUMENTS", PythonExpr: pythonFrozenStringSetExpr(localsessions.RecognizedSessionInvocationArguments())},
		{Name: "SESSION_PROCESS_INVOCATION_PREFIXES", PythonExpr: pythonStringTupleExpr(localsessions.RecognizedSessionInvocationPrefixes())},
		{Name: "SESSION_SERVER_MODE_VALUES", PythonExpr: pythonStringTupleExpr(modeValuesToStrings([]config.Mode{config.ModeIDE, config.ModeLauncher}))},
		{Name: "DEFAULT_SESSION_SERVER_MODE", PythonExpr: pythonStringLiteral(string(config.ModeIDE))},
		{Name: "PASSWORD_STORE_FILENAME", PythonExpr: pythonStringLiteral(projectstate.PasswordStoreFileName)},
		{Name: "MEMORABLE_NAME_ADJECTIVES", PythonExpr: pythonStringTupleExpr(projectstate.MemorableNameAdjectives())},
		{Name: "MEMORABLE_NAME_NOUNS", PythonExpr: pythonStringTupleExpr(projectstate.MemorableNameNouns())},
		{Name: "MEMORABLE_NAME_VERBS", PythonExpr: pythonStringTupleExpr(projectstate.MemorableNameVerbs())},
		{Name: "HEADER_LENGTH_BYTES", PythonExpr: strconv.Itoa(realtime.BinaryHeaderLengthBytes)},
		{Name: "LOOPBACK_HOSTS", PythonExpr: pythonFrozenStringSetExpr(hostnames.LoopbackHosts())},
		{Name: "SESSION_MATCH_HOST_REWRITES", PythonExpr: pythonStringDictExpr(hostnames.SessionMatchHostRewrites())},
		{Name: "MCP_TOOL_PREFIX", PythonExpr: pythonStringLiteral(mcpx.ToolNameMCPPrefix)},
		{Name: "SETTA_TOOL_SINGLE_PREFIX", PythonExpr: pythonStringLiteral(mcpx.DefaultServerSingleTool)},
		{Name: "SETTA_TOOL_DOUBLE_PREFIX", PythonExpr: pythonStringLiteral(mcpx.DefaultServerDoubleTool)},
		{Name: "ASK_USER_QUESTION_TOOL_ALIAS", PythonExpr: pythonStringLiteral(mcpx.AskUserQuestionAlias)},
		{Name: "ASK_USER_QUESTION_TOOL_NAME", PythonExpr: pythonStringLiteral(mcpx.AskUserQuestionToolName)},
		{Name: "APP_SUBSYSTEM_BACKEND_CONTRACT_VERSION", PythonExpr: strconv.Itoa(backendruntime.AppSubsystemBackendContractVersion)},
		{
			Name: "APP_SUBSYSTEM_BACKEND_LISTENER_ENDPOINT_NAMES",
			PythonExpr: pythonStringTupleExpr(
				backendruntime.RequiredListenerEndpointNames(),
			),
		},
		{
			Name: "APP_SUBSYSTEM_BACKEND_LISTENER_ENDPOINT_TO_LOCAL_CORE_COMMAND",
			PythonExpr: "MappingProxyType(" + pythonStringDictExpr(
				appSubsystemBackendListenerEndpointCommandMap(),
			) + ")",
		},
		{Name: "LOCAL_CORE_PROTOCOL_VERSION", PythonExpr: strconv.Itoa(pythonsdklocalcore.ProtocolVersion)},
		{
			Name:       "LOCAL_CORE_COMMAND_RENDER_REALTIME_DEPENDENCY_VALUES",
			PythonExpr: pythonStringLiteral(pythonsdklocalcore.CommandListenerRenderRealtimeDependencyValues),
		},
		{
			Name:       "LOCAL_CORE_COMMAND_GET_APP_DEFINITION",
			PythonExpr: pythonStringLiteral(pythonsdklocalcore.CommandGetAppDefinition),
		},
		{
			Name:       "LOCAL_CORE_COMMAND_GET_EFFECTIVE_APP_DEFINITION",
			PythonExpr: pythonStringLiteral(pythonsdklocalcore.CommandGetEffectiveAppDefinition),
		},
		{
			Name:       "LOCAL_CORE_COMMAND_GET_EFFECTIVE_APP_SPEC_PATH",
			PythonExpr: pythonStringLiteral(pythonsdklocalcore.CommandGetEffectiveAppSpecPath),
		},
		{
			Name:       "LOCAL_CORE_COMMAND_GET_EFFECTIVE_APP_THEME_MODE",
			PythonExpr: pythonStringLiteral(pythonsdklocalcore.CommandGetEffectiveAppThemeMode),
		},
		{
			Name:       "LOCAL_CORE_COMMAND_VALIDATE_APP_DEFINITION",
			PythonExpr: pythonStringLiteral(pythonsdklocalcore.CommandValidateAppDefinition),
		},
		{
			Name:       "LOCAL_CORE_COMMAND_SET_APP_DEFINITION",
			PythonExpr: pythonStringLiteral(pythonsdklocalcore.CommandSetAppDefinition),
		},
		{
			Name:       "LOCAL_CORE_COMMAND_STREAM_APP_DEFINITION",
			PythonExpr: pythonStringLiteral(pythonsdklocalcore.CommandStreamAppDefinition),
		},
		{
			Name:       "LOCAL_CORE_COMMAND_UPDATE_APP_DEFINITION",
			PythonExpr: pythonStringLiteral(pythonsdklocalcore.CommandUpdateAppDefinition),
		},
		{
			Name:       "LOCAL_CORE_COMMAND_COMPARE_AND_SET_APP_DEFINITION_CATALOG_ID",
			PythonExpr: pythonStringLiteral(pythonsdklocalcore.CommandCompareAndSetAppDefinitionCatalogID),
		},
		{
			Name:       "LOCAL_CORE_COMMAND_COMPARE_AND_SET_APP_DEFINITION_SPEC_VERSION",
			PythonExpr: pythonStringLiteral(pythonsdklocalcore.CommandCompareAndSetAppDefinitionSpecVersion),
		},
		{
			Name:       "LOCAL_CORE_COMMAND_COMPARE_AND_SET_APP_DEFINITION_SPEC_PATH",
			PythonExpr: pythonStringLiteral(pythonsdklocalcore.CommandCompareAndSetAppDefinitionSpecPath),
		},
		{
			Name:       "LOCAL_CORE_COMMAND_COMPARE_AND_SET_APP_DEFINITION_THEME_MODE",
			PythonExpr: pythonStringLiteral(pythonsdklocalcore.CommandCompareAndSetAppDefinitionThemeMode),
		},
		{
			Name:       "DEPLOYMENT_LISTENER_READY_SENTINEL",
			PythonExpr: pythonStringLiteral(deployments.DeploymentListenerReadySentinel),
		},
	}

	var builder strings.Builder
	builder.WriteString("# Code generated by ./scripts/go.sh run ./cmd/setta-gen-python-shared-constants -out backend/setta/types/generated/go_shared_constants.py; DO NOT EDIT.\n")
	builder.WriteString("\n")
	builder.WriteString("from types import MappingProxyType\n")
	builder.WriteString("\n")
	for _, spec := range specs {
		builder.WriteString(spec.Name)
		builder.WriteString(" = ")
		builder.WriteString(spec.PythonExpr)
		builder.WriteString("\n")
	}

	return GeneratedConstants{PythonModule: builder.String()}, nil
}

func appSubsystemBackendListenerEndpointCommandMap() map[string]string {
	pairs := pythonsdklocalcore.AppSubsystemBackendListenerEndpointCommands()
	result := make(map[string]string, len(pairs))
	for _, pair := range pairs {
		result[pair.ListenerEndpointName] = pair.LocalCoreCommandName
	}
	return result
}

func pythonStringLiteral(value string) string {
	return strconv.Quote(value)
}

func pythonFrozenStringSetExpr(values []string) string {
	if len(values) == 0 {
		return "frozenset()"
	}
	parts := make([]string, 0, len(values))
	for _, value := range values {
		parts = append(parts, pythonStringLiteral(value))
	}
	if len(parts) == 1 {
		return fmt.Sprintf("frozenset((%s,))", parts[0])
	}
	return fmt.Sprintf("frozenset((%s))", strings.Join(parts, ", "))
}

func pythonStringTupleExpr(values []string) string {
	if len(values) == 0 {
		return "()"
	}
	parts := make([]string, 0, len(values))
	for _, value := range values {
		parts = append(parts, pythonStringLiteral(value))
	}
	if len(parts) == 1 {
		return fmt.Sprintf("(%s,)", parts[0])
	}
	return fmt.Sprintf("(%s)", strings.Join(parts, ", "))
}

func filesLocationValuesToStrings(values []config.FilesLocation) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		result = append(result, string(value))
	}
	return result
}

func resolvedFilesLocationValuesToStrings(values []config.ResolvedFilesLocation) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		result = append(result, string(value))
	}
	return result
}

func modeValuesToStrings(values []config.Mode) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		result = append(result, string(value))
	}
	return result
}

func pythonStringDictExpr(values map[string]string) string {
	if len(values) == 0 {
		return "{}"
	}
	keys := slices.Sorted(maps.Keys(values))
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		parts = append(parts, fmt.Sprintf("%s: %s", pythonStringLiteral(key), pythonStringLiteral(values[key])))
	}
	return fmt.Sprintf("{%s}", strings.Join(parts, ", "))
}
