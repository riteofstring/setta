package evalharness

import (
	"errors"
	"fmt"
	"reflect"
	"sort"

	"setta/internal/agent"
	"setta/internal/codexapp"
	"setta/internal/conversation"
)

const TokenUsageSchemaVersion = 2

type TokenUsageArtifact struct {
	SchemaVersion int                  `json:"schemaVersion"`
	Scenarios     []ScenarioTokenUsage `json:"scenarios"`
}

type ScenarioTokenUsage struct {
	ScenarioID string                 `json:"scenarioId"`
	Attempt    int                    `json:"attempt"`
	System     TokenUsageBucketResult `json:"system"`
	Judge      TokenUsageBucketResult `json:"judge"`
}

type TokenUsageBucketResult struct {
	EvidenceAvailable bool                         `json:"evidenceAvailable"`
	ProviderTurns     []ProviderTurnTokenUsage     `json:"providerTurns"`
	Roles             []RoleTokenUsage             `json:"roles"`
	Total             codexapp.TokenUsageBreakdown `json:"total"`
}

type ProviderTurnTokenUsage struct {
	Attribution         agent.TokenUsageAttribution  `json:"attribution"`
	ProviderThreadID    string                       `json:"providerThreadId"`
	ProviderTurnID      string                       `json:"providerTurnId"`
	UpdateCount         int                          `json:"updateCount"`
	Usage               codexapp.TokenUsageBreakdown `json:"usage"`
	FinalProviderRecord codexapp.ThreadTokenUsage    `json:"finalProviderRecord"`
}

type RoleTokenUsage struct {
	Role   agent.TokenUsageRole         `json:"role"`
	Models []ModelTokenUsage            `json:"models"`
	Total  codexapp.TokenUsageBreakdown `json:"total"`
}

type ModelTokenUsage struct {
	Model           string                       `json:"model"`
	ReasoningEffort string                       `json:"reasoningEffort"`
	ServiceTier     *string                      `json:"serviceTier"`
	Total           codexapp.TokenUsageBreakdown `json:"total"`
}

type tokenTurnState struct {
	usage    ProviderTurnTokenUsage
	baseline codexapp.TokenUsageBreakdown
}

type tokenThreadState struct {
	activeTurnID string
	finalTotal   codexapp.TokenUsageBreakdown
	seenTurns    map[string]bool
}

type tokenUsageModelKey struct {
	role            agent.TokenUsageRole
	model           string
	reasoningEffort string
	serviceTier     string
	hasServiceTier  bool
}

type tokenUsageAccumulator struct {
	threads             map[string]*tokenThreadState
	turns               map[string]*tokenTurnState
	orderedTurns        []string
	providerTurnThreads map[string]string
}

func EmptyScenarioTokenUsage(scenarioID string, attempt int) ScenarioTokenUsage {
	return ScenarioTokenUsage{
		ScenarioID: scenarioID,
		Attempt:    attempt,
		System:     emptyTokenUsageBucket(),
		Judge:      emptyTokenUsageBucket(),
	}
}

func AggregateScenarioTokenUsage(
	scenarioID string,
	attempt int,
	observations []agent.TokenUsageObservation,
) (ScenarioTokenUsage, error) {
	result := EmptyScenarioTokenUsage(scenarioID, attempt)
	if err := validateScenarioIdentifier("token usage scenario id", scenarioID); err != nil {
		return ScenarioTokenUsage{}, err
	}
	if err := validateEvaluationAttempt(attempt); err != nil {
		return ScenarioTokenUsage{}, err
	}
	if len(observations) == 0 {
		return ScenarioTokenUsage{}, errors.New("token usage observations must not be empty")
	}

	accumulator := newTokenUsageAccumulator()
	for index, observation := range observations {
		if err := accumulator.observe(index, observation); err != nil {
			return ScenarioTokenUsage{}, err
		}
	}

	for _, key := range accumulator.orderedTurns {
		usage := accumulator.turns[key].usage
		switch usage.Attribution.Bucket {
		case agent.TokenUsageBucketSystem:
			result.System.ProviderTurns = append(result.System.ProviderTurns, usage)
		case agent.TokenUsageBucketJudge:
			result.Judge.ProviderTurns = append(result.Judge.ProviderTurns, usage)
		default:
			return ScenarioTokenUsage{}, fmt.Errorf("provider turn %s has unsupported accounting bucket %q", usage.ProviderTurnID, usage.Attribution.Bucket)
		}
	}
	var err error
	result.System, err = summarizeTokenUsageBucket(result.System.ProviderTurns)
	if err != nil {
		return ScenarioTokenUsage{}, err
	}
	result.Judge, err = summarizeTokenUsageBucket(result.Judge.ProviderTurns)
	if err != nil {
		return ScenarioTokenUsage{}, err
	}
	if err := result.Validate(); err != nil {
		return ScenarioTokenUsage{}, err
	}
	return result, nil
}

func newTokenUsageAccumulator() *tokenUsageAccumulator {
	return &tokenUsageAccumulator{
		threads:             map[string]*tokenThreadState{},
		turns:               map[string]*tokenTurnState{},
		orderedTurns:        []string{},
		providerTurnThreads: map[string]string{},
	}
}

func (accumulator *tokenUsageAccumulator) observe(
	index int,
	observation agent.TokenUsageObservation,
) error {
	if err := observation.Validate(); err != nil {
		return fmt.Errorf("token usage observation[%d]: %w", index, err)
	}
	if err := accumulator.registerProviderTurnThread(observation); err != nil {
		return err
	}
	thread := accumulator.thread(observation.ProviderThreadID)
	turn, err := accumulator.turn(thread, observation)
	if err != nil {
		return err
	}
	if !equalTokenAttribution(turn.usage.Attribution, observation.Attribution) {
		return fmt.Errorf("provider turn %s changed token attribution", observation.ProviderTurnID)
	}
	if err := requireNondecreasingTokenBreakdown(
		"thread "+observation.ProviderThreadID+" cumulative total",
		thread.finalTotal,
		observation.TokenUsage.Total,
	); err != nil {
		return err
	}
	usage, err := subtractTokenBreakdown(observation.TokenUsage.Total, turn.baseline)
	if err != nil {
		return fmt.Errorf("provider turn %s usage delta: %w", observation.ProviderTurnID, err)
	}
	turn.usage.UpdateCount++
	turn.usage.Usage = usage
	turn.usage.FinalProviderRecord = cloneThreadTokenUsage(observation.TokenUsage)
	thread.finalTotal = cloneTokenBreakdown(observation.TokenUsage.Total)
	return nil
}

func (accumulator *tokenUsageAccumulator) registerProviderTurnThread(
	observation agent.TokenUsageObservation,
) error {
	threadID, exists := accumulator.providerTurnThreads[observation.ProviderTurnID]
	if exists && threadID != observation.ProviderThreadID {
		return fmt.Errorf(
			"provider turn %s appeared on both %s and %s",
			observation.ProviderTurnID,
			threadID,
			observation.ProviderThreadID,
		)
	}
	accumulator.providerTurnThreads[observation.ProviderTurnID] = observation.ProviderThreadID
	return nil
}

func (accumulator *tokenUsageAccumulator) thread(threadID string) *tokenThreadState {
	thread := accumulator.threads[threadID]
	if thread == nil {
		thread = &tokenThreadState{seenTurns: map[string]bool{}}
		accumulator.threads[threadID] = thread
	}
	return thread
}

func (accumulator *tokenUsageAccumulator) turn(
	thread *tokenThreadState,
	observation agent.TokenUsageObservation,
) (*tokenTurnState, error) {
	key := tokenProviderTurnKey(observation.ProviderThreadID, observation.ProviderTurnID)
	turn := accumulator.turns[key]
	if turn != nil {
		if thread.activeTurnID != observation.ProviderTurnID {
			return nil, fmt.Errorf("provider turn %s emitted usage after thread %s advanced", observation.ProviderTurnID, observation.ProviderThreadID)
		}
		return turn, nil
	}
	if thread.seenTurns[observation.ProviderTurnID] {
		return nil, fmt.Errorf("provider turn %s resumed after a later turn", observation.ProviderTurnID)
	}
	thread.activeTurnID = observation.ProviderTurnID
	thread.seenTurns[observation.ProviderTurnID] = true
	turn = &tokenTurnState{
		baseline: cloneTokenBreakdown(thread.finalTotal),
		usage: ProviderTurnTokenUsage{
			Attribution:      cloneTokenAttribution(observation.Attribution),
			ProviderThreadID: observation.ProviderThreadID,
			ProviderTurnID:   observation.ProviderTurnID,
		},
	}
	accumulator.turns[key] = turn
	accumulator.orderedTurns = append(accumulator.orderedTurns, key)
	return turn, nil
}

func NewTokenUsageArtifact(scenarios []ScenarioTokenUsage) (TokenUsageArtifact, error) {
	artifact := TokenUsageArtifact{
		SchemaVersion: TokenUsageSchemaVersion,
		Scenarios:     cloneScenarioTokenUsages(scenarios),
	}
	if err := artifact.Validate(); err != nil {
		return TokenUsageArtifact{}, err
	}
	return artifact, nil
}

func (artifact TokenUsageArtifact) Validate() error {
	if artifact.SchemaVersion != TokenUsageSchemaVersion {
		return fmt.Errorf("token usage schemaVersion is %d, want %d", artifact.SchemaVersion, TokenUsageSchemaVersion)
	}
	if artifact.Scenarios == nil || len(artifact.Scenarios) == 0 ||
		len(artifact.Scenarios) > ResultMaximumAttempts {
		return fmt.Errorf("token usage contains %d attempts, want 1-%d", len(artifact.Scenarios), ResultMaximumAttempts)
	}
	seen := map[evaluationAttemptIdentity]bool{}
	for index, scenario := range artifact.Scenarios {
		if err := scenario.Validate(); err != nil {
			return fmt.Errorf("token usage scenario[%d]: %w", index, err)
		}
		identity := evaluationAttemptIdentity{ScenarioID: scenario.ScenarioID, Attempt: scenario.Attempt}
		if seen[identity] {
			return fmt.Errorf("token usage scenario attempt %s/%d is duplicated", scenario.ScenarioID, scenario.Attempt)
		}
		seen[identity] = true
	}
	return nil
}

func (scenario ScenarioTokenUsage) Validate() error {
	if err := validateScenarioIdentifier("token usage scenario id", scenario.ScenarioID); err != nil {
		return err
	}
	if err := validateEvaluationAttempt(scenario.Attempt); err != nil {
		return err
	}
	if err := validateTokenUsageBucket(agent.TokenUsageBucketSystem, scenario.System); err != nil {
		return fmt.Errorf("scenario %s system tokens: %w", scenario.ScenarioID, err)
	}
	if err := validateTokenUsageBucket(agent.TokenUsageBucketJudge, scenario.Judge); err != nil {
		return fmt.Errorf("scenario %s judge tokens: %w", scenario.ScenarioID, err)
	}
	seenProviderTurns := map[string]bool{}
	seenProviderThreads := map[string]agent.TokenUsageBucket{}
	for _, bucket := range []TokenUsageBucketResult{scenario.System, scenario.Judge} {
		for _, turn := range bucket.ProviderTurns {
			key := tokenProviderTurnKey(turn.ProviderThreadID, turn.ProviderTurnID)
			if seenProviderTurns[key] {
				return fmt.Errorf("scenario %s provider turn %s is duplicated across accounting buckets", scenario.ScenarioID, turn.ProviderTurnID)
			}
			seenProviderTurns[key] = true
			previousBucket, exists := seenProviderThreads[turn.ProviderThreadID]
			if exists && previousBucket != turn.Attribution.Bucket {
				return fmt.Errorf("scenario %s provider thread %s crosses accounting buckets", scenario.ScenarioID, turn.ProviderThreadID)
			}
			seenProviderThreads[turn.ProviderThreadID] = turn.Attribution.Bucket
		}
	}
	return nil
}

func CorrelateSystemTokenUsage(
	usage ScenarioTokenUsage,
	invocations []conversation.ResolvedInvocation,
) error {
	if !usage.System.EvidenceAvailable {
		return errors.New("system token evidence is unavailable")
	}
	expected, err := expectedTokenInvocations(invocations)
	if err != nil {
		return err
	}
	seen := map[string]bool{}
	for _, providerTurn := range usage.System.ProviderTurns {
		key, matched, err := correlateProviderTurn(providerTurn, expected)
		if err != nil {
			return err
		}
		if matched {
			seen[key] = true
		}
	}
	for key, invocation := range expected {
		if !seen[key] {
			return fmt.Errorf("resolved invocation %s provider turn %s has no system token evidence", invocation.ID, *invocation.ProviderReferences.TurnID)
		}
	}
	return nil
}

func expectedTokenInvocations(
	invocations []conversation.ResolvedInvocation,
) (map[string]conversation.ResolvedInvocation, error) {
	expected := map[string]conversation.ResolvedInvocation{}
	for index, invocation := range invocations {
		if err := invocation.Validate(); err != nil {
			return nil, fmt.Errorf("resolved invocation[%d]: %w", index, err)
		}
		if invocation.ProviderReferences.TurnID == nil {
			continue
		}
		key := invocation.ID + "\x00" + *invocation.ProviderReferences.TurnID
		previous, exists := expected[key]
		if exists && !equalResolvedInvocation(previous, invocation) {
			return nil, fmt.Errorf("resolved invocation %s/%s has conflicting records", invocation.ID, *invocation.ProviderReferences.TurnID)
		}
		expected[key] = invocation
	}
	return expected, nil
}

func correlateProviderTurn(
	providerTurn ProviderTurnTokenUsage,
	expected map[string]conversation.ResolvedInvocation,
) (string, bool, error) {
	key := providerTurn.Attribution.InvocationID + "\x00" + providerTurn.ProviderTurnID
	invocation, ok := expected[key]
	if !ok {
		// Successful Narrator calls may update narrator state without creating a
		// public NarrationEvent when there is no user-visible text. Checkpoint
		// calls are intentionally state-only. Their trusted caller still
		// supplies resolved attribution before the provider turn begins, so they
		// remain countable without inventing a durable public event.
		if providerTurn.Attribution.Role == agent.TokenUsageRoleNarrator {
			return "", false, nil
		}
		return "", false, fmt.Errorf(
			"system provider turn %s has no matching resolved invocation %s",
			providerTurn.ProviderTurnID,
			providerTurn.Attribution.InvocationID,
		)
	}
	role, err := tokenRoleForConversationRole(invocation.Role)
	if err != nil {
		return "", false, err
	}
	if providerTurn.Attribution.Role != role ||
		providerTurn.Attribution.Model != tokenInvocationStartModel(invocation) ||
		providerTurn.Attribution.ReasoningEffort != string(invocation.Resolved.ReasoningEffort) ||
		!equalOptionalTokenString(providerTurn.Attribution.ServiceTier, invocation.Resolved.ServiceTier) {
		return "", false, fmt.Errorf("system provider turn %s attribution does not match resolved invocation %s", providerTurn.ProviderTurnID, invocation.ID)
	}
	return key, true, nil
}

func tokenInvocationStartModel(invocation conversation.ResolvedInvocation) string {
	if invocation.Role == conversation.RoleSideAgent && len(invocation.ModelReroutes) > 0 {
		return invocation.ModelReroutes[len(invocation.ModelReroutes)-1].ToModelID
	}
	return invocation.Resolved.ModelID
}

func scenarioFinalThreadTokenTotals(usage ScenarioTokenUsage) map[string]int64 {
	totals := map[string]int64{}
	for _, bucket := range []TokenUsageBucketResult{usage.System, usage.Judge} {
		for _, turn := range bucket.ProviderTurns {
			totals[turn.ProviderThreadID] = int64(turn.FinalProviderRecord.Total.TotalTokens)
		}
	}
	return totals
}

func summarizeTokenUsageBucket(
	providerTurns []ProviderTurnTokenUsage,
) (TokenUsageBucketResult, error) {
	result := emptyTokenUsageBucket()
	result.ProviderTurns = cloneProviderTurnTokenUsages(providerTurns)
	result.EvidenceAvailable = len(providerTurns) > 0
	models := map[tokenUsageModelKey]codexapp.TokenUsageBreakdown{}
	for _, providerTurn := range providerTurns {
		var err error
		result.Total, err = addTokenBreakdown(result.Total, providerTurn.Usage)
		if err != nil {
			return TokenUsageBucketResult{}, err
		}
		key := tokenUsageModelKey{
			role:            providerTurn.Attribution.Role,
			model:           providerTurn.Attribution.Model,
			reasoningEffort: providerTurn.Attribution.ReasoningEffort,
		}
		if providerTurn.Attribution.ServiceTier != nil {
			key.serviceTier = *providerTurn.Attribution.ServiceTier
			key.hasServiceTier = true
		}
		models[key], err = addTokenBreakdown(models[key], providerTurn.Usage)
		if err != nil {
			return TokenUsageBucketResult{}, err
		}
	}
	roles := map[agent.TokenUsageRole][]tokenUsageModelKey{}
	for key := range models {
		roles[key.role] = append(roles[key.role], key)
	}
	for _, role := range tokenUsageRoleOrder {
		keys := roles[role]
		if len(keys) == 0 {
			continue
		}
		sort.Slice(keys, func(left int, right int) bool {
			return tokenModelKey(keys[left]) < tokenModelKey(keys[right])
		})
		roleUsage := RoleTokenUsage{Role: role, Models: []ModelTokenUsage{}}
		for _, key := range keys {
			var serviceTier *string
			if key.hasServiceTier {
				serviceTier = cloneOptionalTokenString(&key.serviceTier)
			}
			modelTotal := models[key]
			roleUsage.Models = append(roleUsage.Models, ModelTokenUsage{
				Model:           key.model,
				ReasoningEffort: key.reasoningEffort,
				ServiceTier:     serviceTier,
				Total:           cloneTokenBreakdown(modelTotal),
			})
			var err error
			roleUsage.Total, err = addTokenBreakdown(roleUsage.Total, modelTotal)
			if err != nil {
				return TokenUsageBucketResult{}, err
			}
		}
		result.Roles = append(result.Roles, roleUsage)
	}
	return result, nil
}

var tokenUsageRoleOrder = []agent.TokenUsageRole{
	agent.TokenUsageRoleDirector,
	agent.TokenUsageRoleAgent,
	agent.TokenUsageRoleNarrator,
	agent.TokenUsageRoleSideAgent,
	agent.TokenUsageRoleJudge,
}

func validateTokenUsageBucket(bucket agent.TokenUsageBucket, result TokenUsageBucketResult) error {
	if result.ProviderTurns == nil || result.Roles == nil {
		return errors.New("providerTurns and roles must be arrays")
	}
	if err := validateTokenBreakdown("bucket total", result.Total); err != nil {
		return err
	}
	if result.EvidenceAvailable != (len(result.ProviderTurns) > 0) {
		return errors.New("evidenceAvailable must match whether provider turns are present")
	}
	if err := validateProviderTurns(bucket, result.ProviderTurns); err != nil {
		return err
	}
	if err := validateProviderTurnDeltas(result.ProviderTurns); err != nil {
		return err
	}
	return validateTokenUsageSummaries(result)
}

func validateProviderTurns(
	bucket agent.TokenUsageBucket,
	providerTurns []ProviderTurnTokenUsage,
) error {
	for index, turn := range providerTurns {
		if turn.Attribution.Bucket != bucket {
			return fmt.Errorf("provider turn[%d] belongs to bucket %s", index, turn.Attribution.Bucket)
		}
		if turn.UpdateCount <= 0 {
			return fmt.Errorf("provider turn[%d] has invalid update count", index)
		}
		if err := validateTokenBreakdown("provider turn usage", turn.Usage); err != nil {
			return err
		}
		observation := agent.TokenUsageObservation{
			Attribution:      turn.Attribution,
			ProviderThreadID: turn.ProviderThreadID,
			ProviderTurnID:   turn.ProviderTurnID,
			TokenUsage:       turn.FinalProviderRecord,
		}
		if err := observation.Validate(); err != nil {
			return fmt.Errorf("provider turn[%d] final record: %w", index, err)
		}
	}
	return nil
}

func validateTokenUsageSummaries(result TokenUsageBucketResult) error {
	summarized, err := summarizeTokenUsageBucket(result.ProviderTurns)
	if err != nil {
		return err
	}
	if !reflect.DeepEqual(summarized.Roles, result.Roles) ||
		!reflect.DeepEqual(summarized.Total, result.Total) {
		return errors.New("role or total token summaries do not match provider turns")
	}
	return nil
}

func validateProviderTurnDeltas(providerTurns []ProviderTurnTokenUsage) error {
	accumulator := newTokenUsageAccumulator()
	for index, providerTurn := range providerTurns {
		observation := agent.TokenUsageObservation{
			Attribution:      providerTurn.Attribution,
			ProviderThreadID: providerTurn.ProviderThreadID,
			ProviderTurnID:   providerTurn.ProviderTurnID,
			TokenUsage:       providerTurn.FinalProviderRecord,
		}
		if err := accumulator.observe(index, observation); err != nil {
			return fmt.Errorf("validate provider turn deltas: %w", err)
		}
		derived := accumulator.turns[tokenProviderTurnKey(
			providerTurn.ProviderThreadID,
			providerTurn.ProviderTurnID,
		)].usage.Usage
		if !reflect.DeepEqual(derived, providerTurn.Usage) {
			return fmt.Errorf("provider turn[%d] usage does not match its cumulative provider record", index)
		}
	}
	return nil
}

func validateTokenBreakdown(label string, value codexapp.TokenUsageBreakdown) error {
	for _, field := range tokenBreakdownFields(value) {
		if field < 0 {
			return fmt.Errorf("%s contains a negative token count", label)
		}
	}
	return nil
}

func requireNondecreasingTokenBreakdown(
	label string,
	previous codexapp.TokenUsageBreakdown,
	current codexapp.TokenUsageBreakdown,
) error {
	previousFields := tokenBreakdownFields(previous)
	currentFields := tokenBreakdownFields(current)
	for index := range currentFields {
		if currentFields[index] < previousFields[index] {
			return fmt.Errorf("%s decreased from %d to %d", label, previousFields[index], currentFields[index])
		}
	}
	if optionalTokenCount(current.CacheWriteInputTokens) < optionalTokenCount(previous.CacheWriteInputTokens) {
		return fmt.Errorf(
			"%s cache-write tokens decreased from %d to %d",
			label,
			optionalTokenCount(previous.CacheWriteInputTokens),
			optionalTokenCount(current.CacheWriteInputTokens),
		)
	}
	return nil
}

func subtractTokenBreakdown(
	current codexapp.TokenUsageBreakdown,
	baseline codexapp.TokenUsageBreakdown,
) (codexapp.TokenUsageBreakdown, error) {
	if err := requireNondecreasingTokenBreakdown("cumulative token usage", baseline, current); err != nil {
		return codexapp.TokenUsageBreakdown{}, err
	}
	result := codexapp.TokenUsageBreakdown{
		CachedInputTokens:     current.CachedInputTokens - baseline.CachedInputTokens,
		InputTokens:           current.InputTokens - baseline.InputTokens,
		OutputTokens:          current.OutputTokens - baseline.OutputTokens,
		ReasoningOutputTokens: current.ReasoningOutputTokens - baseline.ReasoningOutputTokens,
		TotalTokens:           current.TotalTokens - baseline.TotalTokens,
	}
	if current.CacheWriteInputTokens != nil || baseline.CacheWriteInputTokens != nil {
		value := optionalTokenCount(current.CacheWriteInputTokens) - optionalTokenCount(baseline.CacheWriteInputTokens)
		result.CacheWriteInputTokens = &value
	}
	return result, nil
}

func addTokenBreakdown(
	left codexapp.TokenUsageBreakdown,
	right codexapp.TokenUsageBreakdown,
) (codexapp.TokenUsageBreakdown, error) {
	values := [5]int{}
	leftValues := tokenBreakdownFields(left)
	rightValues := tokenBreakdownFields(right)
	for index := range values {
		if rightValues[index] > maximumInt()-leftValues[index] {
			return codexapp.TokenUsageBreakdown{}, errors.New("aggregate token usage overflowed int")
		}
		values[index] = leftValues[index] + rightValues[index]
	}
	result := codexapp.TokenUsageBreakdown{
		CachedInputTokens:     values[1],
		InputTokens:           values[2],
		OutputTokens:          values[3],
		ReasoningOutputTokens: values[4],
		TotalTokens:           values[0],
	}
	if left.CacheWriteInputTokens != nil || right.CacheWriteInputTokens != nil {
		if optionalTokenCount(right.CacheWriteInputTokens) > maximumInt()-optionalTokenCount(left.CacheWriteInputTokens) {
			return codexapp.TokenUsageBreakdown{}, errors.New("aggregate cache-write token usage overflowed int")
		}
		value := optionalTokenCount(left.CacheWriteInputTokens) + optionalTokenCount(right.CacheWriteInputTokens)
		result.CacheWriteInputTokens = &value
	}
	return result, nil
}

// total is first so monotonic and overflow checks cover the provider's primary
// accounting figure before its component diagnostics.
func tokenBreakdownFields(value codexapp.TokenUsageBreakdown) [5]int {
	return [5]int{
		value.TotalTokens,
		value.CachedInputTokens,
		value.InputTokens,
		value.OutputTokens,
		value.ReasoningOutputTokens,
	}
}

func tokenRoleForConversationRole(role conversation.Role) (agent.TokenUsageRole, error) {
	switch role {
	case conversation.RoleDirector:
		return agent.TokenUsageRoleDirector, nil
	case conversation.RoleAgent:
		return agent.TokenUsageRoleAgent, nil
	case conversation.RoleNarrator:
		return agent.TokenUsageRoleNarrator, nil
	case conversation.RoleSideAgent:
		return agent.TokenUsageRoleSideAgent, nil
	default:
		return "", fmt.Errorf("resolved invocation has unsupported token role %q", role)
	}
}

func emptyTokenUsageBucket() TokenUsageBucketResult {
	return TokenUsageBucketResult{
		ProviderTurns: []ProviderTurnTokenUsage{},
		Roles:         []RoleTokenUsage{},
	}
}

func tokenProviderTurnKey(threadID string, turnID string) string {
	return threadID + "\x00" + turnID
}

func tokenModelKey(key tokenUsageModelKey) string {
	return fmt.Sprintf("%s\x00%s\x00%t\x00%s", key.model, key.reasoningEffort, key.hasServiceTier, key.serviceTier)
}

func maximumInt() int { return int(^uint(0) >> 1) }

func optionalTokenCount(value *int) int {
	if value == nil {
		return 0
	}
	return *value
}

func equalTokenAttribution(left agent.TokenUsageAttribution, right agent.TokenUsageAttribution) bool {
	return left.Bucket == right.Bucket && left.Role == right.Role &&
		left.InvocationID == right.InvocationID && left.Model == right.Model &&
		left.ReasoningEffort == right.ReasoningEffort &&
		equalOptionalTokenString(left.ServiceTier, right.ServiceTier)
}

func equalOptionalTokenString(left *string, right *string) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

func equalResolvedInvocation(left conversation.ResolvedInvocation, right conversation.ResolvedInvocation) bool {
	return reflect.DeepEqual(left, right)
}

func cloneScenarioTokenUsages(values []ScenarioTokenUsage) []ScenarioTokenUsage {
	if values == nil {
		return nil
	}
	cloned := make([]ScenarioTokenUsage, len(values))
	for index, value := range values {
		cloned[index] = value
		cloned[index].System = cloneTokenUsageBucket(value.System)
		cloned[index].Judge = cloneTokenUsageBucket(value.Judge)
	}
	return cloned
}

func cloneTokenUsageBucket(value TokenUsageBucketResult) TokenUsageBucketResult {
	return TokenUsageBucketResult{
		EvidenceAvailable: value.EvidenceAvailable,
		ProviderTurns:     cloneProviderTurnTokenUsages(value.ProviderTurns),
		Roles:             cloneRoleTokenUsages(value.Roles),
		Total:             cloneTokenBreakdown(value.Total),
	}
}

func cloneProviderTurnTokenUsages(values []ProviderTurnTokenUsage) []ProviderTurnTokenUsage {
	if values == nil {
		return nil
	}
	cloned := make([]ProviderTurnTokenUsage, len(values))
	for index, value := range values {
		cloned[index] = value
		cloned[index].Attribution = cloneTokenAttribution(value.Attribution)
		cloned[index].Usage = cloneTokenBreakdown(value.Usage)
		cloned[index].FinalProviderRecord = cloneThreadTokenUsage(value.FinalProviderRecord)
	}
	return cloned
}

func cloneRoleTokenUsages(values []RoleTokenUsage) []RoleTokenUsage {
	if values == nil {
		return nil
	}
	cloned := make([]RoleTokenUsage, len(values))
	for index, value := range values {
		cloned[index] = value
		cloned[index].Total = cloneTokenBreakdown(value.Total)
		cloned[index].Models = make([]ModelTokenUsage, len(value.Models))
		for modelIndex, model := range value.Models {
			cloned[index].Models[modelIndex] = model
			cloned[index].Models[modelIndex].ServiceTier = cloneOptionalTokenString(model.ServiceTier)
			cloned[index].Models[modelIndex].Total = cloneTokenBreakdown(model.Total)
		}
	}
	return cloned
}

func cloneTokenAttribution(value agent.TokenUsageAttribution) agent.TokenUsageAttribution {
	value.ServiceTier = cloneOptionalTokenString(value.ServiceTier)
	return value
}

func cloneThreadTokenUsage(value codexapp.ThreadTokenUsage) codexapp.ThreadTokenUsage {
	value.Last = cloneTokenBreakdown(value.Last)
	value.Total = cloneTokenBreakdown(value.Total)
	if value.ModelContextWindow != nil {
		contextWindow := *value.ModelContextWindow
		value.ModelContextWindow = &contextWindow
	}
	return value
}

func cloneTokenBreakdown(value codexapp.TokenUsageBreakdown) codexapp.TokenUsageBreakdown {
	if value.CacheWriteInputTokens != nil {
		cacheWrite := *value.CacheWriteInputTokens
		value.CacheWriteInputTokens = &cacheWrite
	}
	return value
}

func cloneOptionalTokenString(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}
