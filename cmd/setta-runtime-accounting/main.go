package main

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/jsonio"
	"setta/internal/runtimeaccounting"
	"setta/internal/runtimecost"
	spritescost "setta/internal/runtimecost/sprites"
)

const (
	stateVersion      = 1
	spritesRateCard   = "sprites-public-2026-07-14"
	maximumEventBytes = 1 << 20
)

type config = runtimeaccounting.EvidenceConfiguration
type budgetConfig = runtimeaccounting.EvidenceBudgetConfiguration

type experimentState struct {
	Version      int                           `json:"version"`
	ConfigSHA256 string                        `json:"config_sha256"`
	Ledger       runtimeaccounting.LedgerState `json:"ledger"`
	Evidence     *runtimeaccounting.Evidence   `json:"evidence,omitempty"`
}

type commandOptions struct {
	ConfigPath string
	EventsPath string
	StatePath  string
	OutputPath string
	Finalize   bool
}

type execution struct {
	options       commandOptions
	configuration config
	configHash    string
	schedule      runtimecost.PriceSchedule
	policy        runtimeaccounting.BudgetPolicy
	state         experimentState
	ledger        *runtimeaccounting.Ledger
	verified      *runtimeaccounting.Ledger
	eventsHash    string
}

func main() {
	if err := run(os.Args[1:]); err != nil {
		_, _ = fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(arguments []string) error {
	options, err := parseCommandOptions(arguments)
	if err != nil {
		return err
	}
	current, err := loadExecution(options)
	if err != nil {
		return err
	}
	if err := current.reconcile(); err != nil {
		return err
	}
	return current.persist()
}

func parseCommandOptions(arguments []string) (commandOptions, error) {
	flagSet := flag.NewFlagSet("setta-runtime-accounting", flag.ContinueOnError)
	configPath := flagSet.String("config", "", "absolute path to strict versioned configuration JSON")
	eventsPath := flagSet.String("events", "", "absolute path to accounting event JSONL")
	statePath := flagSet.String("state", "", "absolute path to atomic restart state")
	outputPath := flagSet.String("out", "", "absolute evidence path, required with --finalize")
	finalize := flagSet.Bool("finalize", false, "close the configured window and emit evidence")
	if err := flagSet.Parse(arguments); err != nil {
		return commandOptions{}, err
	}
	options := commandOptions{
		ConfigPath: *configPath, EventsPath: *eventsPath, StatePath: *statePath,
		OutputPath: *outputPath, Finalize: *finalize,
	}
	paths := []string{*configPath, *eventsPath, *statePath}
	if *finalize {
		paths = append(paths, *outputPath)
	}
	if flagSet.NArg() != 0 || !allAbsolute(paths...) || (!*finalize && *outputPath != "") ||
		!allDistinct(paths...) {
		return commandOptions{}, errors.New("usage: setta-runtime-accounting --config <absolute> --events <absolute> --state <absolute> [--finalize --out <absolute>]")
	}
	return options, nil
}

func loadExecution(options commandOptions) (*execution, error) {
	configuration, configHash, schedule, policy, err := loadConfiguration(options.ConfigPath)
	if err != nil {
		return nil, err
	}
	state, found, err := loadState(options.StatePath)
	if err != nil {
		return nil, err
	}
	ledger, state, err := restoreExperimentLedger(configuration, configHash, state, found)
	if err != nil {
		return nil, err
	}
	eventsHash, err := applyEvents(options.EventsPath, ledger)
	if err != nil {
		return nil, err
	}
	verifiedLedger, err := runtimeaccounting.NewLedger(configuration.WindowStart)
	if err != nil {
		return nil, err
	}
	verifiedEventsHash, err := applyEvents(options.EventsPath, verifiedLedger)
	if err != nil {
		return nil, err
	}
	if verifiedEventsHash != eventsHash {
		return nil, errors.New("accounting event hash changed during verification")
	}
	return &execution{
		options: options, configuration: configuration, configHash: configHash,
		schedule: schedule, policy: policy, state: state, ledger: ledger,
		verified: verifiedLedger, eventsHash: eventsHash,
	}, nil
}

func restoreExperimentLedger(
	configuration config,
	configHash string,
	state experimentState,
	found bool,
) (*runtimeaccounting.Ledger, experimentState, error) {
	if !found {
		ledger, err := runtimeaccounting.NewLedger(configuration.WindowStart)
		return ledger, experimentState{Version: stateVersion, ConfigSHA256: configHash}, err
	}
	if state.ConfigSHA256 != configHash {
		return nil, experimentState{}, errors.New("accounting state belongs to a different configuration")
	}
	ledger, err := runtimeaccounting.RestoreLedger(state.Ledger)
	return ledger, state, err
}

func (current *execution) reconcile() error {
	if current.state.Evidence == nil {
		return current.reconcileOpenState()
	}
	return current.reconcileFinalizedState()
}

func (current *execution) reconcileFinalizedState() error {
	stored := current.state.Evidence
	if stored.ConfigSHA256 != current.configHash || stored.EventsSHA256 != current.eventsHash ||
		stored.RateCardVersion != current.schedule.Version {
		return errors.New("finalized accounting evidence does not match its immutable inputs")
	}
	verifiedClosed, err := current.verified.Close(current.configuration.WindowEnd)
	if err != nil {
		return err
	}
	expected, err := buildEvidence(
		current.configuration, current.configHash, current.eventsHash,
		current.schedule, current.policy, verifiedClosed,
	)
	if err != nil {
		return err
	}
	if !canonicalEqual(stored, expected) ||
		!canonicalEqual(current.ledger.Snapshot(), current.verified.Snapshot()) {
		return errors.New("finalized accounting state is inconsistent with its event stream")
	}
	current.ledger = current.verified
	return nil
}

func (current *execution) reconcileOpenState() error {
	if !canonicalEqual(current.ledger.Snapshot(), current.verified.Snapshot()) {
		return errors.New("accounting state is inconsistent with its event stream")
	}
	current.ledger = current.verified
	if !current.options.Finalize {
		return nil
	}
	closed, err := current.ledger.Close(current.configuration.WindowEnd)
	if err != nil {
		return err
	}
	current.state.Evidence, err = buildEvidence(
		current.configuration, current.configHash, current.eventsHash,
		current.schedule, current.policy, closed,
	)
	return err
}

func (current *execution) persist() error {
	current.state.Ledger = current.ledger.Snapshot()
	if err := saveJSONAtomic(current.options.StatePath, current.state); err != nil {
		return err
	}
	if !current.options.Finalize {
		return nil
	}
	persisted, found, err := loadState(current.options.StatePath)
	if err != nil {
		return err
	}
	if !found || persisted.Evidence == nil {
		return errors.New("persisted accounting evidence is unavailable")
	}
	return saveJSONAtomic(current.options.OutputPath, persisted.Evidence)
}

func buildEvidence(
	configuration config,
	configHash string,
	eventsHash string,
	schedule runtimecost.PriceSchedule,
	policy runtimeaccounting.BudgetPolicy,
	closed runtimeaccounting.ClosedWindow,
) (*runtimeaccounting.Evidence, error) {
	finalized, err := runtimeaccounting.FinalizeEvidence(configuration, eventsHash, schedule, closed)
	if err != nil {
		return nil, err
	}
	configuredPolicy, err := configuration.Budget.Policy()
	if err != nil {
		return nil, err
	}
	if finalized.ConfigSHA256 != configHash || !canonicalEqual(configuredPolicy, policy) {
		return nil, errors.New("accounting finalization inputs are inconsistent")
	}
	return &finalized, nil
}

func canonicalEqual(first any, second any) bool {
	firstEncoded, firstErr := json.Marshal(first)
	secondEncoded, secondErr := json.Marshal(second)
	return firstErr == nil && secondErr == nil && bytes.Equal(firstEncoded, secondEncoded)
}

func loadConfiguration(name string) (config, string, runtimecost.PriceSchedule, runtimeaccounting.BudgetPolicy, error) {
	file, err := os.Open(name)
	if err != nil {
		return config{}, "", runtimecost.PriceSchedule{}, runtimeaccounting.BudgetPolicy{}, err
	}
	defer file.Close()
	var configuration config
	if err := jsonio.DecodeSingle(file, &configuration); err != nil {
		return config{}, "", runtimecost.PriceSchedule{}, runtimeaccounting.BudgetPolicy{}, err
	}
	if err := validateConfiguration(configuration); err != nil {
		return config{}, "", runtimecost.PriceSchedule{}, runtimeaccounting.BudgetPolicy{},
			err
	}
	configHash, err := configuration.SHA256()
	if err != nil {
		return config{}, "", runtimecost.PriceSchedule{}, runtimeaccounting.BudgetPolicy{}, err
	}
	policy, err := configuration.Budget.Policy()
	if err != nil {
		return config{}, "", runtimecost.PriceSchedule{}, runtimeaccounting.BudgetPolicy{}, err
	}
	return configuration, configHash, spritescost.PublishedRates20260714(), policy, nil
}

func validateConfiguration(configuration config) error {
	if err := configuration.Validate(); err != nil {
		return err
	}
	if configuration.Provider != spritescost.Provider || configuration.RateCard != spritesRateCard {
		return errors.New("invalid accounting provider or rate card")
	}
	return nil
}

func applyEvents(name string, ledger *runtimeaccounting.Ledger) (string, error) {
	file, err := os.Open(name)
	if err != nil {
		return "", err
	}
	defer file.Close()
	digest := sha256.New()
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 64*1024), maximumEventBytes)
	line := 0
	expectedSequence := uint64(1)
	for scanner.Scan() {
		line++
		if len(scanner.Bytes()) == 0 {
			return "", fmt.Errorf("event line %d is empty", line)
		}
		var event runtimeaccounting.ActivityEvent
		if err := jsonio.DecodeSingle(bytes.NewReader(scanner.Bytes()), &event); err != nil {
			return "", fmt.Errorf("decode event line %d: %w", line, err)
		}
		if event.Sequence != expectedSequence {
			return "", fmt.Errorf("event line %d sequence = %d, want %d", line, event.Sequence, expectedSequence)
		}
		if expectedSequence == ^uint64(0) {
			return "", fmt.Errorf("event line %d exhausts sequence space", line)
		}
		expectedSequence++
		if err := ledger.Apply(event); err != nil {
			return "", fmt.Errorf("apply event line %d: %w", line, err)
		}
		canonical, err := runtimeaccounting.CanonicalActivityEventLine(event)
		if err != nil {
			return "", err
		}
		if _, err := digest.Write(canonical); err != nil {
			return "", err
		}
	}
	if err := scanner.Err(); err != nil {
		return "", err
	}
	return hex.EncodeToString(digest.Sum(nil)), nil
}

func loadState(name string) (experimentState, bool, error) {
	file, err := os.Open(name)
	if errors.Is(err, fs.ErrNotExist) {
		return experimentState{}, false, nil
	}
	if err != nil {
		return experimentState{}, false, err
	}
	defer file.Close()
	var state experimentState
	if err := jsonio.DecodeSingle(file, &state); err != nil {
		return experimentState{}, false, err
	}
	if state.Version != stateVersion || state.ConfigSHA256 == "" {
		return experimentState{}, false, errors.New("invalid accounting state")
	}
	return state, true, nil
}

func saveJSONAtomic(name string, value any) error {
	parent := filepath.Dir(name)
	temporary, err := os.CreateTemp(parent, ".setta-accounting-*.tmp")
	if err != nil {
		return err
	}
	temporaryName := temporary.Name()
	committed := false
	defer func() {
		_ = temporary.Close()
		if !committed {
			_ = os.Remove(temporaryName)
		}
	}()
	if err := temporary.Chmod(0o600); err != nil {
		return err
	}
	encoder := json.NewEncoder(temporary)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(value); err != nil {
		return err
	}
	if err := temporary.Sync(); err != nil {
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	if err := os.Rename(temporaryName, name); err != nil {
		return err
	}
	committed = true
	directory, err := os.Open(parent)
	if err != nil {
		return err
	}
	defer directory.Close()
	return directory.Sync()
}

func allAbsolute(values ...string) bool {
	for _, value := range values {
		if !filepath.IsAbs(value) {
			return false
		}
	}
	return true
}

func allDistinct(values ...string) bool {
	seen := make(map[string]struct{}, len(values))
	infos := make([]fs.FileInfo, 0, len(values))
	for _, value := range values {
		canonical, err := canonicalFuturePath(value)
		if err != nil {
			return false
		}
		comparisonKey := strings.ToUpper(canonical)
		if _, duplicate := seen[comparisonKey]; duplicate {
			return false
		}
		seen[comparisonKey] = struct{}{}
		info, err := os.Stat(value)
		if err == nil {
			for _, previous := range infos {
				if os.SameFile(previous, info) {
					return false
				}
			}
			infos = append(infos, info)
		} else if !errors.Is(err, fs.ErrNotExist) {
			return false
		}
	}
	return true
}

func canonicalFuturePath(name string) (string, error) {
	current := filepath.Clean(name)
	components := make([]string, 0)
	for {
		resolved, err := filepath.EvalSymlinks(current)
		if err == nil {
			for index := len(components) - 1; index >= 0; index-- {
				resolved = filepath.Join(resolved, components[index])
			}
			return filepath.Clean(resolved), nil
		}
		if !errors.Is(err, fs.ErrNotExist) {
			return "", err
		}
		parent := filepath.Dir(current)
		if parent == current {
			return "", err
		}
		components = append(components, filepath.Base(current))
		current = parent
	}
}
