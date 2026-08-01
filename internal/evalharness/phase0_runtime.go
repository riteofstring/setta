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

	"setta/internal/agent"
	"setta/internal/codexaccount"
	"setta/internal/codexapp"
	"setta/internal/jsonio"
)

const phase0DeveloperInstructions = "" +
	"This is a bounded sandbox feasibility probe. Work only in /workspace. " +
	"Do not use network access, web search, MCP, plugins, skills, delegation, or user questions. " +
	"Perform only the exact read or write requested, then report the result concisely."

type phase0CodexRuntime struct {
	manager *codexapp.Manager
	runtime *agent.Runtime
	model   string
}

type phase0EventSink struct {
	finalText    string
	activityCWDs []string
}

func newPhase0CodexRuntime(
	config phase0ProbeConfig,
	execServerAddress string,
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
				"CODEX_EXEC_SERVER_URL=ws://" + execServerAddress,
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

func (runtime *phase0CodexRuntime) inspectToolEnvironment(
	ctx context.Context,
) (phase0HelperEnvironment, error) {
	readOnlyPolicy := codexapp.SandboxPolicy(json.RawMessage(`{"type":"readOnly"}`))
	cwd := phase0WorkspaceRoot
	timeout := 10_000
	raw, err := runtime.manager.Call(ctx, codexapp.CodexMethodCommandExec, codexapp.CommandExecParams{
		Command: []string{
			"/usr/local/bin/setta-eval-sandbox-helper",
			"environment",
		},
		CWD:           &cwd,
		SandboxPolicy: &readOnlyPolicy,
		TimeoutMs:     &timeout,
	})
	if err != nil {
		return phase0HelperEnvironment{}, fmt.Errorf("inspect remote tool environment: %w", err)
	}
	response, err := codexapp.DecodeCommandExecResponse(raw)
	if err != nil {
		return phase0HelperEnvironment{}, fmt.Errorf("decode remote tool environment response: %w", err)
	}
	if response.ExitCode != 0 || strings.TrimSpace(response.Stderr) != "" {
		return phase0HelperEnvironment{}, fmt.Errorf(
			"remote environment helper exited %d: %s",
			response.ExitCode,
			boundedPhase0Diagnostic(response.Stderr),
		)
	}
	var environment phase0HelperEnvironment
	if err := jsonio.DecodeSingle(strings.NewReader(response.Stdout), &environment); err != nil {
		return phase0HelperEnvironment{}, fmt.Errorf("decode effective remote environment: %w", err)
	}
	if environment.UID != phase0ContainerUID || environment.GID != phase0ContainerGID {
		return phase0HelperEnvironment{}, fmt.Errorf(
			"remote tool ran as %d:%d, want %d:%d",
			environment.UID,
			environment.GID,
			phase0ContainerUID,
			phase0ContainerGID,
		)
	}
	if err := validateEnvironmentNames(environment.EnvironmentNames); err != nil {
		return phase0HelperEnvironment{}, err
	}
	return environment, nil
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
	sink := &phase0EventSink{}
	result, err := runtime.runtime.RunTurn(ctx, agent.TurnRequest{
		ConversationID:   "phase0-read-only",
		TurnID:           "phase0-read-only-turn",
		ProviderThreadID: threadID,
		ClientInputID:    "phase0-read-only-input",
		Text: "Read /workspace/probe-input.txt and reply with exactly its contents, " +
			"with no quotation marks or commentary. Do not write any file.",
		WorkspaceRoot: phase0WorkspaceRoot,
		Invocation:    phase0Invocation(agent.PermissionModeReadOnly, runtime.model),
		TokenUsageAttribution: agent.TokenUsageAttribution{
			Bucket:          agent.TokenUsageBucketSystem,
			Role:            agent.TokenUsageRoleAgent,
			InvocationID:    "phase0-read-only-invocation",
			Model:           runtime.model,
			ReasoningEffort: phase0ReasoningEffort,
		},
	}, sink)
	if err != nil {
		return Phase0ModelTurnEvidence{}, fmt.Errorf("run Phase 0 read-only turn: %w", err)
	}
	if result.Outcome != agent.TurnOutcomeCompleted {
		return Phase0ModelTurnEvidence{}, fmt.Errorf("Phase 0 read-only turn ended %s", result.Outcome)
	}
	if strings.TrimSpace(sink.finalText) != fixtureToken {
		return Phase0ModelTurnEvidence{}, errors.New("Phase 0 read-only turn did not return the fixture token exactly")
	}
	after, err := resources.workspaceSnapshot(ctx)
	if err != nil {
		return Phase0ModelTurnEvidence{}, err
	}
	unchanged := reflect.DeepEqual(baseline, after)
	if !unchanged {
		return Phase0ModelTurnEvidence{}, errors.New("Phase 0 read-only turn changed the workspace")
	}
	return Phase0ModelTurnEvidence{
		Outcome:              string(result.Outcome),
		FixtureTokenObserved: true,
		WorkspaceUnchanged:   true,
		OnlyExpectedMutation: true,
		ActivityCWDs:         sink.sortedActivityCWDs(),
	}, nil
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
