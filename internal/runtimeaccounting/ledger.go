// Package runtimeaccounting turns trusted runtime events and enforced resource
// bounds into restart-safe usage evidence and hard-cutoff decisions.
package runtimeaccounting

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"math/big"
	"sort"
	"time"

	"setta/internal/runtimecost"
	"setta/internal/runtimeprovider"
)

var (
	// ErrInvalidEvent identifies an out-of-order, conflicting, or impossible
	// accounting transition.
	ErrInvalidEvent = errors.New("invalid runtime accounting event")
	// ErrMissingBound identifies a dimension required for a cutoff decision but
	// not protected by an enforced resource bound.
	ErrMissingBound = errors.New("runtime accounting bound unavailable")
)

// maximumLedgerEvents bounds the deliberately clone-on-apply measurement
// ledger. Production accounting must adopt compaction before raising it.
const maximumLedgerEvents = 4_096

// ActivityKind identifies one trusted event-derived activity class.
type ActivityKind string

const (
	ActivityProvider      ActivityKind = "provider"
	ActivityAttachment    ActivityKind = "attachment"
	ActivityWorkloadLease ActivityKind = "workload_lease"
)

// EventAction changes an activity. Renew is valid only for workload leases.
type EventAction string

const (
	EventBegin EventAction = "begin"
	EventRenew EventAction = "renew"
	EventEnd   EventAction = "end"
)

// ActivityEvent is one ordered trusted accounting event. EventID is immutable
// and idempotent. SubjectID is required for attachments and workload leases.
// LeaseExpiresAt is required for workload-lease begin and renew events.
type ActivityEvent struct {
	Sequence       uint64       `json:"sequence"`
	EventID        string       `json:"event_id"`
	At             time.Time    `json:"at"`
	Kind           ActivityKind `json:"kind"`
	Action         EventAction  `json:"action"`
	SubjectID      string       `json:"subject_id,omitempty"`
	LeaseExpiresAt time.Time    `json:"lease_expires_at,omitempty"`
}

// ActivityTransition is the producer-owned portion of an activity event. The
// durable ledger owner assigns Sequence atomically across all producers.
type ActivityTransition struct {
	EventID        string       `json:"event_id"`
	At             time.Time    `json:"at"`
	Kind           ActivityKind `json:"kind"`
	Action         EventAction  `json:"action"`
	SubjectID      string       `json:"subject_id,omitempty"`
	LeaseExpiresAt time.Time    `json:"lease_expires_at,omitempty"`
}

func (transition ActivityTransition) Event(sequence uint64) ActivityEvent {
	return ActivityEvent{
		Sequence: sequence, EventID: transition.EventID, At: transition.At,
		Kind: transition.Kind, Action: transition.Action,
		SubjectID: transition.SubjectID, LeaseExpiresAt: transition.LeaseExpiresAt,
	}
}

// AppliedEvent authenticates a persisted event identity against its complete
// canonical body so identical replay is a no-op and conflicting replay fails.
type AppliedEvent struct {
	EventID string `json:"event_id"`
	SHA256  string `json:"sha256"`
}

// OpenWorkloadLease is the restart-safe authoritative expiry for one hold.
type OpenWorkloadLease struct {
	ID        string    `json:"id"`
	ExpiresAt time.Time `json:"expires_at"`
}

// LedgerState is a versioned restart snapshot. Call RestoreLedger rather than
// constructing state directly.
type LedgerState struct {
	Version             int                 `json:"version"`
	WindowStart         time.Time           `json:"window_start"`
	LastEventAt         time.Time           `json:"last_event_at"`
	LastSequence        uint64              `json:"last_sequence"`
	AppliedSequenceBase uint64              `json:"applied_sequence_base"`
	AppliedEvents       []AppliedEvent      `json:"applied_events,omitempty"`
	ProviderActive      bool                `json:"provider_active"`
	Attachments         []string            `json:"attachments,omitempty"`
	WorkloadLeases      []OpenWorkloadLease `json:"workload_leases,omitempty"`
	ProviderTime        time.Duration       `json:"provider_time"`
	AttachedIdle        time.Duration       `json:"attached_idle"`
	WorkloadTime        time.Duration       `json:"workload_time"`
}

// Ledger integrates activity classes without double-counting overlapping
// attachments or workload leases.
type Ledger struct {
	state         LedgerState
	attachments   map[string]struct{}
	workloadLease map[string]time.Time
	appliedEvents map[string]string
}

// ClosedWindow contains event-derived durations for one half-open accounting
// window [Start, End).
type ClosedWindow struct {
	Window         runtimeprovider.UsageWindow
	ProviderActive time.Duration
	AttachedIdle   time.Duration
	WorkloadLease  time.Duration
}

// NewLedger starts an empty accounting window.
func NewLedger(start time.Time) (*Ledger, error) {
	if start.IsZero() {
		return nil, fmt.Errorf("%w: ledger start is zero", ErrInvalidEvent)
	}
	return &Ledger{
		state: LedgerState{
			Version:     2,
			WindowStart: start,
			LastEventAt: start,
		},
		attachments:   make(map[string]struct{}),
		workloadLease: make(map[string]time.Time),
		appliedEvents: make(map[string]string),
	}, nil
}

// RestoreLedger validates and resumes a persisted snapshot.
func RestoreLedger(state LedgerState) (*Ledger, error) {
	if err := validateLedgerState(state); err != nil {
		return nil, err
	}
	ledger := &Ledger{
		state:         state,
		attachments:   make(map[string]struct{}, len(state.Attachments)),
		workloadLease: make(map[string]time.Time, len(state.WorkloadLeases)),
		appliedEvents: make(map[string]string, len(state.AppliedEvents)),
	}
	for _, id := range state.Attachments {
		ledger.attachments[id] = struct{}{}
	}
	for _, lease := range state.WorkloadLeases {
		ledger.workloadLease[lease.ID] = lease.ExpiresAt
	}
	for _, event := range state.AppliedEvents {
		ledger.appliedEvents[event.EventID] = event.SHA256
	}
	return ledger, nil
}

// Snapshot returns a deterministic restart snapshot.
func (ledger *Ledger) Snapshot() LedgerState {
	state := ledger.state
	state.AppliedEvents = sortedAppliedEvents(ledger.appliedEvents)
	state.Attachments = sortedKeys(ledger.attachments)
	state.WorkloadLeases = sortedWorkloadLeases(ledger.workloadLease)
	return state
}

// Apply adds exactly the next event. An identical EventID replay is a no-op.
// Invalid or conflicting events leave the ledger unchanged.
func (ledger *Ledger) Apply(event ActivityEvent) error {
	digest, err := activityEventDigest(event)
	if err != nil {
		return err
	}
	if previous, exists := ledger.appliedEvents[event.EventID]; exists {
		if previous == digest {
			return nil
		}
		return fmt.Errorf("%w: conflicting replay for %q", ErrInvalidEvent, event.EventID)
	}
	if len(ledger.appliedEvents) >= maximumLedgerEvents {
		return fmt.Errorf("%w: event limit %d reached", ErrInvalidEvent, maximumLedgerEvents)
	}
	if err := ledger.validateCommonEvent(event); err != nil {
		return err
	}

	next := ledger.clone()
	next.advance(event.At)
	if err := next.validateTransition(event); err != nil {
		return err
	}
	next.applyTransition(event)
	next.state.LastSequence = event.Sequence
	next.state.LastEventAt = event.At
	next.appliedEvents[event.EventID] = digest
	*ledger = *next
	return nil
}

// Close completes the current accounting window and immediately begins the
// next one while preserving open provider, attachment, and unexpired lease
// activity.
func (ledger *Ledger) Close(end time.Time) (ClosedWindow, error) {
	if end.Before(ledger.state.LastEventAt) || !end.After(ledger.state.WindowStart) {
		return ClosedWindow{}, fmt.Errorf("%w: invalid ledger close time", ErrInvalidEvent)
	}
	ledger.advance(end)
	closed := ClosedWindow{
		Window: runtimeprovider.UsageWindow{
			Start: ledger.state.WindowStart,
			End:   end,
		},
		ProviderActive: ledger.state.ProviderTime,
		AttachedIdle:   ledger.state.AttachedIdle,
		WorkloadLease:  ledger.state.WorkloadTime,
	}
	ledger.state.WindowStart = end
	ledger.state.LastEventAt = end
	ledger.state.ProviderTime = 0
	ledger.state.AttachedIdle = 0
	ledger.state.WorkloadTime = 0
	return closed, nil
}

// CompactAppliedEvents discards the bounded in-memory replay index after its
// events have been durably committed to an external idempotency registry.
// Sequence continuity and open activity state are preserved.
func (ledger *Ledger) CompactAppliedEvents() {
	clear(ledger.appliedEvents)
	ledger.state.AppliedSequenceBase = ledger.state.LastSequence
	ledger.state.AppliedEvents = nil
}

func (ledger *Ledger) validateCommonEvent(event ActivityEvent) error {
	if event.EventID == "" || event.At.IsZero() {
		return fmt.Errorf("%w: event identity or time is empty", ErrInvalidEvent)
	}
	if ledger.state.LastSequence == math.MaxUint64 || event.Sequence == 0 || event.Sequence != ledger.state.LastSequence+1 {
		return fmt.Errorf("%w: sequence %d does not follow %d", ErrInvalidEvent, event.Sequence, ledger.state.LastSequence)
	}
	if event.At.Before(ledger.state.LastEventAt) {
		return fmt.Errorf("%w: event time moved backwards", ErrInvalidEvent)
	}
	return nil
}

func (ledger *Ledger) validateTransition(event ActivityEvent) error {
	switch event.Kind {
	case ActivityProvider:
		return ledger.validateProviderTransition(event)
	case ActivityAttachment:
		return ledger.validateAttachmentTransition(event)
	case ActivityWorkloadLease:
		return ledger.validateWorkloadLeaseTransition(event)
	default:
		return fmt.Errorf("%w: unsupported activity %q", ErrInvalidEvent, event.Kind)
	}
}

func (ledger *Ledger) validateProviderTransition(event ActivityEvent) error {
	if event.SubjectID != "" || !event.LeaseExpiresAt.IsZero() ||
		(event.Action != EventBegin && event.Action != EventEnd) ||
		(event.Action == EventBegin) == ledger.state.ProviderActive {
		return fmt.Errorf("%w: invalid provider transition", ErrInvalidEvent)
	}
	return nil
}

func (ledger *Ledger) validateAttachmentTransition(event ActivityEvent) error {
	if !event.LeaseExpiresAt.IsZero() || (event.Action != EventBegin && event.Action != EventEnd) {
		return fmt.Errorf("%w: invalid attachment transition", ErrInvalidEvent)
	}
	return validateMembershipTransition(
		ledger.state.ProviderActive,
		ledger.attachments,
		event.SubjectID,
		event.Action,
	)
}

func (ledger *Ledger) validateWorkloadLeaseTransition(event ActivityEvent) error {
	if !ledger.state.ProviderActive || event.SubjectID == "" {
		return fmt.Errorf("%w: workload lease requires an active provider and subject", ErrInvalidEvent)
	}
	previousExpiry, exists := ledger.workloadLease[event.SubjectID]
	switch event.Action {
	case EventBegin:
		return validateWorkloadLeaseBegin(event, exists)
	case EventRenew:
		return validateWorkloadLeaseRenewal(event, previousExpiry, exists)
	case EventEnd:
		return validateWorkloadLeaseEnd(event, exists)
	default:
		return fmt.Errorf("%w: invalid workload-lease action %q", ErrInvalidEvent, event.Action)
	}
}

func validateWorkloadLeaseBegin(event ActivityEvent, exists bool) error {
	if exists || !event.LeaseExpiresAt.After(event.At) {
		return fmt.Errorf("%w: invalid workload-lease begin", ErrInvalidEvent)
	}
	return nil
}

func validateWorkloadLeaseRenewal(event ActivityEvent, previousExpiry time.Time, exists bool) error {
	if !exists || !event.LeaseExpiresAt.After(previousExpiry) {
		return fmt.Errorf("%w: invalid workload-lease renewal", ErrInvalidEvent)
	}
	return nil
}

func validateWorkloadLeaseEnd(event ActivityEvent, exists bool) error {
	if !exists || !event.LeaseExpiresAt.IsZero() {
		return fmt.Errorf("%w: invalid workload-lease end", ErrInvalidEvent)
	}
	return nil
}

func (ledger *Ledger) applyTransition(event ActivityEvent) {
	switch event.Kind {
	case ActivityProvider:
		ledger.state.ProviderActive = event.Action == EventBegin
		if event.Action == EventEnd {
			clear(ledger.attachments)
			clear(ledger.workloadLease)
		}
	case ActivityAttachment:
		applyMembership(ledger.attachments, event.SubjectID, event.Action)
	case ActivityWorkloadLease:
		if event.Action == EventEnd {
			delete(ledger.workloadLease, event.SubjectID)
		} else {
			ledger.workloadLease[event.SubjectID] = event.LeaseExpiresAt
		}
	}
}

func (ledger *Ledger) advance(at time.Time) {
	cursor := ledger.state.LastEventAt
	for cursor.Before(at) {
		next := at
		for _, expiry := range ledger.workloadLease {
			if expiry.After(cursor) && expiry.Before(next) {
				next = expiry
			}
		}
		delta := next.Sub(cursor)
		if ledger.state.ProviderActive {
			ledger.state.ProviderTime += delta
			if len(ledger.workloadLease) > 0 {
				ledger.state.WorkloadTime += delta
			} else if len(ledger.attachments) > 0 {
				ledger.state.AttachedIdle += delta
			}
		}
		cursor = next
		for id, expiry := range ledger.workloadLease {
			if !expiry.After(cursor) {
				delete(ledger.workloadLease, id)
			}
		}
	}
}

func (ledger *Ledger) clone() *Ledger {
	cloned := &Ledger{
		state:         ledger.Snapshot(),
		attachments:   make(map[string]struct{}, len(ledger.attachments)),
		workloadLease: make(map[string]time.Time, len(ledger.workloadLease)),
		appliedEvents: make(map[string]string, len(ledger.appliedEvents)),
	}
	for id := range ledger.attachments {
		cloned.attachments[id] = struct{}{}
	}
	for id, expiry := range ledger.workloadLease {
		cloned.workloadLease[id] = expiry
	}
	for id, digest := range ledger.appliedEvents {
		cloned.appliedEvents[id] = digest
	}
	return cloned
}

func validateMembershipTransition(active bool, members map[string]struct{}, subjectID string, action EventAction) error {
	if !active || subjectID == "" {
		return fmt.Errorf("%w: membership transition requires an active provider and subject", ErrInvalidEvent)
	}
	_, exists := members[subjectID]
	if (action == EventBegin) == exists {
		return fmt.Errorf("%w: invalid membership transition for %q", ErrInvalidEvent, subjectID)
	}
	return nil
}

func applyMembership(members map[string]struct{}, id string, action EventAction) {
	if action == EventBegin {
		members[id] = struct{}{}
	} else {
		delete(members, id)
	}
}

func activityEventDigest(event ActivityEvent) (string, error) {
	encoded, err := json.Marshal(event)
	if err != nil {
		return "", fmt.Errorf("%w: encode event: %v", ErrInvalidEvent, err)
	}
	digest := sha256.Sum256(encoded)
	return hex.EncodeToString(digest[:]), nil
}

func validateLedgerState(state LedgerState) error {
	if err := validateLedgerStateHeader(state); err != nil {
		return err
	}
	if err := validateLedgerDurations(state); err != nil {
		return err
	}
	if !state.ProviderActive && (len(state.Attachments) != 0 || len(state.WorkloadLeases) != 0) {
		return fmt.Errorf("%w: inactive ledger retains activity", ErrInvalidEvent)
	}
	if hasEmptyOrDuplicate(state.Attachments) {
		return fmt.Errorf("%w: invalid attachment IDs", ErrInvalidEvent)
	}
	if err := validateOpenWorkloadLeases(state); err != nil {
		return err
	}
	return validateAppliedEvents(state.AppliedEvents)
}

func validateLedgerStateHeader(state LedgerState) error {
	if state.Version != 2 || state.WindowStart.IsZero() || state.LastEventAt.Before(state.WindowStart) ||
		state.AppliedSequenceBase > state.LastSequence ||
		state.LastSequence-state.AppliedSequenceBase != uint64(len(state.AppliedEvents)) ||
		len(state.AppliedEvents) > maximumLedgerEvents {
		return fmt.Errorf("%w: invalid ledger snapshot", ErrInvalidEvent)
	}
	return nil
}

func validateLedgerDurations(state LedgerState) error {
	window := state.LastEventAt.Sub(state.WindowStart)
	if state.ProviderTime < 0 || state.AttachedIdle < 0 || state.WorkloadTime < 0 ||
		state.ProviderTime > window || state.AttachedIdle > state.ProviderTime ||
		state.WorkloadTime > state.ProviderTime-state.AttachedIdle {
		return fmt.Errorf("%w: invalid ledger durations", ErrInvalidEvent)
	}
	return nil
}

func validateOpenWorkloadLeases(state LedgerState) error {
	seenLeases := make(map[string]struct{}, len(state.WorkloadLeases))
	for _, lease := range state.WorkloadLeases {
		if lease.ID == "" || !lease.ExpiresAt.After(state.LastEventAt) {
			return fmt.Errorf("%w: invalid workload lease", ErrInvalidEvent)
		}
		if _, exists := seenLeases[lease.ID]; exists {
			return fmt.Errorf("%w: duplicate workload lease", ErrInvalidEvent)
		}
		seenLeases[lease.ID] = struct{}{}
	}
	return nil
}

func validateAppliedEvents(events []AppliedEvent) error {
	seenEvents := make(map[string]struct{}, len(events))
	for _, event := range events {
		decoded, err := hex.DecodeString(event.SHA256)
		if event.EventID == "" || err != nil || len(decoded) != sha256.Size {
			return fmt.Errorf("%w: invalid applied event", ErrInvalidEvent)
		}
		if _, exists := seenEvents[event.EventID]; exists {
			return fmt.Errorf("%w: duplicate applied event", ErrInvalidEvent)
		}
		seenEvents[event.EventID] = struct{}{}
	}
	return nil
}

func hasEmptyOrDuplicate(values []string) bool {
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		if value == "" {
			return true
		}
		if _, exists := seen[value]; exists {
			return true
		}
		seen[value] = struct{}{}
	}
	return false
}

func sortedKeys(values map[string]struct{}) []string {
	result := make([]string, 0, len(values))
	for value := range values {
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}

func sortedWorkloadLeases(values map[string]time.Time) []OpenWorkloadLease {
	result := make([]OpenWorkloadLease, 0, len(values))
	for id, expiry := range values {
		result = append(result, OpenWorkloadLease{ID: id, ExpiresAt: expiry})
	}
	sort.Slice(result, func(first int, second int) bool { return result[first].ID < result[second].ID })
	return result
}

func sortedAppliedEvents(values map[string]string) []AppliedEvent {
	result := make([]AppliedEvent, 0, len(values))
	for id, digest := range values {
		result = append(result, AppliedEvent{EventID: id, SHA256: digest})
	}
	sort.Slice(result, func(first int, second int) bool { return result[first].EventID < result[second].EventID })
	return result
}

// EnforcedBound distinguishes a real zero ceiling from a missing enforcement
// mechanism.
type EnforcedBound struct {
	Enforced bool   `json:"enforced"`
	Value    uint64 `json:"value"`
}

// ResourceCeilings are trusted whole-runtime upper bounds. CPUCoreMillionths
// uses one core = 1,000,000. Storage bounds are conservatively integrated over
// the full window.
type ResourceCeilings struct {
	CPUCoreMillionths    EnforcedBound `json:"cpu_core_millionths"`
	MemoryBytes          EnforcedBound `json:"memory_bytes"`
	HotStorageBytes      EnforcedBound `json:"hot_storage_bytes"`
	ColdStorageBytes     EnforcedBound `json:"cold_storage_bytes"`
	CheckpointBytes      EnforcedBound `json:"checkpoint_bytes"`
	EgressBytesPerSecond EnforcedBound `json:"egress_bytes_per_second"`
}

// ConservativeObservation converts event-derived time and enforced bounds into
// explicit Setta-conservative usage evidence.
func ConservativeObservation(
	provider string,
	runtimeName string,
	closed ClosedWindow,
	observedAt time.Time,
	ceilings ResourceCeilings,
) (runtimeprovider.UsageObservation, error) {
	if err := ceilings.Validate(); err != nil {
		return runtimeprovider.UsageObservation{}, err
	}
	observation := runtimeprovider.UsageObservation{
		Provider:    provider,
		RuntimeName: runtimeName,
		Window:      closed.Window,
		ObservedAt:  observedAt,
		Basis:       runtimeprovider.UsageBasisSettaConservative,
		Coverage: []runtimeprovider.UsageDimension{
			runtimeprovider.UsageDimensionProviderActive,
			runtimeprovider.UsageDimensionAttachedIdle,
			runtimeprovider.UsageDimensionWorkloadLease,
		},
		Quantities: runtimeprovider.UsageQuantities{
			ProviderActive: closed.ProviderActive,
			AttachedIdle:   closed.AttachedIdle,
			WorkloadLease:  closed.WorkloadLease,
		},
	}
	windowDuration := closed.Window.End.Sub(closed.Window.Start)
	hotStorage := ceilings.HotStorageBytes
	if coldStorage := ceilings.ColdStorageBytes; coldStorage.Enforced {
		if !hotStorage.Enforced {
			hotStorage.Enforced = true
		}
		if hotStorage.Value > math.MaxUint64-coldStorage.Value {
			return runtimeprovider.UsageObservation{}, runtimecost.ErrCostOverflow
		}
		hotStorage.Value += coldStorage.Value
	}
	bounds := []struct {
		bound       EnforcedBound
		dimension   runtimeprovider.UsageDimension
		duration    time.Duration
		destination *uint64
		scale       uint64
	}{
		{ceilings.CPUCoreMillionths, runtimeprovider.UsageDimensionCPU, closed.ProviderActive, &observation.Quantities.CPUCoreMicroseconds, 1_000_000_000},
		{ceilings.MemoryBytes, runtimeprovider.UsageDimensionMemory, closed.ProviderActive, &observation.Quantities.MemoryByteSeconds, uint64(time.Second)},
		{hotStorage, runtimeprovider.UsageDimensionHotStorage, windowDuration, &observation.Quantities.HotStorageByteSeconds, uint64(time.Second)},
		{ceilings.CheckpointBytes, runtimeprovider.UsageDimensionCheckpointStorage, windowDuration, &observation.Quantities.CheckpointByteSeconds, uint64(time.Second)},
	}
	for _, bounded := range bounds {
		if !bounded.bound.Enforced {
			continue
		}
		quantity, err := multiplyDurationBound(bounded.duration, bounded.bound.Value, bounded.scale)
		if err != nil {
			return runtimeprovider.UsageObservation{}, fmt.Errorf("%w: %s", err, bounded.dimension)
		}
		*bounded.destination = quantity
		observation.Coverage = append(observation.Coverage, bounded.dimension)
	}
	if ceilings.EgressBytesPerSecond.Enforced {
		quantity, err := multiplyDurationBound(
			windowDuration,
			ceilings.EgressBytesPerSecond.Value,
			uint64(time.Second),
		)
		if err != nil {
			return runtimeprovider.UsageObservation{}, fmt.Errorf("%w: %s", err, runtimeprovider.UsageDimensionEgress)
		}
		observation.Coverage = append(observation.Coverage, runtimeprovider.UsageDimensionEgress)
		observation.Quantities.EgressBytes = quantity
	}
	if err := observation.Validate(); err != nil {
		return runtimeprovider.UsageObservation{}, err
	}
	return observation, nil
}

// Validate rejects ambiguous bounds before they can enter evidence. A disabled
// bound must be zero. Setta-conservative retained storage is always charged as
// hot; authoritative provider observations may report cold usage separately.
func (ceilings ResourceCeilings) Validate() error {
	for name, bound := range map[string]EnforcedBound{
		"cpu":          ceilings.CPUCoreMillionths,
		"memory":       ceilings.MemoryBytes,
		"hot_storage":  ceilings.HotStorageBytes,
		"cold_storage": ceilings.ColdStorageBytes,
		"checkpoint":   ceilings.CheckpointBytes,
		"egress_rate":  ceilings.EgressBytesPerSecond,
	} {
		if !bound.Enforced && bound.Value != 0 {
			return fmt.Errorf("%w: disabled %s bound is non-zero", runtimeprovider.ErrInvalidContract, name)
		}
	}
	return nil
}

func multiplyDurationBound(duration time.Duration, bound uint64, scale uint64) (uint64, error) {
	if duration <= 0 || bound == 0 {
		return 0, nil
	}
	numerator := new(big.Int).Mul(big.NewInt(int64(duration)), new(big.Int).SetUint64(bound))
	denominator := new(big.Int).SetUint64(scale)
	quotient, remainder := new(big.Int).QuoRem(numerator, denominator, new(big.Int))
	if remainder.Sign() != 0 {
		quotient.Add(quotient, big.NewInt(1))
	}
	if !quotient.IsUint64() {
		return 0, runtimecost.ErrCostOverflow
	}
	return quotient.Uint64(), nil
}

// CutoffAction is a typed hard-budget result.
type CutoffAction string

const (
	CutoffContinue CutoffAction = "continue"
	CutoffSuspend  CutoffAction = "suspend"
)

// BudgetPolicy reserves part of a covered limit for uncertainty and defines
// the maximum time compute may continue after the cutoff decision.
type BudgetPolicy struct {
	CoveredLimitUSDMicros  uint64                           `json:"covered_limit_usd_micros"`
	SafetyReserveUSDMicros uint64                           `json:"safety_reserve_usd_micros"`
	MaximumCutoffLag       time.Duration                    `json:"maximum_cutoff_lag"`
	RequiredDimensions     []runtimeprovider.UsageDimension `json:"required_dimensions"`
}

// CutoffDecision reports both current covered cost and worst-case additional
// exposure during cutoff enforcement.
type CutoffDecision struct {
	Action                  CutoffAction `json:"action"`
	CurrentCoveredUSDMicros uint64       `json:"current_covered_usd_micros"`
	CutoffExposureUSDMicros uint64       `json:"cutoff_exposure_usd_micros"`
	ThresholdUSDMicros      uint64       `json:"threshold_usd_micros"`
}

// Evidence is the immutable, versioned output of one finalized accounting
// window. Consumers must recompute Cost from Usage and the named rate card
// rather than trusting the serialized breakdown.
type Evidence struct {
	Version         int                              `json:"version"`
	ConfigSHA256    string                           `json:"config_sha256"`
	EventsSHA256    string                           `json:"events_sha256"`
	RateCardVersion string                           `json:"rate_card_version"`
	Usage           runtimeprovider.UsageObservation `json:"usage"`
	Cost            runtimecost.Breakdown            `json:"cost"`
	Cutoff          CutoffDecision                   `json:"cutoff"`
}

// EvaluateCutoff constructs worst-case lag exposure from enforced ceilings. It
// refuses to decide unless every required dimension is enforced and priced.
func EvaluateCutoff(
	schedule runtimecost.PriceSchedule,
	current runtimeprovider.UsageObservation,
	ceilings ResourceCeilings,
	policy BudgetPolicy,
) (CutoffDecision, error) {
	if err := validateCutoffInputs(current, policy); err != nil {
		return CutoffDecision{}, err
	}
	cutoffExposure, err := buildCutoffExposure(current, ceilings, policy.MaximumCutoffLag)
	if err != nil {
		return CutoffDecision{}, err
	}
	if err := validateRequiredDimensions(policy.RequiredDimensions, current, cutoffExposure); err != nil {
		return CutoffDecision{}, err
	}
	currentCost, exposureCost, err := estimateCutoffCosts(schedule, current, cutoffExposure)
	if err != nil {
		return CutoffDecision{}, err
	}
	return buildCutoffDecision(currentCost, exposureCost, policy)
}

// MaximumCutoffExposureUSDMicros prices the enforced resource ceilings over
// the longest permitted provider cutoff lag. Configuration owners use this to
// persist the same exposure that EvaluateCutoff will later recompute.
func MaximumCutoffExposureUSDMicros(
	schedule runtimecost.PriceSchedule,
	runtimeName string,
	ceilings ResourceCeilings,
	maximumCutoffLag time.Duration,
	requiredDimensions []runtimeprovider.UsageDimension,
) (uint64, error) {
	if maximumCutoffLag <= 0 {
		return 0, fmt.Errorf("%w: invalid maximum cutoff lag", runtimeprovider.ErrInvalidContract)
	}
	start := time.Unix(0, 0).UTC()
	exposure, err := ConservativeObservation(
		schedule.Provider,
		runtimeName,
		ClosedWindow{
			Window: runtimeprovider.UsageWindow{
				Start: start,
				End:   start.Add(maximumCutoffLag),
			},
			ProviderActive: maximumCutoffLag,
		},
		start.Add(maximumCutoffLag),
		ceilings,
	)
	if err != nil {
		return 0, err
	}
	if err := validateRequiredDimensions(requiredDimensions, exposure, exposure); err != nil {
		return 0, err
	}
	cost, err := runtimecost.Estimate(schedule, exposure)
	if err != nil {
		return 0, err
	}
	return cost.CoveredTotal, nil
}

func validateCutoffInputs(current runtimeprovider.UsageObservation, policy BudgetPolicy) error {
	if policy.CoveredLimitUSDMicros == 0 || policy.SafetyReserveUSDMicros >= policy.CoveredLimitUSDMicros ||
		policy.MaximumCutoffLag <= 0 {
		return fmt.Errorf("%w: invalid budget policy", runtimeprovider.ErrInvalidContract)
	}
	if current.Basis != runtimeprovider.UsageBasisSettaConservative {
		return fmt.Errorf("%w: cutoff requires Setta-conservative current usage", runtimeprovider.ErrInvalidContract)
	}
	return nil
}

func buildCutoffExposure(
	current runtimeprovider.UsageObservation,
	ceilings ResourceCeilings,
	maximumCutoffLag time.Duration,
) (runtimeprovider.UsageObservation, error) {
	exposureWindow := ClosedWindow{
		Window: runtimeprovider.UsageWindow{
			Start: current.Window.End,
			End:   current.Window.End.Add(maximumCutoffLag),
		},
		ProviderActive: maximumCutoffLag,
	}
	return ConservativeObservation(
		current.Provider,
		current.RuntimeName,
		exposureWindow,
		exposureWindow.Window.End,
		ceilings,
	)
}

func validateRequiredDimensions(
	required []runtimeprovider.UsageDimension,
	current runtimeprovider.UsageObservation,
	cutoffExposure runtimeprovider.UsageObservation,
) error {
	if len(required) == 0 {
		return fmt.Errorf("%w: budget dimensions are empty", ErrMissingBound)
	}
	seen := make(map[runtimeprovider.UsageDimension]struct{}, len(required))
	for _, dimension := range required {
		if _, duplicate := seen[dimension]; duplicate {
			return fmt.Errorf("%w: duplicate required dimension %q", runtimeprovider.ErrInvalidContract, dimension)
		}
		seen[dimension] = struct{}{}
		if !isBillableDimension(dimension) {
			return fmt.Errorf("%w: non-billable required dimension %q", runtimeprovider.ErrInvalidContract, dimension)
		}
		if !current.Includes(dimension) || !cutoffExposure.Includes(dimension) {
			return fmt.Errorf("%w: %s", ErrMissingBound, dimension)
		}
	}
	return nil
}

func estimateCutoffCosts(
	schedule runtimecost.PriceSchedule,
	current runtimeprovider.UsageObservation,
	cutoffExposure runtimeprovider.UsageObservation,
) (runtimecost.Breakdown, runtimecost.Breakdown, error) {
	currentCost, err := runtimecost.Estimate(schedule, current)
	if err != nil {
		return runtimecost.Breakdown{}, runtimecost.Breakdown{}, err
	}
	exposureCost, err := runtimecost.Estimate(schedule, cutoffExposure)
	if err != nil {
		return runtimecost.Breakdown{}, runtimecost.Breakdown{}, err
	}
	return currentCost, exposureCost, nil
}

func buildCutoffDecision(
	currentCost runtimecost.Breakdown,
	exposureCost runtimecost.Breakdown,
	policy BudgetPolicy,
) (CutoffDecision, error) {
	if currentCost.CoveredTotal > math.MaxUint64-exposureCost.CoveredTotal {
		return CutoffDecision{}, runtimecost.ErrCostOverflow
	}
	projected := currentCost.CoveredTotal + exposureCost.CoveredTotal
	decision := CutoffDecision{
		Action:                  CutoffContinue,
		CurrentCoveredUSDMicros: currentCost.CoveredTotal,
		CutoffExposureUSDMicros: exposureCost.CoveredTotal,
		ThresholdUSDMicros:      policy.CoveredLimitUSDMicros - policy.SafetyReserveUSDMicros,
	}
	if projected >= decision.ThresholdUSDMicros {
		decision.Action = CutoffSuspend
	}
	return decision, nil
}

func isBillableDimension(dimension runtimeprovider.UsageDimension) bool {
	switch dimension {
	case runtimeprovider.UsageDimensionCPU,
		runtimeprovider.UsageDimensionMemory,
		runtimeprovider.UsageDimensionHotStorage,
		runtimeprovider.UsageDimensionColdStorage,
		runtimeprovider.UsageDimensionCheckpointStorage,
		runtimeprovider.UsageDimensionEgress:
		return true
	default:
		return false
	}
}
