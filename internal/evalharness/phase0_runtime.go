package evalharness

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"path"
	"reflect"
	"sort"
	"strings"
	"sync"

	"setta/internal/agent"
	"setta/internal/codexaccount"
	"setta/internal/codexapp"
	"setta/internal/jsonio"
)

const phase0DeveloperInstructions = "" +
	"This is a bounded sandbox feasibility probe. Work only in /workspace. " +
	"Do not use network access, web search, MCP, plugins, skills, delegation, or user questions. " +
	"Perform only the exact read or write requested, then report the result concisely."

const (
	phase0EnvironmentHelperCommand   = "/usr/local/bin/setta-eval-sandbox-helper environment"
	phase0ToolEnvironmentMaximumSize = 4 * 1024
	phase0CommandSummaryMaximumSize  = 256
	phase0CommandEvidenceMaximumSize = 64 * 1024
	phase0MaximumCompletedCommands   = 16
	phase0UnknownCommandActionType   = "unknown"
	phase0ReadOnlyOutputSchema       = `{"type":"object","properties":{"fixtureToken":{"type":"string"}},"required":["fixtureToken"],"additionalProperties":false}`
)

type phase0UnknownCommandAction struct {
	Command string `json:"command"`
	Type    string `json:"type"`
}

type phase0ReadOnlyOutput struct {
	FixtureToken string `json:"fixtureToken"`
}

type phase0CodexRuntime struct {
	manager           *codexapp.Manager
	runtime           *agent.Runtime
	completedCommands *phase0CompletedCommandCollector
	model             string
}

type phase0EventSink struct {
	finalText    string
	activityCWDs []string
}

type phase0CompletedCommandObservation struct {
	threadID string
	turnID   string
	command  codexapp.CommandExecutionThreadItem
}

type phase0CompletedCommandCollector struct {
	mu             sync.Mutex
	observationErr error
	retainedBytes  int
	observations   []phase0CompletedCommandObservation
}

func newPhase0CodexRuntime(
	config phase0ProbeConfig,
	execServerURL string,
) *phase0CodexRuntime {
	title := "Setta Phase 0 Sandbox Probe"
	experimental := true
	requestAttestation := false
	manager := codexapp.NewManager(codexapp.ManagerConfig{
		Process: codexapp.ProcessConfig{
			Command: config.codexCommand,
			Args: []string{
				"app-server",
				"--listen",
				"stdio://",
				"--strict-config",
				"-c",
				`shell_environment_policy.inherit="none"`,
				"-c",
				`shell_environment_policy.set={ HOME = "/tmp", LANG = "C.UTF-8", PATH = "/usr/local/bin:/bin", SHELL = "/bin/zsh" }`,
			},
			Env: []string{
				"CODEX_EXEC_SERVER_URL=" + execServerURL,
			},
			ExcludedEnv: []string{
				"CODEX_ACCESS_TOKEN",
				"CODEX_API_KEY",
				"CODEX_EXEC_SERVER_NOISE_AUTH_TOKEN",
				"CODEX_EXEC_SERVER_NOISE_CHATGPT_ACCOUNT_ID",
				"CODEX_EXEC_SERVER_NOISE_ENVIRONMENT_ID",
				"CODEX_EXEC_SERVER_NOISE_REGISTRY_URL",
				"OPENAI_API_KEY",
			},
		},
		InitializeParams: codexapp.InitializeParams{
			ClientInfo: codexapp.ClientInfo{
				Name:    "setta-eval-phase0",
				Title:   &title,
				Version: "phase0",
			},
			Capabilities: &codexapp.InitializeCapabilities{
				ExperimentalApi:    &experimental,
				RequestAttestation: &requestAttestation,
			},
		},
	})
	completedCommands := &phase0CompletedCommandCollector{}
	manager.RegisterNotificationHandler(
		codexapp.CodexNotificationItemCompleted,
		completedCommands.handleItemCompleted,
	)
	return &phase0CodexRuntime{
		manager:           manager,
		runtime:           agent.NewRuntime(agent.Config{Manager: manager}),
		completedCommands: completedCommands,
		model:             config.model,
	}
}

func (runtime *phase0CodexRuntime) verifyChatGPTAuthAndModel(ctx context.Context) error {
	accountService, err := codexaccount.NewService(runtime.manager)
	if err != nil {
		return fmt.Errorf("create Phase 0 Codex account service: %w", err)
	}
	state, err := accountService.Read(ctx)
	if err != nil {
		return fmt.Errorf("read Phase 0 Codex account: %w", err)
	}
	if state.Status != codexaccount.AccountStatusSignedIn || state.Account == nil {
		return errors.New("ChatGPT authentication is unavailable; the probe never starts login")
	}
	if state.Account.Type != codexaccount.AccountTypeChatGPT &&
		state.Account.Type != codexaccount.AccountTypeChatGPTAuthTokens {
		return fmt.Errorf("Phase 0 requires ChatGPT authentication, found %s", state.Account.Type)
	}
	models, err := runtime.runtime.ListModels(ctx, nil, agent.MaxThreadPageSize, true)
	if err != nil {
		return fmt.Errorf("read Phase 0 model catalog: %w", err)
	}
	for _, model := range models.Data {
		if model.ID != runtime.model {
			continue
		}
		if !containsString(model.SupportedReasoningEfforts, phase0ReasoningEffort) {
			return fmt.Errorf(
				"Phase 0 model %s does not support %s reasoning",
				runtime.model,
				phase0ReasoningEffort,
			)
		}
		return nil
	}
	return fmt.Errorf("Phase 0 model %s is unavailable", runtime.model)
}

func (runtime *phase0CodexRuntime) runModelTurns(
	ctx context.Context,
	resources *phase0DockerResources,
) (Phase0TurnEvidence, phase0HelperEnvironment, error) {
	fixtureToken, err := phase0RandomToken()
	if err != nil {
		return Phase0TurnEvidence{}, phase0HelperEnvironment{}, err
	}
	if err := resources.seedWorkspace(ctx, fixtureToken); err != nil {
		return Phase0TurnEvidence{}, phase0HelperEnvironment{}, err
	}
	baseline, err := resources.workspaceSnapshot(ctx)
	if err != nil {
		return Phase0TurnEvidence{}, phase0HelperEnvironment{}, err
	}
	readOnly, toolEnvironment, err := runtime.runReadOnlyTurn(ctx, resources, fixtureToken, baseline)
	if err != nil {
		return Phase0TurnEvidence{}, phase0HelperEnvironment{}, err
	}
	workspaceWrite, err := runtime.runWorkspaceWriteTurn(ctx, resources, fixtureToken, baseline)
	if err != nil {
		return Phase0TurnEvidence{}, phase0HelperEnvironment{}, err
	}
	return Phase0TurnEvidence{
		ReadOnly:       readOnly,
		WorkspaceWrite: workspaceWrite,
	}, toolEnvironment, nil
}

func (runtime *phase0CodexRuntime) runReadOnlyTurn(
	ctx context.Context,
	resources *phase0DockerResources,
	fixtureToken string,
	baseline phase0HelperWorkspace,
) (Phase0ModelTurnEvidence, phase0HelperEnvironment, error) {
	threadID, err := runtime.startThread(ctx, agent.PermissionModeReadOnly)
	if err != nil {
		return Phase0ModelTurnEvidence{}, phase0HelperEnvironment{}, err
	}
	sink := &phase0EventSink{}
	result, err := runtime.runtime.RunTurn(ctx, agent.TurnRequest{
		ConversationID:   "phase0-read-only",
		TurnID:           "phase0-read-only-turn",
		ProviderThreadID: threadID,
		ClientInputID:    "phase0-read-only-input",
		Text: "First run exactly this command as its own command: " + phase0EnvironmentHelperCommand +
			". Do not combine it with another command. Then read /workspace/probe-input.txt and " +
			"return the file's value in the fixtureToken field required by the output schema. " +
			"Do not return the environment-helper output and do not write any file.",
		WorkspaceRoot: phase0WorkspaceRoot,
		Invocation:    phase0Invocation(agent.PermissionModeReadOnly, runtime.model),
		OutputSchema:  []byte(phase0ReadOnlyOutputSchema),
		TokenUsageAttribution: agent.TokenUsageAttribution{
			Bucket:          agent.TokenUsageBucketSystem,
			Role:            agent.TokenUsageRoleAgent,
			InvocationID:    "phase0-read-only-invocation",
			Model:           runtime.model,
			ReasoningEffort: phase0ReasoningEffort,
		},
	}, sink)
	if err != nil {
		return Phase0ModelTurnEvidence{}, phase0HelperEnvironment{}, fmt.Errorf("run Phase 0 read-only turn: %w", err)
	}
	if result.Outcome != agent.TurnOutcomeCompleted {
		return Phase0ModelTurnEvidence{}, phase0HelperEnvironment{}, fmt.Errorf("Phase 0 read-only turn ended %s", result.Outcome)
	}
	toolEnvironment, err := runtime.inspectRemoteToolEnvironment(
		result.ProviderThreadID,
		result.ProviderTurnID,
	)
	if err != nil {
		return Phase0ModelTurnEvidence{}, phase0HelperEnvironment{}, err
	}
	if err := validatePhase0ReadOnlyOutput(sink.finalText, fixtureToken); err != nil {
		return Phase0ModelTurnEvidence{}, phase0HelperEnvironment{}, err
	}
	after, err := resources.workspaceSnapshot(ctx)
	if err != nil {
		return Phase0ModelTurnEvidence{}, phase0HelperEnvironment{}, err
	}
	unchanged := reflect.DeepEqual(baseline, after)
	if !unchanged {
		return Phase0ModelTurnEvidence{}, phase0HelperEnvironment{}, errors.New("Phase 0 read-only turn changed the workspace")
	}
	return Phase0ModelTurnEvidence{
		Outcome:              string(result.Outcome),
		FixtureTokenObserved: true,
		WorkspaceUnchanged:   true,
		OnlyExpectedMutation: true,
		ActivityCWDs:         sink.sortedActivityCWDs(),
	}, toolEnvironment, nil
}

func validatePhase0ReadOnlyOutput(value string, fixtureToken string) error {
	var output phase0ReadOnlyOutput
	if err := jsonio.DecodeSingle(strings.NewReader(value), &output); err != nil {
		return fmt.Errorf("decode Phase 0 read-only output: %w", err)
	}
	if output.FixtureToken != fixtureToken {
		return errors.New("Phase 0 read-only turn did not return the fixture token exactly")
	}
	return nil
}

func (runtime *phase0CodexRuntime) inspectRemoteToolEnvironment(
	threadID string,
	turnID string,
) (phase0HelperEnvironment, error) {
	commands, err := runtime.completedCommands.forProviderTurn(threadID, turnID)
	if err != nil {
		return phase0HelperEnvironment{}, err
	}
	return phase0ToolEnvironmentFromCompletedCommands(commands)
}

func (collector *phase0CompletedCommandCollector) handleItemCompleted(
	message codexapp.Message,
) {
	notification, err := codexapp.DecodeItemCompletedNotification(message.Params)
	collector.mu.Lock()
	defer collector.mu.Unlock()
	if err != nil {
		if collector.observationErr == nil {
			collector.observationErr = fmt.Errorf("decode Phase 0 completed item evidence: %w", err)
		}
		return
	}
	command := notification.Item.CommandExecution
	if command == nil {
		return
	}
	if len(collector.observations) >= phase0MaximumCompletedCommands {
		if collector.observationErr == nil {
			collector.observationErr = errors.New("Phase 0 completed-command evidence exceeded its item bound")
		}
		return
	}
	retainedBytes := phase0CompletedCommandSize(*command)
	if retainedBytes > phase0CommandEvidenceMaximumSize-collector.retainedBytes {
		if collector.observationErr == nil {
			collector.observationErr = errors.New("Phase 0 completed-command evidence exceeded its size bound")
		}
		return
	}
	collector.retainedBytes += retainedBytes
	collector.observations = append(collector.observations, phase0CompletedCommandObservation{
		threadID: notification.ThreadID,
		turnID:   notification.TurnID,
		command:  *command,
	})
}

func (collector *phase0CompletedCommandCollector) forProviderTurn(
	threadID string,
	turnID string,
) ([]codexapp.CommandExecutionThreadItem, error) {
	collector.mu.Lock()
	defer collector.mu.Unlock()
	if collector.observationErr != nil {
		return nil, collector.observationErr
	}
	commands := []codexapp.CommandExecutionThreadItem{}
	for _, observation := range collector.observations {
		if observation.threadID == threadID && observation.turnID == turnID {
			commands = append(commands, observation.command)
		}
	}
	return commands, nil
}

func phase0CompletedCommandSize(command codexapp.CommandExecutionThreadItem) int {
	size := len(command.Command)
	if command.AggregatedOutput != nil {
		size += len(*command.AggregatedOutput)
	}
	for _, action := range command.CommandActions {
		size += len(action)
	}
	return size
}

func phase0ToolEnvironmentFromCompletedCommands(
	commands []codexapp.CommandExecutionThreadItem,
) (phase0HelperEnvironment, error) {
	command, err := phase0RemoteEnvironmentCommand(commands)
	if err != nil {
		return phase0HelperEnvironment{}, err
	}
	return decodePhase0ToolEnvironment(command)
}

func phase0RemoteEnvironmentCommand(
	commands []codexapp.CommandExecutionThreadItem,
) (codexapp.CommandExecutionThreadItem, error) {
	var matchedCommand *codexapp.CommandExecutionThreadItem
	for index := range commands {
		command := &commands[index]
		if !phase0RunsEnvironmentHelper(*command) {
			continue
		}
		if matchedCommand != nil {
			return codexapp.CommandExecutionThreadItem{}, errors.New("Phase 0 remote environment helper ran more than once")
		}
		matchedCommand = command
	}
	if matchedCommand == nil {
		return codexapp.CommandExecutionThreadItem{}, fmt.Errorf(
			"Phase 0 remote turn did not run the exact environment helper command; observed %s",
			phase0CompletedCommandSummary(commands),
		)
	}
	return *matchedCommand, nil
}

func phase0CompletedCommandSummary(commands []codexapp.CommandExecutionThreadItem) string {
	if len(commands) == 0 {
		return "no completed command items"
	}
	parts := make([]string, 0, len(commands))
	for _, command := range commands {
		actions := make([]string, 0, len(command.CommandActions))
		for _, rawAction := range command.CommandActions {
			var action phase0UnknownCommandAction
			if err := json.Unmarshal(rawAction, &action); err != nil {
				actions = append(actions, "invalid")
				continue
			}
			actions = append(actions, fmt.Sprintf("%s:%q", action.Type, phase0BoundedCommand(action.Command)))
		}
		parts = append(parts, fmt.Sprintf(
			"command=%q actions=[%s]",
			phase0BoundedCommand(command.Command),
			strings.Join(actions, ", "),
		))
	}
	return strings.Join(parts, "; ")
}

func phase0BoundedCommand(command string) string {
	if len(command) <= phase0CommandSummaryMaximumSize {
		return command
	}
	return command[:phase0CommandSummaryMaximumSize] + "..."
}

func phase0RunsEnvironmentHelper(command codexapp.CommandExecutionThreadItem) bool {
	if len(command.CommandActions) != 1 {
		return false
	}
	var action phase0UnknownCommandAction
	if err := json.Unmarshal(command.CommandActions[0], &action); err != nil {
		return false
	}
	return action.Type == phase0UnknownCommandActionType &&
		action.Command == phase0EnvironmentHelperCommand
}

func decodePhase0ToolEnvironment(
	command codexapp.CommandExecutionThreadItem,
) (phase0HelperEnvironment, error) {
	if err := validatePhase0EnvironmentCommand(command); err != nil {
		return phase0HelperEnvironment{}, err
	}
	if err := validatePhase0EnvironmentCommandAction(command.CommandActions); err != nil {
		return phase0HelperEnvironment{}, err
	}
	output := *command.AggregatedOutput
	if len(output) == 0 || len(output) > phase0ToolEnvironmentMaximumSize {
		return phase0HelperEnvironment{}, errors.New("Phase 0 remote environment helper returned out-of-bounds output")
	}
	var environment phase0HelperEnvironment
	if err := jsonio.DecodeSingle(strings.NewReader(output), &environment); err != nil {
		return phase0HelperEnvironment{}, fmt.Errorf("decode effective remote tool environment: %w", err)
	}
	if err := validatePhase0ToolIdentity(environment); err != nil {
		return phase0HelperEnvironment{}, err
	}
	if err := validateEnvironmentNames(environment.EnvironmentNames); err != nil {
		return phase0HelperEnvironment{}, err
	}
	return environment, nil
}

func validatePhase0EnvironmentCommand(command codexapp.CommandExecutionThreadItem) error {
	if command.Status != codexapp.CommandExecutionStatusCompleted {
		return errors.New("Phase 0 remote environment helper did not complete in the workspace")
	}
	if command.ExitCode == nil || *command.ExitCode != 0 {
		return errors.New("Phase 0 remote environment helper did not complete in the workspace")
	}
	if string(command.CWD) != phase0WorkspaceRoot || command.AggregatedOutput == nil {
		return errors.New("Phase 0 remote environment helper did not complete in the workspace")
	}
	if command.Source == nil || *command.Source != codexapp.CommandExecutionSourceAgent {
		return errors.New("Phase 0 remote environment helper did not complete in the workspace")
	}
	return nil
}

func validatePhase0EnvironmentCommandAction(actions []codexapp.CommandAction) error {
	if len(actions) != 1 {
		return errors.New("Phase 0 remote environment helper command action is invalid")
	}
	var action phase0UnknownCommandAction
	if err := jsonio.DecodeSingle(strings.NewReader(string(actions[0])), &action); err != nil {
		return errors.New("Phase 0 remote environment helper command action is invalid")
	}
	if action.Type != phase0UnknownCommandActionType || action.Command != phase0EnvironmentHelperCommand {
		return errors.New("Phase 0 remote environment helper command action is invalid")
	}
	return nil
}

func validatePhase0ToolIdentity(environment phase0HelperEnvironment) error {
	if environment.UID != phase0ContainerUID || environment.GID != phase0ContainerGID {
		return fmt.Errorf(
			"remote tool ran as %d:%d, want %d:%d",
			environment.UID,
			environment.GID,
			phase0ContainerUID,
			phase0ContainerGID,
		)
	}
	return nil
}

func (runtime *phase0CodexRuntime) runWorkspaceWriteTurn(
	ctx context.Context,
	resources *phase0DockerResources,
	fixtureToken string,
	baseline phase0HelperWorkspace,
) (Phase0ModelTurnEvidence, error) {
	threadID, err := runtime.startThread(ctx, agent.PermissionModeWorkspaceWrite)
	if err != nil {
		return Phase0ModelTurnEvidence{}, err
	}
	sink := &phase0EventSink{}
	result, err := runtime.runtime.RunTurn(ctx, agent.TurnRequest{
		ConversationID:   "phase0-workspace-write",
		TurnID:           "phase0-workspace-write-turn",
		ProviderThreadID: threadID,
		ClientInputID:    "phase0-workspace-write-input",
		Text: "Read /workspace/probe-input.txt, then create /workspace/probe-output.txt " +
			"containing exactly the same value followed by one newline. Do not modify any other file.",
		WorkspaceRoot: phase0WorkspaceRoot,
		Invocation:    phase0Invocation(agent.PermissionModeWorkspaceWrite, runtime.model),
		TokenUsageAttribution: agent.TokenUsageAttribution{
			Bucket:          agent.TokenUsageBucketSystem,
			Role:            agent.TokenUsageRoleAgent,
			InvocationID:    "phase0-workspace-write-invocation",
			Model:           runtime.model,
			ReasoningEffort: phase0ReasoningEffort,
		},
	}, sink)
	if err != nil {
		return Phase0ModelTurnEvidence{}, fmt.Errorf("run Phase 0 workspace-write turn: %w", err)
	}
	if result.Outcome != agent.TurnOutcomeCompleted {
		return Phase0ModelTurnEvidence{}, fmt.Errorf("Phase 0 workspace-write turn ended %s", result.Outcome)
	}
	output, err := resources.verifyOutput(ctx)
	if err != nil {
		return Phase0ModelTurnEvidence{}, err
	}
	expectedDigest := sha256.Sum256([]byte(fixtureToken + "\n"))
	wantDigest := hex.EncodeToString(expectedDigest[:])
	if output.Path != "/workspace/probe-output.txt" ||
		output.Bytes != len(fixtureToken)+1 ||
		output.SHA256 != wantDigest {
		return Phase0ModelTurnEvidence{}, errors.New("Phase 0 workspace-write turn produced unexpected output")
	}
	after, err := resources.workspaceSnapshot(ctx)
	if err != nil {
		return Phase0ModelTurnEvidence{}, err
	}
	onlyExpectedMutation := phase0OnlyExpectedOutputAdded(baseline, after, output)
	if !onlyExpectedMutation {
		return Phase0ModelTurnEvidence{}, errors.New("Phase 0 workspace-write turn changed an unexpected file")
	}
	return Phase0ModelTurnEvidence{
		Outcome:              string(result.Outcome),
		FixtureTokenObserved: true,
		WorkspaceUnchanged:   false,
		OnlyExpectedMutation: true,
		OutputSHA256:         output.SHA256,
		ActivityCWDs:         sink.sortedActivityCWDs(),
	}, nil
}

func (runtime *phase0CodexRuntime) startThread(
	ctx context.Context,
	permissionMode agent.PermissionMode,
) (string, error) {
	sandbox, err := phase0SandboxMode(permissionMode)
	if err != nil {
		return "", err
	}
	approval := codexapp.AskForApproval(json.RawMessage(`"never"`))
	allowFallback := false
	ephemeral := true
	cwd := phase0WorkspaceRoot
	dynamicTools := []codexapp.DynamicToolSpec{}
	capabilityRoots := []codexapp.SelectedCapabilityRoot{}
	runtimeRoots := []codexapp.AbsolutePathBuf{codexapp.AbsolutePathBuf(phase0WorkspaceRoot)}
	environments := []codexapp.TurnEnvironmentParams{
		{
			CWD:                   codexapp.LegacyAppPathString(phase0WorkspaceRoot),
			EnvironmentId:         phase0EnvironmentID,
			RuntimeWorkspaceRoots: phase0LegacyWorkspaceRoots(),
		},
	}
	effort, err := json.Marshal(phase0ReasoningEffort)
	if err != nil {
		return "", fmt.Errorf("encode Phase 0 reasoning effort: %w", err)
	}
	threadConfig := map[string]json.RawMessage{"model_reasoning_effort": effort}
	raw, err := runtime.manager.Call(ctx, codexapp.CodexMethodThreadStart, codexapp.ThreadStartParams{
		AllowProviderModelFallback: &allowFallback,
		ApprovalPolicy:             &approval,
		Config:                     &threadConfig,
		CWD:                        &cwd,
		DeveloperInstructions:      phase0StringPointer(phase0DeveloperInstructions),
		DynamicTools:               &dynamicTools,
		Environments:               &environments,
		Ephemeral:                  &ephemeral,
		Model:                      &runtime.model,
		RuntimeWorkspaceRoots:      &runtimeRoots,
		Sandbox:                    &sandbox,
		SelectedCapabilityRoots:    &capabilityRoots,
	})
	if err != nil {
		return "", fmt.Errorf("start Phase 0 thread: %w", err)
	}
	response, err := codexapp.DecodeThreadStartResponse(raw)
	if err != nil {
		return "", fmt.Errorf("decode Phase 0 thread: %w", err)
	}
	if response.Thread.ID == "" || string(response.CWD) != phase0WorkspaceRoot {
		return "", errors.New("Phase 0 thread did not resolve inside the remote workspace")
	}
	if response.Model != runtime.model {
		return "", fmt.Errorf("Phase 0 thread resolved model %s, want %s", response.Model, runtime.model)
	}
	if response.ReasoningEffort == nil || string(*response.ReasoningEffort) != phase0ReasoningEffort {
		return "", errors.New("Phase 0 thread did not preserve the requested reasoning effort")
	}
	return response.Thread.ID, nil
}

func (runtime *phase0CodexRuntime) shutdown(ctx context.Context) error {
	return runtime.runtime.Shutdown(ctx)
}

func (sink *phase0EventSink) HandleAgentEvent(event agent.Event) error {
	if event.Approval != nil {
		return fmt.Errorf("Phase 0 model requested unexpected approval %s", event.Approval.ID)
	}
	if event.Text != nil && event.Kind == agent.EventKindAgentTextCompleted {
		sink.finalText = event.Text.Text
	}
	if event.Activity == nil || event.Activity.CWD == nil {
		return nil
	}
	cleaned := path.Clean(*event.Activity.CWD)
	if cleaned != phase0WorkspaceRoot && !strings.HasPrefix(cleaned, phase0WorkspaceRoot+"/") {
		return fmt.Errorf("Phase 0 activity escaped the remote workspace: %s", cleaned)
	}
	sink.activityCWDs = append(sink.activityCWDs, cleaned)
	return nil
}

func (sink *phase0EventSink) sortedActivityCWDs() []string {
	return sortedUnique(sink.activityCWDs)
}

func phase0Invocation(permissionMode agent.PermissionMode, model string) agent.Invocation {
	return agent.Invocation{
		Model:           model,
		ReasoningEffort: phase0ReasoningEffort,
		PermissionMode:  permissionMode,
		ApprovalMode:    agent.ApprovalModeNever,
	}
}

func phase0SandboxMode(permissionMode agent.PermissionMode) (codexapp.SandboxMode, error) {
	switch permissionMode {
	case agent.PermissionModeReadOnly:
		return codexapp.SandboxModeReadOnly, nil
	case agent.PermissionModeWorkspaceWrite:
		return codexapp.SandboxModeWorkspaceWrite, nil
	default:
		return "", fmt.Errorf("unsupported Phase 0 permission mode %s", permissionMode)
	}
}

func phase0LegacyWorkspaceRoots() *[]codexapp.LegacyAppPathString {
	roots := []codexapp.LegacyAppPathString{
		codexapp.LegacyAppPathString(phase0WorkspaceRoot),
	}
	return &roots
}

func phase0StringPointer(value string) *string {
	return &value
}

func phase0RandomToken() (string, error) {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		return "", fmt.Errorf("create Phase 0 fixture token: %w", err)
	}
	return "SETTA_PHASE0_" + hex.EncodeToString(value), nil
}

func phase0OnlyExpectedOutputAdded(
	baseline phase0HelperWorkspace,
	after phase0HelperWorkspace,
	output phase0HelperFile,
) bool {
	want := append([]phase0HelperFile{}, baseline.Files...)
	want = append(want, phase0HelperFile{
		Path:   "probe-output.txt",
		Bytes:  output.Bytes,
		SHA256: output.SHA256,
	})
	sort.Slice(want, func(left int, right int) bool {
		return want[left].Path < want[right].Path
	})
	return reflect.DeepEqual(want, after.Files)
}
