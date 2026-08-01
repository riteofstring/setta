package evalharness

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"strings"
	"sync"

	"setta/internal/codexapp"
)

const phase1ProviderMessageMaximumBytes = 16 * 1024 * 1024

type phase1TokenBudgetFailureKind string

const (
	phase1TokenBudgetExceeded        phase1TokenBudgetFailureKind = "exceeded"
	phase1TokenBudgetEvidenceInvalid phase1TokenBudgetFailureKind = "evidence_invalid"
)

type phase1TokenBudgetFailure struct {
	kind  phase1TokenBudgetFailureKind
	limit int64
	total int64
	cause error
}

func (failure *phase1TokenBudgetFailure) Error() string {
	if failure == nil {
		return ""
	}
	if failure.kind == phase1TokenBudgetExceeded {
		return fmt.Sprintf(
			"scenario consumed %d total tokens, exceeding its hard ceiling of %d",
			failure.total,
			failure.limit,
		)
	}
	return fmt.Sprintf("validate total-token ceiling evidence: %v", failure.cause)
}

type phase1TokenBudget struct {
	limit int64
	abort func()

	mutex   sync.Mutex
	totals  map[string]int64
	total   int64
	seen    bool
	failure *phase1TokenBudgetFailure
}

func newPhase1TokenBudget(limit int64, abort func()) (*phase1TokenBudget, error) {
	if limit <= 0 || limit > ScenarioMaximumTokenBudget {
		return nil, fmt.Errorf(
			"Phase 1 hard total-token ceiling is %d, want 1-%d",
			limit,
			ScenarioMaximumTokenBudget,
		)
	}
	if abort == nil {
		return nil, errors.New("Phase 1 total-token ceiling abort function is required")
	}
	return &phase1TokenBudget{
		limit:  limit,
		abort:  abort,
		totals: map[string]int64{},
	}, nil
}

func (budget *phase1TokenBudget) observeProviderMessage(raw []byte) error {
	var envelope struct {
		Method string          `json:"method"`
		Params json.RawMessage `json:"params"`
	}
	if err := json.Unmarshal(raw, &envelope); err != nil ||
		envelope.Method != codexapp.CodexNotificationThreadTokenUsageUpdated {
		return nil
	}
	notification, err := codexapp.DecodeThreadTokenUsageUpdatedNotification(envelope.Params)
	if err != nil {
		return budget.fail(phase1TokenBudgetEvidenceInvalid, 0, err)
	}
	if err := validatePhase1TokenUsageNotification(notification); err != nil {
		return budget.fail(phase1TokenBudgetEvidenceInvalid, 0, err)
	}
	return budget.record(notification.ThreadID, int64(notification.TokenUsage.Total.TotalTokens))
}

func validatePhase1TokenUsageNotification(
	notification codexapp.ThreadTokenUsageUpdatedNotification,
) error {
	if strings.TrimSpace(notification.ThreadID) == "" || strings.TrimSpace(notification.TurnID) == "" {
		return errors.New("token usage notification omitted its thread or turn id")
	}
	for label, usage := range map[string]codexapp.TokenUsageBreakdown{
		"last":  notification.TokenUsage.Last,
		"total": notification.TokenUsage.Total,
	} {
		values := []int{
			usage.CachedInputTokens,
			usage.InputTokens,
			usage.OutputTokens,
			usage.ReasoningOutputTokens,
			usage.TotalTokens,
		}
		if usage.CacheWriteInputTokens != nil {
			values = append(values, *usage.CacheWriteInputTokens)
		}
		for _, value := range values {
			if value < 0 {
				return fmt.Errorf("token usage %s breakdown contains a negative value", label)
			}
		}
	}
	return nil
}

func (budget *phase1TokenBudget) record(threadID string, total int64) error {
	budget.mutex.Lock()
	if budget.failure != nil {
		failure := budget.failure
		budget.mutex.Unlock()
		return failure
	}
	previous, exists := budget.totals[threadID]
	if exists && total < previous {
		budget.mutex.Unlock()
		return budget.fail(
			phase1TokenBudgetEvidenceInvalid,
			0,
			fmt.Errorf("thread %s total tokens decreased from %d to %d", threadID, previous, total),
		)
	}
	aggregateWithoutThread := budget.total - previous
	if total > math.MaxInt64-aggregateWithoutThread {
		budget.mutex.Unlock()
		return budget.fail(
			phase1TokenBudgetEvidenceInvalid,
			0,
			errors.New("aggregate total tokens overflowed int64"),
		)
	}
	budget.totals[threadID] = total
	budget.total = aggregateWithoutThread + total
	budget.seen = true
	aggregate := budget.total
	limit := budget.limit
	budget.mutex.Unlock()
	if aggregate > limit {
		return budget.fail(phase1TokenBudgetExceeded, aggregate, nil)
	}
	return nil
}

func (budget *phase1TokenBudget) fail(
	kind phase1TokenBudgetFailureKind,
	total int64,
	cause error,
) error {
	budget.mutex.Lock()
	if budget.failure != nil {
		failure := budget.failure
		budget.mutex.Unlock()
		return failure
	}
	failure := &phase1TokenBudgetFailure{
		kind:  kind,
		limit: budget.limit,
		total: total,
		cause: cause,
	}
	budget.failure = failure
	abort := budget.abort
	budget.mutex.Unlock()
	abort()
	return failure
}

func (budget *phase1TokenBudget) failureState() *phase1TokenBudgetFailure {
	if budget == nil {
		return nil
	}
	budget.mutex.Lock()
	defer budget.mutex.Unlock()
	return budget.failure
}

func (budget *phase1TokenBudget) observedUsage() bool {
	if budget == nil {
		return false
	}
	budget.mutex.Lock()
	defer budget.mutex.Unlock()
	return budget.seen
}

func forwardPhase1ProviderResponses(
	output io.Writer,
	input io.Reader,
	budget *phase1TokenBudget,
) error {
	if output == nil || input == nil || budget == nil {
		return errors.New("Phase 1 provider response forwarding requires input, output, and a token budget")
	}
	reader := bufio.NewReaderSize(input, 4096)
	for {
		message, finished, err := readPhase1ProviderMessage(reader, output)
		if err != nil {
			return err
		}
		if len(message) > 0 {
			if err := budget.observeProviderMessage(message); err != nil {
				return err
			}
		}
		if finished {
			return nil
		}
	}
}

func readPhase1ProviderMessage(
	reader *bufio.Reader,
	output io.Writer,
) ([]byte, bool, error) {
	message := make([]byte, 0, 4096)
	for {
		fragment, readErr := reader.ReadSlice('\n')
		if err := writePhase1ProviderFragment(output, fragment); err != nil {
			return nil, false, err
		}
		if len(message) > phase1ProviderMessageMaximumBytes-len(fragment) {
			return nil, false, fmt.Errorf(
				"Phase 1 provider message exceeds %d bytes",
				phase1ProviderMessageMaximumBytes,
			)
		}
		message = append(message, fragment...)
		if errors.Is(readErr, bufio.ErrBufferFull) {
			continue
		}
		if readErr != nil && !errors.Is(readErr, io.EOF) {
			return nil, false, readErr
		}
		return bytesWithoutPhase1LineEnding(message), errors.Is(readErr, io.EOF), nil
	}
}

func writePhase1ProviderFragment(output io.Writer, fragment []byte) error {
	written, err := output.Write(fragment)
	if err != nil {
		return err
	}
	if written != len(fragment) {
		return io.ErrShortWrite
	}
	return nil
}

func bytesWithoutPhase1LineEnding(value []byte) []byte {
	value = bytesTrimPhase1Suffix(value, '\n')
	return bytesTrimPhase1Suffix(value, '\r')
}

func bytesTrimPhase1Suffix(value []byte, suffix byte) []byte {
	if len(value) > 0 && value[len(value)-1] == suffix {
		return value[:len(value)-1]
	}
	return value
}
