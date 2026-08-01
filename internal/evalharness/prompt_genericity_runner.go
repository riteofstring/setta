package evalharness

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"setta/internal/agent"
	"setta/internal/conversation"
	"setta/internal/director"
	"setta/internal/jsonio"
	"setta/internal/narration"
)

const (
	promptGenericityRubricRelativePath        = "evals/prompt-genericity-rubric.md"
	promptGenericityRubricMaximumBytes  int64 = 64 * 1024
	promptGenericityTimeout                   = 10 * time.Minute
	promptGenericitySyntheticScenarioID       = "prompt-genericity"
)

type promptGenericityPromptInput struct {
	Role    conversation.Role `json:"role"`
	Surface string            `json:"surface"`
	Prompt  string            `json:"prompt"`
}

type promptGenericityJudgeInput struct {
	Prompts   []promptGenericityPromptInput `json:"prompts"`
	Scenarios []Scenario                    `json:"scenarios"`
}

func runPromptGenericityJudge(
	ctx context.Context,
	repoRoot string,
	codexCommand string,
	scenarios []Scenario,
) (artifact PromptGenericityArtifact, returnErr error) {
	if ctx == nil {
		return PromptGenericityArtifact{}, errors.New("prompt genericity context is required")
	}
	prompts, err := promptGenericityPrompts()
	if err != nil {
		return PromptGenericityArtifact{}, err
	}
	if err := validatePromptGenericityScenarios(scenarios); err != nil {
		return PromptGenericityArtifact{}, err
	}
	rubric, err := readPromptGenericityRubric(repoRoot)
	if err != nil {
		return PromptGenericityArtifact{}, err
	}
	input, err := json.Marshal(promptGenericityJudgeInput{
		Prompts:   prompts,
		Scenarios: append([]Scenario{}, scenarios...),
	})
	if err != nil {
		return PromptGenericityArtifact{}, fmt.Errorf("encode prompt genericity input: %w", err)
	}
	outputSchema, err := promptGenericityOutputSchema(prompts, scenarios)
	if err != nil {
		return PromptGenericityArtifact{}, err
	}
	randomID, err := phase0RandomHex(16)
	if err != nil {
		return PromptGenericityArtifact{}, fmt.Errorf("create prompt genericity invocation id: %w", err)
	}
	invocationID := "prompt-audit-" + randomID
	workspaceRoot, err := os.MkdirTemp("/tmp", "setta-eval-prompt-audit-")
	if err != nil {
		return PromptGenericityArtifact{}, fmt.Errorf("create prompt genericity workspace: %w", err)
	}
	defer removePromptGenericityWorkspace(workspaceRoot, &returnErr)

	observer := &judgeTokenObserver{observations: []agent.TokenUsageObservation{}}
	runtime := newCommunicationJudgeRuntime(codexCommand, observer)
	runtimeShutdown := false
	defer func() {
		if runtimeShutdown {
			return
		}
		returnErr = errors.Join(returnErr, stopPromptGenericityRuntime(runtime))
	}()
	requested := agent.Invocation{
		Model:           JudgeModel,
		ReasoningEffort: JudgeReasoningEffort,
		PermissionMode:  agent.PermissionModeReadOnly,
		ApprovalMode:    agent.ApprovalModeNever,
	}
	auditContext, cancel := context.WithTimeout(ctx, promptGenericityTimeout)
	defer cancel()
	if err := resolveFixedCommunicationJudge(auditContext, runtime, requested); err != nil {
		return PromptGenericityArtifact{}, fmt.Errorf("preflight prompt genericity judge: %w", err)
	}
	providerResult, err := runtime.RunFreshStructuredCall(
		auditContext,
		agent.FreshStructuredCallRequest{
			ID:            invocationID,
			WorkspaceRoot: workspaceRoot,
			Invocation:    requested,
			TokenUsageAttribution: agent.TokenUsageAttribution{
				Bucket:          agent.TokenUsageBucketJudge,
				Role:            agent.TokenUsageRoleJudge,
				InvocationID:    invocationID,
				Model:           JudgeModel,
				ReasoningEffort: JudgeReasoningEffort,
				ServiceTier:     nil,
			},
			DeveloperInstructions: rubric,
			Input:                 input,
			OutputSchema:          outputSchema,
		},
	)
	if err != nil {
		return PromptGenericityArtifact{}, fmt.Errorf("run prompt genericity judge: %w", err)
	}
	var output promptGenericityJudgeOutput
	if err := jsonio.DecodeSingle(bytes.NewReader(providerResult.Output), &output); err != nil {
		return PromptGenericityArtifact{}, fmt.Errorf("decode prompt genericity verdict: %w", err)
	}
	if err := validatePromptGenericityFindingExcerpts(output.Findings, prompts); err != nil {
		return PromptGenericityArtifact{}, err
	}
	runtimeShutdown = true
	if err := stopPromptGenericityRuntime(runtime); err != nil {
		return PromptGenericityArtifact{}, err
	}
	usage, err := promptGenericityTokenUsage(observer)
	if err != nil {
		return PromptGenericityArtifact{}, err
	}
	scenarioReferences, err := promptGenericityScenarioReferences(scenarios)
	if err != nil {
		return PromptGenericityArtifact{}, err
	}
	artifact = PromptGenericityArtifact{
		SchemaVersion: PromptGenericitySchemaVersion,
		Configuration: FixedJudgeConfiguration(),
		RubricSHA256:  promptGenericityDigest([]byte(rubric)),
		Prompts:       promptGenericityPromptReferences(prompts),
		Scenarios:     scenarioReferences,
		Invocation: JudgeInvocation{
			ID:               invocationID,
			ProviderThreadID: providerResult.ProviderThreadID,
			ProviderTurnID:   providerResult.ProviderTurnID,
		},
		Verdict:    promptGenericityVerdict(output),
		TokenUsage: usage,
	}
	if err := artifact.Validate(); err != nil {
		return PromptGenericityArtifact{}, fmt.Errorf("validate prompt genericity artifact: %w", err)
	}
	return artifact, nil
}

func promptGenericityPrompts() ([]promptGenericityPromptInput, error) {
	surfaces := make([]conversation.RolePromptSurface, 0)
	surfaces = append(surfaces, director.PromptSurfaces()...)
	surfaces = append(surfaces, conversation.AgentPromptSurfaces()...)
	surfaces = append(surfaces, narration.PromptSurfaces()...)
	prompts := make([]promptGenericityPromptInput, 0, len(surfaces))
	seen := map[string]bool{}
	for index, surface := range surfaces {
		if !auditedPromptRole(surface.Role) {
			return nil, fmt.Errorf("role prompt surface[%d] has unsupported role %q", index, surface.Role)
		}
		if err := validateScenarioIdentifier("role prompt surface", surface.Surface); err != nil {
			return nil, err
		}
		if strings.TrimSpace(surface.Prompt) == "" {
			return nil, fmt.Errorf("role prompt surface %s/%s has empty prompt text", surface.Role, surface.Surface)
		}
		key := promptGenericitySurfaceKey(surface.Role, surface.Surface)
		if seen[key] {
			return nil, fmt.Errorf("role prompt surfaces repeat %s", key)
		}
		seen[key] = true
		prompts = append(prompts, promptGenericityPromptInput{
			Role:    surface.Role,
			Surface: surface.Surface,
			Prompt:  surface.Prompt,
		})
	}
	return prompts, nil
}

func validatePromptGenericityScenarios(scenarios []Scenario) error {
	if scenarios == nil || len(scenarios) == 0 || len(scenarios) > ResultMaximumScenarios {
		return fmt.Errorf("prompt genericity scenario catalog contains %d entries", len(scenarios))
	}
	seen := map[string]bool{}
	for index, scenario := range scenarios {
		if err := scenario.Validate(); err != nil {
			return fmt.Errorf("prompt genericity scenario[%d]: %w", index, err)
		}
		if seen[scenario.ID] {
			return fmt.Errorf("prompt genericity scenarios repeat %s", scenario.ID)
		}
		seen[scenario.ID] = true
	}
	return nil
}

func readPromptGenericityRubric(repoRoot string) (string, error) {
	path := filepath.Join(repoRoot, filepath.FromSlash(promptGenericityRubricRelativePath))
	info, err := os.Lstat(path)
	if err != nil {
		return "", fmt.Errorf("inspect prompt genericity rubric: %w", err)
	}
	if !info.Mode().IsRegular() || info.Size() <= 0 || info.Size() > promptGenericityRubricMaximumBytes {
		return "", fmt.Errorf(
			"prompt genericity rubric must be a 1-%d byte regular file",
			promptGenericityRubricMaximumBytes,
		)
	}
	payload, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read prompt genericity rubric: %w", err)
	}
	rubric := strings.TrimSpace(string(payload))
	if rubric == "" {
		return "", errors.New("prompt genericity rubric is empty")
	}
	return rubric, nil
}

func promptGenericityOutputSchema(
	prompts []promptGenericityPromptInput,
	scenarios []Scenario,
) (json.RawMessage, error) {
	checkNames := []string{
		string(PromptGenericityNoScenarioLiterals),
		string(PromptGenericityNoFixtureSpecificRules),
		string(PromptGenericityNoExpectedOutcomeLeakage),
		string(PromptGenericityPrinciplesCoverEquivalents),
		string(PromptGenericityExamplesTransferable),
	}
	surfaces := make([]string, len(prompts))
	for index, prompt := range prompts {
		surfaces[index] = prompt.Surface
	}
	scenarioIDs := make([]string, len(scenarios))
	for index, scenario := range scenarios {
		scenarioIDs[index] = scenario.ID
	}
	checks := map[string]any{
		"type":                 "object",
		"additionalProperties": false,
		"required": []string{
			"noScenarioLiterals",
			"noFixtureSpecificRules",
			"noExpectedOutcomeLeakage",
			"principlesCoverEquivalentCases",
			"examplesAreTransferable",
		},
		"properties": map[string]any{
			"noScenarioLiterals":             map[string]any{"type": "boolean"},
			"noFixtureSpecificRules":         map[string]any{"type": "boolean"},
			"noExpectedOutcomeLeakage":       map[string]any{"type": "boolean"},
			"principlesCoverEquivalentCases": map[string]any{"type": "boolean"},
			"examplesAreTransferable":        map[string]any{"type": "boolean"},
		},
	}
	stringField := func(maxLength int) map[string]any {
		return map[string]any{"type": "string", "minLength": 1, "maxLength": maxLength}
	}
	finding := map[string]any{
		"type":                 "object",
		"additionalProperties": false,
		"required": []string{
			"check",
			"severity",
			"role",
			"surface",
			"promptExcerpt",
			"scenarioIds",
			"explanation",
			"recommendation",
		},
		"properties": map[string]any{
			"check":    map[string]any{"type": "string", "enum": checkNames},
			"severity": map[string]any{"type": "string", "enum": []string{"high", "medium", "low"}},
			"role": map[string]any{
				"type": "string",
				"enum": []string{
					string(conversation.RoleDirector),
					string(conversation.RoleAgent),
					string(conversation.RoleNarrator),
				},
			},
			"surface":       map[string]any{"type": "string", "enum": surfaces},
			"promptExcerpt": stringField(PromptGenericityMaximumTextBytes),
			"scenarioIds": map[string]any{
				"type":     "array",
				"maxItems": len(scenarioIDs),
				"items":    map[string]any{"type": "string", "enum": scenarioIDs},
			},
			"explanation":    stringField(PromptGenericityMaximumTextBytes),
			"recommendation": stringField(PromptGenericityMaximumTextBytes),
		},
	}
	payload, err := json.Marshal(map[string]any{
		"type":                 "object",
		"additionalProperties": false,
		"required":             []string{"checks", "findings"},
		"properties": map[string]any{
			"checks": checks,
			"findings": map[string]any{
				"type":     "array",
				"maxItems": PromptGenericityMaximumFindings,
				"items":    finding,
			},
		},
	})
	if err != nil {
		return nil, fmt.Errorf("encode prompt genericity output schema: %w", err)
	}
	return payload, nil
}

func promptGenericityTokenUsage(
	observer *judgeTokenObserver,
) (TokenUsageBucketResult, error) {
	observations, err := observer.snapshotOptional()
	if err != nil {
		return TokenUsageBucketResult{}, err
	}
	if len(observations) == 0 {
		return TokenUsageBucketResult{}, errors.New("prompt genericity judge returned no token evidence")
	}
	usage, err := AggregateScenarioTokenUsage(
		promptGenericitySyntheticScenarioID,
		EvaluationAttemptFirst,
		observations,
	)
	if err != nil {
		return TokenUsageBucketResult{}, fmt.Errorf("aggregate prompt genericity token evidence: %w", err)
	}
	if usage.System.EvidenceAvailable || !usage.Judge.EvidenceAvailable {
		return TokenUsageBucketResult{}, errors.New("prompt genericity accounting did not stay in the judge bucket")
	}
	return usage.Judge, nil
}

func promptGenericityPromptReferences(
	prompts []promptGenericityPromptInput,
) []PromptGenericityPromptReference {
	references := make([]PromptGenericityPromptReference, len(prompts))
	for index, prompt := range prompts {
		references[index] = PromptGenericityPromptReference{
			Role:    prompt.Role,
			Surface: prompt.Surface,
			SHA256:  promptGenericityDigest([]byte(prompt.Prompt)),
		}
	}
	return references
}

func validatePromptGenericityFindingExcerpts(
	findings []PromptGenericityFinding,
	prompts []promptGenericityPromptInput,
) error {
	promptText := make(map[string]string, len(prompts))
	for _, prompt := range prompts {
		promptText[promptGenericitySurfaceKey(prompt.Role, prompt.Surface)] = prompt.Prompt
	}
	for index, finding := range findings {
		prompt, exists := promptText[promptGenericitySurfaceKey(finding.Role, finding.Surface)]
		if !exists {
			return fmt.Errorf("prompt genericity finding[%d] references an unknown prompt surface", index)
		}
		if !strings.Contains(prompt, finding.PromptExcerpt) {
			return fmt.Errorf("prompt genericity finding[%d] promptExcerpt is not exact production prompt text", index)
		}
	}
	return nil
}

func promptGenericityScenarioReferences(
	scenarios []Scenario,
) ([]PromptGenericityScenarioReference, error) {
	references := make([]PromptGenericityScenarioReference, len(scenarios))
	for index, scenario := range scenarios {
		payload, err := json.Marshal(scenario)
		if err != nil {
			return nil, fmt.Errorf("encode prompt genericity scenario %s: %w", scenario.ID, err)
		}
		references[index] = PromptGenericityScenarioReference{
			ScenarioID: scenario.ID,
			SHA256:     promptGenericityDigest(payload),
		}
	}
	return references, nil
}

func promptGenericityDigest(payload []byte) string {
	digest := sha256.Sum256(payload)
	return hex.EncodeToString(digest[:])
}

func removePromptGenericityWorkspace(path string, returnErr *error) {
	if err := os.RemoveAll(path); err != nil {
		*returnErr = errors.Join(*returnErr, fmt.Errorf("remove prompt genericity workspace: %w", err))
	}
}

func stopPromptGenericityRuntime(runtime *agent.Runtime) error {
	shutdownContext, cancel := context.WithTimeout(context.Background(), judgeShutdownTimeout)
	defer cancel()
	if err := runtime.Shutdown(shutdownContext); err != nil {
		return fmt.Errorf("stop prompt genericity provider: %w", err)
	}
	return nil
}
