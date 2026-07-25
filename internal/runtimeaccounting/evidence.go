package runtimeaccounting

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"setta/internal/runtimecost"
	"setta/internal/runtimeprovider"
)

const (
	EvidenceVersion              = 1
	EvidenceConfigurationVersion = 1
)

// EvidenceConfiguration is the provider-neutral, versioned input contract for
// one finalized accounting window.
type EvidenceConfiguration struct {
	Version     int                         `json:"version"`
	Provider    string                      `json:"provider"`
	RateCard    string                      `json:"rate_card"`
	RuntimeName string                      `json:"runtime_name"`
	WindowStart time.Time                   `json:"window_start"`
	WindowEnd   time.Time                   `json:"window_end"`
	ObservedAt  time.Time                   `json:"observed_at"`
	Ceilings    ResourceCeilings            `json:"ceilings"`
	Budget      EvidenceBudgetConfiguration `json:"budget"`
}

type EvidenceBudgetConfiguration struct {
	CoveredLimitUSDMicros  uint64                           `json:"covered_limit_usd_micros"`
	SafetyReserveUSDMicros uint64                           `json:"safety_reserve_usd_micros"`
	MaximumCutoffLag       string                           `json:"maximum_cutoff_lag"`
	RequiredDimensions     []runtimeprovider.UsageDimension `json:"required_dimensions"`
}

func (configuration EvidenceConfiguration) Validate() error {
	if configuration.Version != EvidenceConfigurationVersion ||
		configuration.Provider == "" || configuration.RateCard == "" {
		return errors.New("invalid accounting configuration identity")
	}
	if err := runtimeprovider.ValidateManagedName(configuration.RuntimeName); err != nil {
		return err
	}
	if configuration.WindowStart.IsZero() ||
		!configuration.WindowEnd.After(configuration.WindowStart) ||
		configuration.ObservedAt.Before(configuration.WindowEnd) {
		return errors.New("invalid accounting configuration window")
	}
	if err := configuration.Ceilings.Validate(); err != nil {
		return err
	}
	_, err := configuration.Budget.Policy()
	return err
}

func (configuration EvidenceConfiguration) SHA256() (string, error) {
	if err := configuration.Validate(); err != nil {
		return "", err
	}
	encoded, err := json.Marshal(configuration)
	if err != nil {
		return "", fmt.Errorf("encode accounting configuration: %w", err)
	}
	digest := sha256.Sum256(encoded)
	return hex.EncodeToString(digest[:]), nil
}

func (configuration EvidenceBudgetConfiguration) Policy() (BudgetPolicy, error) {
	lag, err := time.ParseDuration(configuration.MaximumCutoffLag)
	if err != nil {
		return BudgetPolicy{}, fmt.Errorf("parse maximum cutoff lag: %w", err)
	}
	policy := BudgetPolicy{
		CoveredLimitUSDMicros:  configuration.CoveredLimitUSDMicros,
		SafetyReserveUSDMicros: configuration.SafetyReserveUSDMicros,
		MaximumCutoffLag:       lag,
		RequiredDimensions:     append([]runtimeprovider.UsageDimension(nil), configuration.RequiredDimensions...),
	}
	if policy.CoveredLimitUSDMicros == 0 ||
		policy.SafetyReserveUSDMicros >= policy.CoveredLimitUSDMicros ||
		policy.MaximumCutoffLag <= 0 ||
		len(policy.RequiredDimensions) == 0 {
		return BudgetPolicy{}, fmt.Errorf("%w: invalid budget policy", runtimeprovider.ErrInvalidContract)
	}
	return policy, nil
}

// FinalizeEvidence closes one already-verified ledger window through the same
// calculation path used by offline and online accounting.
func FinalizeEvidence(
	configuration EvidenceConfiguration,
	eventsSHA256 string,
	schedule runtimecost.PriceSchedule,
	closed ClosedWindow,
) (Evidence, error) {
	configSHA256, err := configuration.SHA256()
	if err != nil {
		return Evidence{}, err
	}
	if !ValidSHA256(eventsSHA256) {
		return Evidence{}, errors.New("invalid accounting event hash")
	}
	if schedule.Provider != configuration.Provider {
		return Evidence{}, errors.New("accounting provider does not match its rate card")
	}
	if !closed.Window.Start.Equal(configuration.WindowStart) ||
		!closed.Window.End.Equal(configuration.WindowEnd) {
		return Evidence{}, errors.New("closed accounting window does not match its configuration")
	}
	policy, err := configuration.Budget.Policy()
	if err != nil {
		return Evidence{}, err
	}
	usage, err := ConservativeObservation(
		configuration.Provider,
		configuration.RuntimeName,
		closed,
		configuration.ObservedAt,
		configuration.Ceilings,
	)
	if err != nil {
		return Evidence{}, err
	}
	cost, err := runtimecost.Estimate(schedule, usage)
	if err != nil {
		return Evidence{}, err
	}
	cutoff, err := EvaluateCutoff(schedule, usage, configuration.Ceilings, policy)
	if err != nil {
		return Evidence{}, err
	}
	return Evidence{
		Version: EvidenceVersion, ConfigSHA256: configSHA256, EventsSHA256: eventsSHA256,
		RateCardVersion: schedule.Version, Usage: usage, Cost: cost, Cutoff: cutoff,
	}, nil
}

func ValidateEvidenceIdentity(evidence Evidence, rateCardVersion string) error {
	if evidence.Version != EvidenceVersion ||
		evidence.RateCardVersion != rateCardVersion ||
		!ValidSHA256(evidence.ConfigSHA256) ||
		!ValidSHA256(evidence.EventsSHA256) {
		return errors.New("submitted usage evidence identity is invalid")
	}
	return nil
}

func ValidSHA256(value string) bool {
	if len(value) != sha256.Size*2 || value != strings.ToLower(value) {
		return false
	}
	decoded, err := hex.DecodeString(value)
	return err == nil && len(decoded) == sha256.Size
}

// CanonicalActivityEventLine is the one JSONL representation hashed by both
// offline and online accounting event streams.
func CanonicalActivityEventLine(event ActivityEvent) ([]byte, error) {
	encoded, err := json.Marshal(event)
	if err != nil {
		return nil, fmt.Errorf("encode accounting activity event: %w", err)
	}
	return append(encoded, '\n'), nil
}
