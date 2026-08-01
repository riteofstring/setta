package evalharness

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"path"
	"reflect"
	"sort"
	"strings"
	"time"

	"setta/internal/agent"
	"setta/internal/codexaccount"
	"setta/internal/codexapp"
	"setta/internal/evalharness/probefixture"
	"setta/internal/jsonio"
)

const phase0DeveloperInstructions = "" +
	"This is a bounded sandbox feasibility probe. Work only in /workspace. " +
	"Do not use network access, web search, MCP, plugins, skills, delegation, or user questions. " +
	"Use available execution tools before answering; never invent file contents. " +
	"Perform only the exact read or write requested, then report the result concisely. " +
	"A turn is incomplete until the requested filesystem operation has succeeded; never answer with a placeholder."

const (
	phase0DiagnosticTextMaximumSize = 256
	phase0EnvironmentReadyTimeout   = 30 * time.Second
	phase0EnvironmentShellName      = "zsh"
	phase0EnvironmentShellPath      = "/bin/zsh"
	phase0EnvironmentWorkspaceURI   = "file:///workspace"
	phase0ReadOnlyOutputSchema      = `{"type":"object","properties":{"fixtureToken":{"type":"string","description":"Exact contents read from /workspace/probe-input.txt; never invent this value.","pattern":"` + probefixture.Pattern + `"}},"required":["fixtureToken"],"additionalProperties":false}`
	phase0ShellEnvironmentInherit   = "none"
)

type phase0ShellEnvironmentVariable struct {
	name  string
	value string
}

var phase0ShellEnvironmentSet = []phase0ShellEnvironmentVariable{
	{name: "HOME", value: "/tmp"},
	{name: "LANG", value: "C.UTF-8"},
	{name: "PATH", value: "/usr/local/bin:/bin"},
	{name: "SHELL", value: "/bin/zsh"},
}

type phase0ReadOnlyOutput struct {
	FixtureToken string `json:"fixtureToken"`
}

type phase0CodexRuntime struct {
	manager *codexapp.Manager
	runtime *agent.Runtime
	model   string
}

type phase0EventSink struct {
	finalText string
}

func newPhase0CodexRuntime(
	config phase0ProbeConfig,
	execServerURL string,
) *phase0CodexRuntime {
	title := "Setta Phase 0 Sandbox Probe"
	experimental := true
	requestAttestation := false
	args := []string{
		"app-server",
		"--listen",
		"stdio://",
		"--strict-config",
		"-c",
		execServerBlockingEnvironment,
		"-c",
		execServerCodeModeDisabled,
		"-c",
		execServerCodeModeOnlyDisabled,
		"-c",
		execServerShellToolEnabled,
		"-c",
		execServerShellZshForkDisabled,
		"-c",
		execServerUnifiedExecEnabled,
		"-c",
		execServerUnifiedZshDisabled,
	}
	for _, policy := range phase0ShellEnvironmentPolicyConfig() {
		args = append(args, "-c", policy)
	}
	manager := codexapp.NewManager(codexapp.ManagerConfig{
		Process: codexapp.ProcessConfig{
			Command: config.codexCommand,
			Args:    args,
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
	return &phase0CodexRuntime{
		manager: manager,
		runtime: agent.NewRuntime(agent.Config{Manager: manager}),
		model:   config.model,
	}
}

func phase0ShellEnvironmentPolicyConfig() []string {
	set := make([]string, 0, len(phase0ShellEnvironmentSet))
	for _, variable := range phase0ShellEnvironmentSet {
		set = append(set, fmt.Sprintf("%s = %q", variable.name, variable.value))
	}
	return []string{
		fmt.Sprintf("shell_environment_policy.inherit=%q", phase0ShellEnvironmentInherit),
		fmt.Sprintf("shell_environment_policy.set={ %s }", strings.Join(set, ", ")),
	}
}

func phase0ShellEnvironmentSetNames() []string {
	names := make([]string, 0, len(phase0ShellEnvironmentSet))
	for _, variable := range phase0ShellEnvironmentSet {
		names = append(names, variable.name)
	}
	return sortedUnique(names)
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

func (runtime *phase0CodexRuntime) waitForRemoteEnvironment(ctx context.Context) error {
	waitContext, cancel := context.WithTimeout(ctx, phase0EnvironmentReadyTimeout)
	defer cancel()
	raw, err := runtime.manager.Call(
		waitContext,
		codexapp.CodexMethodEnvironmentInfo,
		codexapp.EnvironmentInfoParams{EnvironmentId: phase0EnvironmentID},
	)
	if err != nil {
		return fmt.Errorf("wait for Phase 0 remote environment: %w", err)
	}
	response, err := codexapp.DecodeEnvironmentInfoResponse(raw)
	if err != nil {
		return fmt.Errorf("decode Phase 0 remote environment: %w", err)
	}
	return validatePhase0EnvironmentInfo(response)
}

func validatePhase0EnvironmentInfo(response codexapp.EnvironmentInfoResponse) error {
	if response.Shell.Name != phase0EnvironmentShellName ||
		response.Shell.Path != phase0EnvironmentShellPath {
		return fmt.Errorf(
			"Phase 0 remote environment reported shell %s at %s",
			response.Shell.Name,
			response.Shell.Path,
		)
	}
	if response.CWD == nil || string(*response.CWD) != phase0EnvironmentWorkspaceURI {
		return errors.New("Phase 0 remote environment did not initialize in the workspace")
	}
	return nil
}

func (runtime *phase0CodexRuntime) runModelTurns(
	ctx context.Context,
	resources *phase0DockerResources,
) (Phase0TurnEvidence, error) {
	fixtureToken, err := phase0RandomToken()
	if err != nil {
		return Phase0TurnEvidence{}, err
	}
	if err := resources.seedWorkspace(ctx, fixtureToken); err != nil {
		return Phase0TurnEvidence{}, err
	}
	baseline, err := resources.workspaceSnapshot(ctx)
	if err != nil {
		return Phase0TurnEvidence{}, err
	}
	readOnly, err := runtime.runReadOnlyTurn(ctx, resources, fixtureToken, baseline)
	if err != nil {
		return Phase0TurnEvidence{}, err
	}
	workspaceWrite, err := runtime.runWorkspaceWriteTurn(ctx, resources, fixtureToken, baseline)
	if err != nil {
		return Phase0TurnEvidence{}, err
	}
	return Phase0TurnEvidence{
		ReadOnly:       readOnly,
		WorkspaceWrite: workspaceWrite,
	}, nil
}

func (runtime *phase0CodexRuntime) runReadOnlyTurn(
	ctx context.Context,
	resources *phase0DockerResources,
	fixtureToken string,
	baseline phase0HelperWorkspace,
) (Phase0ModelTurnEvidence, error) {
	threadID, err := runtime.startThread(ctx, agent.PermissionModeReadOnly)
	if err != nil {
		return Phase0ModelTurnEvidence{}, err
	}
	var outputErr error
	var finalText string
	for attempt := 1; attempt <= phase0MaximumTurnAttempts; attempt++ {
		result, sink, err := runtime.runFixtureTurnAttempt(
			ctx,
			threadID,
			attempt,
			"read-only",
			agent.PermissionModeReadOnly,
			[]byte(phase0ReadOnlyOutputSchema),
			"Use the available execution tools to read /workspace/probe-input.txt. Return the file's value "+
				"in the fixtureToken field required by the output schema. Do not return anything else and "+
				"do not write any file.",
		)
		if err != nil {
			return Phase0ModelTurnEvidence{}, err
		}
		finalText = sink.finalText
		after, err := resources.workspaceSnapshot(ctx)
		if err != nil {
			return Phase0ModelTurnEvidence{}, err
		}
		if !reflect.DeepEqual(baseline, after) {
			return Phase0ModelTurnEvidence{}, errors.New("Phase 0 read-only turn changed the workspace")
		}
		outputErr = validatePhase0ReadOnlyOutput(finalText, fixtureToken)
		if outputErr == nil {
			return Phase0ModelTurnEvidence{
				Outcome:              string(result.Outcome),
				Attempts:             attempt,
				FixtureTokenMatched:  true,
				WorkspaceUnchanged:   true,
				OnlyExpectedMutation: true,
			}, nil
		}
	}
	return Phase0ModelTurnEvidence{}, fmt.Errorf(
		"%w after %d attempts; bounded final response %q",
		outputErr,
		phase0MaximumTurnAttempts,
		phase0BoundedDiagnosticText(finalText),
	)
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
	expectedDigest := sha256.Sum256([]byte(fixtureToken + "\n"))
	wantDigest := hex.EncodeToString(expectedDigest[:])
	outputSchema, err := phase0WorkspaceWriteOutputSchema(fixtureToken)
	if err != nil {
		return Phase0ModelTurnEvidence{}, err
	}
	var finalText string
	for attempt := 1; attempt <= phase0MaximumTurnAttempts; attempt++ {
		result, sink, err := runtime.runFixtureTurnAttempt(
			ctx,
			threadID,
			attempt,
			"workspace-write",
			agent.PermissionModeWorkspaceWrite,
			outputSchema,
			fmt.Sprintf(
				"Use the available execution tools to create /workspace/probe-output.txt containing exactly "+
					"the ASCII token %q followed by one LF and no other bytes. Do not modify any other file. "+
					"After the write succeeds, return that token in the "+
					"fixtureToken field required by the output schema and do not return anything else.",
				fixtureToken,
			),
		)
		if err != nil {
			return Phase0ModelTurnEvidence{}, err
		}
		finalText = sink.finalText
		output, mutated, err := verifyPhase0WorkspaceWriteAttempt(
			ctx,
			resources,
			baseline,
			fixtureToken,
			wantDigest,
		)
		if err != nil {
			return Phase0ModelTurnEvidence{}, err
		}
		if !mutated {
			continue
		}
		return Phase0ModelTurnEvidence{
			Outcome:              string(result.Outcome),
			Attempts:             attempt,
			FixtureTokenMatched:  true,
			WorkspaceUnchanged:   false,
			OnlyExpectedMutation: true,
			OutputSHA256:         output.SHA256,
		}, nil
	}
	return Phase0ModelTurnEvidence{}, fmt.Errorf(
		"Phase 0 workspace-write turn made no mutation after %d attempts; bounded final response %q",
		phase0MaximumTurnAttempts,
		phase0BoundedDiagnosticText(finalText),
	)
}

func (runtime *phase0CodexRuntime) runFixtureTurnAttempt(
	ctx context.Context,
	threadID string,
	attempt int,
	name string,
	permissionMode agent.PermissionMode,
	outputSchema []byte,
	prompt string,
) (agent.TurnResult, *phase0EventSink, error) {
	sink := &phase0EventSink{}
	result, err := runtime.runtime.RunTurn(ctx, agent.TurnRequest{
		ConversationID:   "phase0-" + name,
		TurnID:           fmt.Sprintf("phase0-%s-turn-%d", name, attempt),
		ProviderThreadID: threadID,
		ClientInputID:    fmt.Sprintf("phase0-%s-input-%d", name, attempt),
		Text:             phase0AttemptPrompt(attempt, prompt),
		WorkspaceRoot:    phase0WorkspaceRoot,
		Invocation:       phase0Invocation(permissionMode, runtime.model),
		OutputSchema:     append([]byte{}, outputSchema...),
		TokenUsageAttribution: agent.TokenUsageAttribution{
			Bucket:          agent.TokenUsageBucketSystem,
			Role:            agent.TokenUsageRoleAgent,
			InvocationID:    fmt.Sprintf("phase0-%s-invocation-%d", name, attempt),
			Model:           runtime.model,
			ReasoningEffort: phase0ReasoningEffort,
		},
	}, sink)
	if err != nil {
		return agent.TurnResult{}, nil, fmt.Errorf("run Phase 0 %s turn attempt %d: %w", name, attempt, err)
	}
	if result.Outcome != agent.TurnOutcomeCompleted {
		return agent.TurnResult{}, nil, fmt.Errorf("Phase 0 %s turn attempt %d ended %s", name, attempt, result.Outcome)
	}
	return result, sink, nil
}

func phase0WorkspaceWriteOutputSchema(fixtureToken string) ([]byte, error) {
	schema := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"fixtureToken": map[string]any{
				"type":        "string",
				"description": "Exact token written to /workspace/probe-output.txt.",
				"enum":        []string{fixtureToken},
			},
		},
		"required":             []string{"fixtureToken"},
		"additionalProperties": false,
	}
	encoded, err := json.Marshal(schema)
	if err != nil {
		return nil, fmt.Errorf("encode Phase 0 workspace-write output schema: %w", err)
	}
	return encoded, nil
}

func verifyPhase0WorkspaceWriteAttempt(
	ctx context.Context,
	resources *phase0DockerResources,
	baseline phase0HelperWorkspace,
	fixtureToken string,
	wantDigest string,
) (phase0HelperFile, bool, error) {
	after, err := resources.workspaceSnapshot(ctx)
	if err != nil {
		return phase0HelperFile{}, false, err
	}
	if reflect.DeepEqual(baseline, after) {
		return phase0HelperFile{}, false, nil
	}
	output, err := resources.verifyOutput(ctx)
	if err != nil {
		return phase0HelperFile{}, false, err
	}
	if output.Path != "/workspace/probe-output.txt" ||
		output.Bytes != len(fixtureToken)+1 ||
		output.SHA256 != wantDigest {
		return phase0HelperFile{}, false, fmt.Errorf(
			"Phase 0 workspace-write turn produced path %q, %d bytes, sha256 %s; want %q, %d bytes, sha256 %s",
			output.Path,
			output.Bytes,
			output.SHA256,
			"/workspace/probe-output.txt",
			len(fixtureToken)+1,
			wantDigest,
		)
	}
	if !phase0OnlyExpectedOutputAdded(baseline, after, output) {
		return phase0HelperFile{}, false, errors.New("Phase 0 workspace-write turn changed an unexpected file")
	}
	return output, true, nil
}

func phase0AttemptPrompt(attempt int, prompt string) string {
	if attempt == 1 {
		return prompt
	}
	return "The previous attempt completed without satisfying the exact task. This is the final attempt. " + prompt
}

func phase0BoundedDiagnosticText(value string) string {
	if len(value) <= phase0DiagnosticTextMaximumSize {
		return value
	}
	return value[:phase0DiagnosticTextMaximumSize] + "..."
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
	if event.Lifecycle != nil &&
		event.Lifecycle.Reason == agent.LifecycleReasonEnvironmentDisconnected {
		return errors.New("Phase 0 remote environment disconnected during the model turn")
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
	return nil
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
	return probefixture.NewToken()
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
