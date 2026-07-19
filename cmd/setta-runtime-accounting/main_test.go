package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"testing"
	"time"

	"setta/internal/runtimeaccounting"
	"setta/internal/runtimeprovider"
)

func TestRunProducesIdenticalOneShotAndRestartedEvidence(t *testing.T) {
	directory := t.TempDir()
	configuration := testConfig(t)
	configPath := writeJSONFile(t, directory, "config.json", configuration)
	fullEvents := testEvents(configuration.WindowStart)
	fullEventsPath := writeEventsFile(t, directory, "events-full.jsonl", fullEvents)
	prefixEventsPath := writeEventsFile(t, directory, "events-prefix.jsonl", fullEvents[:2])

	oneShotState := filepath.Join(directory, "one-shot-state.json")
	oneShotOutput := filepath.Join(directory, "one-shot-evidence.json")
	if err := run([]string{
		"--config", configPath, "--events", fullEventsPath, "--state", oneShotState,
		"--finalize", "--out", oneShotOutput,
	}); err != nil {
		t.Fatalf("one-shot run: %v", err)
	}

	restartedState := filepath.Join(directory, "restarted-state.json")
	restartedOutput := filepath.Join(directory, "restarted-evidence.json")
	if err := run([]string{
		"--config", configPath, "--events", prefixEventsPath, "--state", restartedState,
	}); err != nil {
		t.Fatalf("prefix run: %v", err)
	}
	if err := run([]string{
		"--config", configPath, "--events", fullEventsPath, "--state", restartedState,
		"--finalize", "--out", restartedOutput,
	}); err != nil {
		t.Fatalf("restarted final run: %v", err)
	}
	oneShot := readFile(t, oneShotOutput)
	restarted := readFile(t, restartedOutput)
	if !slices.Equal(oneShot, restarted) {
		t.Fatalf("restarted evidence differs\none-shot=%s\nrestarted=%s", oneShot, restarted)
	}
	if err := run([]string{
		"--config", configPath, "--events", fullEventsPath, "--state", restartedState,
		"--finalize", "--out", restartedOutput,
	}); err != nil {
		t.Fatalf("idempotent rerun: %v", err)
	}
	if rerun := readFile(t, restartedOutput); !slices.Equal(restarted, rerun) {
		t.Fatalf("idempotent output changed")
	}
	appendedPath := writeEventsFile(t, directory, "events-appended.jsonl", append(fullEvents, runtimeaccounting.ActivityEvent{
		Sequence: 5, EventID: "late-provider-start", At: configuration.WindowEnd.Add(time.Minute),
		Kind: runtimeaccounting.ActivityProvider, Action: runtimeaccounting.EventBegin,
	}))
	if err := run([]string{
		"--config", configPath, "--events", appendedPath, "--state", restartedState,
		"--finalize", "--out", restartedOutput,
	}); err == nil {
		t.Fatal("finalized evidence accepted an appended event stream")
	}

	var result evidence
	if err := json.Unmarshal(oneShot, &result); err != nil {
		t.Fatalf("Unmarshal evidence: %v", err)
	}
	if result.Cost.CoveredTotal != 113_750 || result.Cutoff.Action != runtimeaccounting.CutoffSuspend {
		t.Fatalf("evidence = %#v", result)
	}
	info, err := os.Stat(restartedState)
	if err != nil {
		t.Fatalf("Stat state: %v", err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("state mode = %o, want 600", info.Mode().Perm())
	}
}

func TestRunRejectsConflictingReplayAndStrictInput(t *testing.T) {
	directory := t.TempDir()
	configuration := testConfig(t)
	configPath := writeJSONFile(t, directory, "config.json", configuration)
	events := testEvents(configuration.WindowStart)
	prefixPath := writeEventsFile(t, directory, "prefix.jsonl", events[:2])
	statePath := filepath.Join(directory, "state.json")
	if err := run([]string{"--config", configPath, "--events", prefixPath, "--state", statePath}); err != nil {
		t.Fatalf("prefix run: %v", err)
	}

	conflicting := append([]runtimeaccounting.ActivityEvent(nil), events...)
	conflicting[0].At = conflicting[0].At.Add(time.Second)
	conflictingPath := writeEventsFile(t, directory, "conflicting.jsonl", conflicting)
	if err := run([]string{"--config", configPath, "--events", conflictingPath, "--state", statePath}); !errors.Is(err, runtimeaccounting.ErrInvalidEvent) {
		t.Fatalf("conflicting replay error = %v, want ErrInvalidEvent", err)
	}

	configBytes := readFile(t, configPath)
	unknownConfig := append(configBytes[:len(configBytes)-1], []byte(",\"unknown\":true}")...)
	unknownConfigPath := filepath.Join(directory, "unknown-config.json")
	if err := os.WriteFile(unknownConfigPath, unknownConfig, 0o600); err != nil {
		t.Fatalf("write unknown config: %v", err)
	}
	if err := run([]string{"--config", unknownConfigPath, "--events", prefixPath, "--state", filepath.Join(directory, "unused")}); err == nil {
		t.Fatal("configuration with unknown field succeeded")
	}

	corruptState := append(readFile(t, statePath), []byte("{}")...)
	if err := os.WriteFile(statePath, corruptState, 0o600); err != nil {
		t.Fatalf("write corrupt state: %v", err)
	}
	if err := run([]string{"--config", configPath, "--events", prefixPath, "--state", statePath}); err == nil {
		t.Fatal("state with trailing JSON succeeded")
	}
}

func TestRunRequiresCompleteOrderedStreamAndImmutableFinalization(t *testing.T) {
	directory := t.TempDir()
	configuration := testConfig(t)
	configPath := writeJSONFile(t, directory, "config.json", configuration)
	events := testEvents(configuration.WindowStart)
	prefixPath := writeEventsFile(t, directory, "prefix.jsonl", events[:2])
	fullPath := writeEventsFile(t, directory, "full.jsonl", events)
	statePath := filepath.Join(directory, "state.json")
	outputPath := filepath.Join(directory, "evidence.json")
	if err := run([]string{"--config", configPath, "--events", prefixPath, "--state", statePath}); err != nil {
		t.Fatalf("prefix run: %v", err)
	}
	suffixPath := writeEventsFile(t, directory, "suffix.jsonl", events[2:])
	if err := run([]string{"--config", configPath, "--events", suffixPath, "--state", statePath, "--finalize", "--out", outputPath}); err == nil {
		t.Fatal("suffix stream finalized persisted accounting")
	}
	reordered := append([]runtimeaccounting.ActivityEvent(nil), events...)
	reordered[0], reordered[1] = reordered[1], reordered[0]
	reorderedPath := writeEventsFile(t, directory, "reordered.jsonl", reordered)
	if err := run([]string{"--config", configPath, "--events", reorderedPath, "--state", statePath, "--finalize", "--out", outputPath}); err == nil {
		t.Fatal("reordered stream finalized persisted accounting")
	}
	if err := run([]string{"--config", configPath, "--events", fullPath, "--state", statePath, "--finalize", "--out", outputPath}); err != nil {
		t.Fatalf("finalize full stream: %v", err)
	}
	finalizedState := readFile(t, statePath)
	appended := append(append([]runtimeaccounting.ActivityEvent(nil), events...), runtimeaccounting.ActivityEvent{
		Sequence: 5, EventID: "late", At: configuration.WindowEnd.Add(time.Minute),
		Kind: runtimeaccounting.ActivityProvider, Action: runtimeaccounting.EventBegin,
	})
	appendedPath := writeEventsFile(t, directory, "appended.jsonl", appended)
	if err := run([]string{"--config", configPath, "--events", appendedPath, "--state", statePath, "--finalize", "--out", outputPath}); err == nil {
		t.Fatal("finalized state accepted new event")
	}
	if actual := readFile(t, statePath); !slices.Equal(actual, finalizedState) {
		t.Fatal("rejected post-finalization event mutated state")
	}
}

func TestRunRejectsPersistedDurationsThatDoNotMatchEvents(t *testing.T) {
	directory := t.TempDir()
	configuration := testConfig(t)
	configPath := writeJSONFile(t, directory, "config.json", configuration)
	events := testEvents(configuration.WindowStart)
	prefixPath := writeEventsFile(t, directory, "prefix.jsonl", events[:2])
	fullPath := writeEventsFile(t, directory, "full.jsonl", events)
	statePath := filepath.Join(directory, "state.json")
	outputPath := filepath.Join(directory, "evidence.json")
	if err := run([]string{"--config", configPath, "--events", prefixPath, "--state", statePath}); err != nil {
		t.Fatalf("prefix run: %v", err)
	}
	var persisted experimentState
	if err := json.Unmarshal(readFile(t, statePath), &persisted); err != nil {
		t.Fatalf("Unmarshal state: %v", err)
	}
	persisted.Ledger.ProviderTime = 5 * time.Minute
	tampered, err := json.Marshal(persisted)
	if err != nil {
		t.Fatalf("Marshal state: %v", err)
	}
	if err := os.WriteFile(statePath, tampered, 0o600); err != nil {
		t.Fatalf("WriteFile state: %v", err)
	}
	before := readFile(t, statePath)
	if err := run([]string{
		"--config", configPath, "--events", fullPath, "--state", statePath,
		"--finalize", "--out", outputPath,
	}); err == nil {
		t.Fatal("tampered ledger durations produced evidence")
	}
	if actual := readFile(t, statePath); !slices.Equal(actual, before) {
		t.Fatal("rejected tampered state was overwritten")
	}
}

func TestRunRejectsPathAliases(t *testing.T) {
	directory := t.TempDir()
	configuration := testConfig(t)
	configPath := writeJSONFile(t, directory, "config.json", configuration)
	eventsPath := writeEventsFile(t, directory, "events.jsonl", testEvents(configuration.WindowStart))
	statePath := filepath.Join(directory, "state.json")
	if err := os.Link(configPath, filepath.Join(directory, "config-hardlink.json")); err != nil {
		t.Fatalf("Link: %v", err)
	}
	configAlias := filepath.Join(directory, "config-hardlink.json")
	if err := run([]string{"--config", configPath, "--events", eventsPath, "--state", configAlias}); err == nil {
		t.Fatal("hard-linked state/config paths succeeded")
	}
	if err := run([]string{
		"--config", configPath, "--events", eventsPath, "--state", statePath,
		"--finalize", "--out", statePath,
	}); err == nil {
		t.Fatal("identical output/state paths succeeded")
	}
	realParent := filepath.Join(directory, "real")
	if err := os.Mkdir(realParent, 0o700); err != nil {
		t.Fatalf("Mkdir: %v", err)
	}
	aliasParent := filepath.Join(directory, "alias")
	if err := os.Symlink(realParent, aliasParent); err != nil {
		t.Fatalf("Symlink: %v", err)
	}
	futureState := filepath.Join(realParent, "future.json")
	futureOutputAlias := filepath.Join(aliasParent, "future.json")
	if err := run([]string{
		"--config", configPath, "--events", eventsPath, "--state", futureState,
		"--finalize", "--out", futureOutputAlias,
	}); err == nil {
		t.Fatal("nonexistent state/output aliases through symlinked parents succeeded")
	}
	caseState := filepath.Join(realParent, "CaseState.json")
	caseOutput := filepath.Join(realParent, "casestate.json")
	if err := run([]string{
		"--config", configPath, "--events", eventsPath, "--state", caseState,
		"--finalize", "--out", caseOutput,
	}); err == nil {
		t.Fatal("case-only future state/output paths succeeded")
	}
}

func TestSaveJSONAtomicPreservesExistingFileOnEncodingFailure(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "state.json")
	original := []byte("original\n")
	if err := os.WriteFile(path, original, 0o600); err != nil {
		t.Fatalf("write original: %v", err)
	}
	if err := saveJSONAtomic(path, make(chan int)); err == nil {
		t.Fatal("save of unsupported value succeeded")
	}
	if actual := readFile(t, path); !slices.Equal(actual, original) {
		t.Fatalf("original changed: %q", actual)
	}
	matches, err := filepath.Glob(filepath.Join(directory, ".setta-accounting-*.tmp"))
	if err != nil {
		t.Fatalf("Glob: %v", err)
	}
	if len(matches) != 0 {
		t.Fatalf("temporary files remain: %#v", matches)
	}
}

func testConfig(t *testing.T) config {
	t.Helper()
	identity, err := runtimeprovider.NewManagedIdentity("accounting-command")
	if err != nil {
		t.Fatalf("NewManagedIdentity: %v", err)
	}
	start := time.Date(2026, time.July, 14, 12, 0, 0, 0, time.UTC)
	return config{
		Version: configVersion, Provider: "sprites", RateCard: spritesRateCard,
		RuntimeName: identity.Name, WindowStart: start, WindowEnd: start.Add(time.Hour),
		ObservedAt: start.Add(time.Hour),
		Ceilings: runtimeaccounting.ResourceCeilings{
			CPUCoreMillionths: runtimeaccounting.EnforcedBound{Enforced: true, Value: 1_000_000},
			MemoryBytes:       runtimeaccounting.EnforcedBound{Enforced: true, Value: 1_000_000_000},
		},
		Budget: budgetConfig{
			CoveredLimitUSDMicros: 120_000, SafetyReserveUSDMicros: 4_353,
			MaximumCutoffLag: "1m",
			RequiredDimensions: []runtimeprovider.UsageDimension{
				runtimeprovider.UsageDimensionCPU,
				runtimeprovider.UsageDimensionMemory,
			},
		},
	}
}

func testEvents(start time.Time) []runtimeaccounting.ActivityEvent {
	return []runtimeaccounting.ActivityEvent{
		{
			Sequence: 1, EventID: "provider-start", At: start,
			Kind: runtimeaccounting.ActivityProvider, Action: runtimeaccounting.EventBegin,
		},
		{
			Sequence: 2, EventID: "client-start", At: start.Add(10 * time.Minute),
			Kind: runtimeaccounting.ActivityAttachment, Action: runtimeaccounting.EventBegin, SubjectID: "client",
		},
		{
			Sequence: 3, EventID: "client-end", At: start.Add(50 * time.Minute),
			Kind: runtimeaccounting.ActivityAttachment, Action: runtimeaccounting.EventEnd, SubjectID: "client",
		},
		{
			Sequence: 4, EventID: "provider-end", At: start.Add(time.Hour),
			Kind: runtimeaccounting.ActivityProvider, Action: runtimeaccounting.EventEnd,
		},
	}
}

func writeJSONFile(t *testing.T, directory string, name string, value any) string {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	path := filepath.Join(directory, name)
	if err := os.WriteFile(path, encoded, 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	return path
}

func writeEventsFile(
	t *testing.T,
	directory string,
	name string,
	events []runtimeaccounting.ActivityEvent,
) string {
	t.Helper()
	path := filepath.Join(directory, name)
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		t.Fatalf("OpenFile: %v", err)
	}
	encoder := json.NewEncoder(file)
	for _, event := range events {
		if err := encoder.Encode(event); err != nil {
			t.Fatalf("Encode event: %v", err)
		}
	}
	if err := file.Close(); err != nil {
		t.Fatalf("Close events: %v", err)
	}
	return path
}

func readFile(t *testing.T, name string) []byte {
	t.Helper()
	value, err := os.ReadFile(name)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	return value
}
