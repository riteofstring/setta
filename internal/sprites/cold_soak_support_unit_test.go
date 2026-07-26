package sprites

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	spritessdk "github.com/superfly/sprites-go"

	"setta/internal/runtimeprovider"
)

func TestColdSoakManifestRoundTripAndSchedule(t *testing.T) {
	now := time.Date(2026, 7, 14, 12, 0, 0, 0, time.UTC)
	stateDirectory := t.TempDir()
	store, err := newColdSoakStateStore(stateDirectory, func() time.Time { return now })
	if err != nil {
		t.Fatalf("newColdSoakStateStore: %v", err)
	}
	manifest, err := newColdSoakManifest("unit-run", now, coldSoakVersions{
		ProviderAPI: "v1", SDK: "sdk-version", CLI: "cli-version",
	}, coldSoakCapacity{Organization: "setta-100", WarmLimit: 2, RunningLimit: 10})
	if err != nil {
		t.Fatalf("newColdSoakManifest: %v", err)
	}
	manifest.ColdEpoch = now.Add(time.Hour)
	for index := range manifest.Cohorts {
		manifest.Cohorts[index].DueAt = manifest.ColdEpoch.Add(
			time.Duration(manifest.Cohorts[index].DurationHours) * time.Hour,
		)
	}
	if err := store.save(manifest); err != nil {
		t.Fatalf("save: %v", err)
	}
	loaded, err := store.load()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if loaded.RunID != manifest.RunID || len(loaded.Pressure) != 2 ||
		!loaded.Cohorts[2].DueAt.Equal(now.Add(49*time.Hour)) {
		t.Fatalf("loaded manifest = %#v", loaded)
	}
	if err := store.appendEvidence(coldSoakEvidence{Kind: "test", Phase: "unit"}); err != nil {
		t.Fatalf("appendEvidence: %v", err)
	}
	contents, err := os.ReadFile(filepath.Join(stateDirectory, coldSoakEvidenceName))
	if err != nil {
		t.Fatalf("read evidence: %v", err)
	}
	var evidence coldSoakEvidence
	if err := json.Unmarshal(contents, &evidence); err != nil || !evidence.RecordedAt.Equal(now) {
		t.Fatalf("evidence=%#v err=%v", evidence, err)
	}
}

func TestColdSoakClassification(t *testing.T) {
	digest := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	start := coldSoakStart{StartedAt: time.Date(2026, 7, 14, 12, 0, 0, 0, time.UTC), BootID: "boot-one", ProcessID: 10}
	initial := coldSoakProbe{
		SentinelSHA256: digest, StartCount: 1, StartHistory: []coldSoakStart{start},
		Heartbeat: 20, CurrentBootID: "boot-one",
	}
	baseline := initial
	baseline.Heartbeat = 100

	warm := baseline
	warm.Heartbeat = 101
	classification, _, decided := classifyColdSoakProbe(initial, baseline, warm, true)
	if !decided || classification != coldSoakWarm {
		t.Fatalf("warm classification=%q decided=%t", classification, decided)
	}

	cold := coldSoakProbe{
		SentinelSHA256: digest,
		StartCount:     2,
		StartHistory: []coldSoakStart{
			start,
			{StartedAt: start.StartedAt.Add(12 * time.Hour), BootID: "boot-two", ProcessID: 11},
		},
		Heartbeat: 2, CurrentBootID: "boot-two",
	}
	classification, _, decided = classifyColdSoakProbe(initial, baseline, cold, true)
	if !decided || classification != coldSoakConfirmedCold {
		t.Fatalf("cold classification=%q decided=%t", classification, decided)
	}

	cold.SentinelSHA256 = "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd"
	classification, _, decided = classifyColdSoakProbe(initial, baseline, cold, true)
	if !decided || classification != coldSoakProviderFail {
		t.Fatalf("sentinel classification=%q decided=%t", classification, decided)
	}
}

func TestColdSoakServiceProbePersistsStartsAndResetsHeartbeat(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "persistence-sentinel"), []byte("unit sentinel\n"), 0o444); err != nil {
		t.Fatalf("write sentinel: %v", err)
	}
	fixture := filepath.Join("testdata", "cold_soak_service_probe.py")
	first := startColdSoakFixture(t, fixture, root)
	firstProbe := readColdSoakFixture(t, fixture, root, 1)
	advanced := awaitColdSoakHeartbeat(t, root, "an advanced heartbeat", func(heartbeat int) bool {
		return heartbeat >= advancedColdSoakHeartbeat
	})
	stopColdSoakFixture(t, first)
	second := startColdSoakFixture(t, fixture, root)
	t.Cleanup(func() { stopColdSoakFixture(t, second) })
	awaitColdSoakHeartbeat(t, root, "a heartbeat reset by the restart", func(heartbeat int) bool {
		return heartbeat < advanced
	})
	secondProbe := readColdSoakFixture(t, fixture, root, 2)

	if firstProbe.StartCount != 1 || secondProbe.StartCount != 2 || len(secondProbe.StartHistory) != 2 {
		t.Fatalf("first=%#v second=%#v", firstProbe, secondProbe)
	}
	if firstProbe.StartHistory[0].ProcessID == secondProbe.StartHistory[1].ProcessID {
		t.Fatalf("fixture reused process ID across explicit restart: %#v", secondProbe.StartHistory)
	}
}

func TestColdSoakDestroyOwnedIsIdempotentAndChecksLabels(t *testing.T) {
	identity, err := coldSoakIdentity("unit-run", "target", "12h")
	if err != nil {
		t.Fatalf("coldSoakIdentity: %v", err)
	}
	present := true
	destroyCalls := 0
	client := &fakeSDKAPI{
		findRuntime: func(_ context.Context, name string) (*spritessdk.SpriteInfo, bool, error) {
			if !present {
				return nil, false, nil
			}
			return &spritessdk.SpriteInfo{
				Name: name, Status: "cold", Labels: slices.Clone(identity.Labels),
				Config:      &spritessdk.SpriteConfig{CPUs: 1, RamMB: 512, StorageGB: 10},
				URLSettings: &spritessdk.URLSettings{},
			}, true, nil
		},
		destroy: func(_ context.Context, _ string) error {
			destroyCalls++
			present = false
			return nil
		},
	}
	harness := &coldSoakHarness{adapter: &Adapter{client: client}, now: time.Now}
	if err := harness.destroyOwned(context.Background(), identity.Name, identity.Labels); err != nil {
		t.Fatalf("first destroyOwned: %v", err)
	}
	if err := harness.destroyOwned(context.Background(), identity.Name, identity.Labels); err != nil {
		t.Fatalf("second destroyOwned: %v", err)
	}
	if destroyCalls != 1 {
		t.Fatalf("destroy calls = %d, want 1", destroyCalls)
	}
}

// advancedColdSoakHeartbeat is how far the first service must count, at 100 ms
// per beat, before the restart. A restarted service republishes zero, so the
// gap makes the reset observable instead of comparing two samples whose read
// latency depends on how loaded the machine is.
const advancedColdSoakHeartbeat = 10

// awaitColdSoakHeartbeat reads the heartbeat the service writes rather than the
// probe's JSON summary, so waiting for a restart to reset it costs a file read
// instead of an interpreter start.
func awaitColdSoakHeartbeat(t *testing.T, root string, want string, accept func(int) bool) int {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	observed := -1
	for time.Now().Before(deadline) {
		raw, err := os.ReadFile(filepath.Join(root, "service-heartbeat"))
		if err == nil {
			heartbeat, convertErr := strconv.Atoi(strings.TrimSpace(string(raw)))
			if convertErr == nil {
				observed = heartbeat
				if accept(heartbeat) {
					return heartbeat
				}
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("fixture never published %s; last heartbeat = %d", want, observed)
	return 0
}

func startColdSoakFixture(t *testing.T, fixture string, root string) *exec.Cmd {
	t.Helper()
	command := exec.Command("python3", fixture)
	command.Env = append(os.Environ(), "SETTA_COLD_SOAK_ROOT="+root, "SETTA_COLD_SOAK_BOOT_ID=unit-boot")
	if err := command.Start(); err != nil {
		t.Fatalf("start fixture: %v", err)
	}
	return command
}

func stopColdSoakFixture(t *testing.T, command *exec.Cmd) {
	t.Helper()
	if command == nil || command.ProcessState != nil {
		return
	}
	if err := command.Process.Kill(); err != nil {
		t.Fatalf("kill fixture: %v", err)
	}
	if err := command.Wait(); err == nil {
		t.Fatal("killed fixture exited successfully")
	}
}

func readColdSoakFixture(t *testing.T, fixture string, root string, expectedStarts int) coldSoakProbe {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	var output []byte
	var err error
	for time.Now().Before(deadline) {
		command := exec.Command("python3", fixture, "--read")
		command.Env = append(os.Environ(), "SETTA_COLD_SOAK_ROOT="+root, "SETTA_COLD_SOAK_BOOT_ID=unit-boot")
		output, err = command.Output()
		if err == nil {
			var candidate coldSoakProbe
			if decodeErr := json.Unmarshal(output, &candidate); decodeErr == nil && candidate.StartCount == expectedStarts {
				break
			}
			err = errors.New("fixture has not recorded the expected start")
		}
		time.Sleep(20 * time.Millisecond)
	}
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var probe coldSoakProbe
	if err := json.Unmarshal(output, &probe); err != nil {
		t.Fatalf("decode fixture output: %v", err)
	}
	if err := validateColdSoakProbe(probe); err != nil {
		t.Fatalf("validate fixture output: %v", err)
	}
	return probe
}

var _ runtimeprovider.Provider = (*Adapter)(nil)
