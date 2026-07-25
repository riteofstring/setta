package sprites

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"setta/internal/runtimeprovider"
)

const (
	coldSoakRemoteRoot          = "/home/sprite/.setta/cold-soak"
	coldSoakRemoteSentinel      = coldSoakRemoteRoot + "/persistence-sentinel"
	coldSoakRemoteServiceProbe  = coldSoakRemoteRoot + "/service_probe.py"
	coldSoakServiceName         = "setta-cold-soak-probe"
	coldSoakPressureServiceName = "setta-cold-soak-pressure"
	coldSoakMaximumWarmLimit    = 20
	coldSoakWarmDelay           = 120 * time.Second
	coldSoakMaximumWarmAdvance  = 900
	coldSoakMinimumHeartbeat    = 30
	coldSoakPreparationTimeout  = 20 * time.Minute
	coldSoakRestartTimeout      = 60 * time.Second
	coldSoakRequestTimeout      = 30 * time.Second
)

type coldSoakHarness struct {
	adapter *Adapter
	store   *coldSoakStateStore
	now     func() time.Time
	phase   string
}

type coldSoakOrgSnapshot struct {
	capacity coldSoakCapacity
	runtimes map[string]runtimeprovider.RuntimeObservation
}

func TestLiveConfirmedColdSoak(t *testing.T) {
	if os.Getenv("SETTA_LIVE_SPRITES") != "1" {
		t.Skip("set SETTA_LIVE_SPRITES=1 to authorize the destructive, billable cold-soak experiment")
	}
	phase := os.Getenv("SETTA_SPRITES_COLD_SOAK_PHASE")
	if phase == "" {
		t.Fatal("SETTA_SPRITES_COLD_SOAK_PHASE is required")
	}
	stateDirectory := os.Getenv("SETTA_SPRITES_COLD_SOAK_STATE")
	repositoryRoot := os.Getenv("SETTA_REPO_ROOT")
	if repositoryRoot == "" {
		t.Fatal("SETTA_REPO_ROOT is required")
	}
	store, err := newColdSoakStateStore(stateDirectory, time.Now)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.requireOutside(repositoryRoot); err != nil {
		t.Fatal(err)
	}
	token := os.Getenv("SPRITE_TOKEN")
	if token == "" {
		t.Fatal("SPRITE_TOKEN is required after live Sprites validation is authorized")
	}
	adapter, err := NewAdapter(token)
	if err != nil {
		t.Fatalf("construct Sprites adapter: %v", err)
	}
	harness := &coldSoakHarness{adapter: adapter, store: store, now: time.Now, phase: phase}
	timeout := 5 * time.Minute
	if phase == "prepare" {
		timeout = 35 * time.Minute
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	switch phase {
	case "prepare":
		err = harness.prepare(ctx, repositoryRoot)
	case "observe":
		err = harness.observe(ctx)
	case "verify-due":
		err = harness.verifyDue(ctx)
	case "cleanup":
		err = harness.cleanup(ctx, repositoryRoot)
	default:
		err = fmt.Errorf("unsupported cold-soak phase %q", phase)
	}
	if err != nil {
		t.Fatal(err)
	}
}

func (harness *coldSoakHarness) prepare(ctx context.Context, repositoryRoot string) (returnErr error) {
	manifest, err := harness.initializePreparation(ctx)
	if err != nil {
		return err
	}
	defer func() {
		if returnErr == nil {
			return
		}
		cleanupCtx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
		defer cancel()
		if cleanupErr := harness.cleanup(cleanupCtx, repositoryRoot); cleanupErr != nil {
			returnErr = errors.Join(returnErr, fmt.Errorf("cleanup after failed prepare: %w", cleanupErr))
		}
	}()
	if err := harness.prepareTargets(ctx, manifest); err != nil {
		return err
	}
	if err := harness.recordWarmBaselines(ctx, manifest); err != nil {
		return err
	}
	if err := harness.preparePressure(ctx, manifest); err != nil {
		return err
	}
	if err := harness.waitForReportedCold(ctx, manifest); err != nil {
		return err
	}
	if err := harness.deletePressureAndStartSoak(ctx, manifest); err != nil {
		return err
	}
	for _, cohort := range manifest.Cohorts {
		fmt.Printf("cohort %s name=%s due=%s\n", cohort.Label, cohort.Name, cohort.DueAt.Format(time.RFC3339))
	}
	fmt.Printf("cold-soak state=%s\n", harness.store.directory)
	return nil
}

func (harness *coldSoakHarness) initializePreparation(
	ctx context.Context,
) (*coldSoakManifest, error) {
	if err := harness.store.requireEmpty(); err != nil {
		return nil, err
	}
	snapshot, err := harness.organizationSnapshot(ctx)
	if err != nil {
		return nil, fmt.Errorf("inspect initial organization: %w", err)
	}
	expectedOrganization := os.Getenv("SETTA_SPRITES_EXPECTED_ORG")
	if expectedOrganization != "setta-100" || snapshot.capacity.Organization != expectedOrganization {
		return nil, fmt.Errorf("refusing organization %q; expected the dedicated setta-100 organization", snapshot.capacity.Organization)
	}
	if snapshot.capacity.Running != 0 || snapshot.capacity.Warm != 0 || snapshot.capacity.Cold != 0 || len(snapshot.runtimes) != 0 {
		return nil, fmt.Errorf("refusing non-empty Sprites organization: %#v", snapshot.capacity)
	}
	if snapshot.capacity.WarmLimit < 1 || snapshot.capacity.WarmLimit > coldSoakMaximumWarmLimit {
		return nil, fmt.Errorf("unsupported organization warm limit: %#v", snapshot.capacity)
	}
	versions := coldSoakVersions{
		ProviderAPI: "v1",
		SDK:         os.Getenv("SETTA_SPRITES_SDK_VERSION"),
		CLI:         os.Getenv("SETTA_SPRITES_CLI_VERSION"),
	}
	if versions.CLI == "" || versions.SDK == "" {
		return nil, errors.New("SETTA_SPRITES_CLI_VERSION and SETTA_SPRITES_SDK_VERSION are required for prepare")
	}
	manifest, err := newColdSoakManifest(
		os.Getenv("SETTA_SPRITES_COLD_SOAK_RUN_ID"),
		harness.now(),
		versions,
		snapshot.capacity,
	)
	if err != nil {
		return nil, err
	}
	if err := harness.store.save(manifest); err != nil {
		return nil, err
	}
	if err := harness.appendSnapshot(snapshot, "initial organization is empty"); err != nil {
		return nil, err
	}
	return manifest, nil
}

func (harness *coldSoakHarness) prepareTargets(ctx context.Context, manifest *coldSoakManifest) error {
	for index := range manifest.Cohorts {
		cohort := &manifest.Cohorts[index]
		identity := runtimeprovider.ManagedIdentity{Name: cohort.Name, Labels: slices.Clone(cohort.Labels)}
		observation, err := harness.createWithBackoff(ctx, identity)
		if err != nil {
			return fmt.Errorf("create %s cohort: %w", cohort.Label, err)
		}
		cohort.ProviderResourceID = observation.ProviderResourceID
		cohort.CreatedAt = observation.CreatedAt
		if err := harness.store.save(manifest); err != nil {
			return err
		}
		if err := harness.configureTarget(ctx, cohort, manifest); err != nil {
			return fmt.Errorf("configure %s cohort: %w", cohort.Label, err)
		}
		if index == 0 {
			if err := harness.recordServerVersion(ctx, cohort.Name, manifest); err != nil {
				return err
			}
		}
	}
	return nil
}

func (harness *coldSoakHarness) recordServerVersion(
	ctx context.Context,
	name string,
	manifest *coldSoakManifest,
) error {
	serverVersion, err := harness.adapter.ServerVersion(ctx, name)
	if err != nil {
		return fmt.Errorf("read live server version: %w", err)
	}
	manifest.Versions.LiveServer = serverVersion
	return harness.store.save(manifest)
}

func (harness *coldSoakHarness) recordWarmBaselines(
	ctx context.Context,
	manifest *coldSoakManifest,
) error {
	if err := waitColdSoak(ctx, coldSoakWarmDelay); err != nil {
		return fmt.Errorf("wait for shared warm baseline: %w", err)
	}
	for index := range manifest.Cohorts {
		if err := harness.recordWarmBaseline(ctx, manifest, index); err != nil {
			return err
		}
	}
	return nil
}

func (harness *coldSoakHarness) recordWarmBaseline(
	ctx context.Context,
	manifest *coldSoakManifest,
	index int,
) error {
	cohort := &manifest.Cohorts[index]
	probe, healthy, err := harness.readConsistentProbe(ctx, cohort.Name, 20*time.Second)
	if err != nil {
		return fmt.Errorf("read %s warm baseline: %w", cohort.Label, err)
	}
	if !healthy || probe.SentinelSHA256 != cohort.SentinelSHA256 || probe.StartCount != 1 ||
		probe.CurrentBootID != cohort.InitialProbe.CurrentBootID {
		return fmt.Errorf("%s cohort failed its warm identity baseline", cohort.Label)
	}
	advance := probe.Heartbeat - cohort.InitialProbe.Heartbeat
	if advance < 0 || advance >= coldSoakMaximumWarmAdvance {
		return fmt.Errorf("%s cohort heartbeat advanced %d during warm idle", cohort.Label, advance)
	}
	cohort.WarmBaseline = &probe
	if err := harness.store.appendEvidence(coldSoakEvidence{
		Kind: "warm_baseline", Phase: harness.phase, Cohort: cohort.Label, Name: cohort.Name, Probe: &probe,
	}); err != nil {
		return err
	}
	return harness.store.save(manifest)
}

func (harness *coldSoakHarness) preparePressure(ctx context.Context, manifest *coldSoakManifest) error {
	for index := range manifest.Pressure {
		if err := harness.preparePressureSprite(ctx, manifest, index); err != nil {
			return err
		}
	}
	if err := waitColdSoak(ctx, coldSoakWarmDelay); err != nil {
		return fmt.Errorf("wait for pressure Sprites to idle: %w", err)
	}
	return nil
}

func (harness *coldSoakHarness) preparePressureSprite(
	ctx context.Context,
	manifest *coldSoakManifest,
	index int,
) error {
	pressure := &manifest.Pressure[index]
	identity := runtimeprovider.ManagedIdentity{Name: pressure.Name, Labels: slices.Clone(pressure.Labels)}
	observation, err := harness.createWithBackoff(ctx, identity)
	if err != nil {
		return fmt.Errorf("create pressure Sprite %d: %w", index, err)
	}
	pressure.ProviderResourceID = observation.ProviderResourceID
	pressure.CreatedAt = observation.CreatedAt
	if err := harness.store.save(manifest); err != nil {
		return err
	}
	service, err := harness.adapter.EnsureService(ctx, pressure.Name, runtimeprovider.ServiceSpec{
		Name: coldSoakPressureServiceName, Path: "/bin/sleep", Arguments: []string{"3600"},
	})
	if err != nil {
		return fmt.Errorf("initialize pressure Sprite %d: %w", index, err)
	}
	if service.State != runtimeprovider.ServiceStateRunning {
		return fmt.Errorf("pressure Sprite %d Service is %q", index, service.State)
	}
	return nil
}

func (harness *coldSoakHarness) waitForReportedCold(
	ctx context.Context,
	manifest *coldSoakManifest,
) error {
	deadline := harness.now().Add(coldSoakPreparationTimeout)
	for {
		snapshot, err := harness.organizationSnapshot(ctx)
		if err != nil {
			return fmt.Errorf("observe pressure eviction: %w", err)
		}
		if err := harness.appendSnapshot(snapshot, "poll pressure eviction"); err != nil {
			return err
		}
		allCold, err := harness.recordColdStatuses(manifest, snapshot)
		if err != nil {
			return err
		}
		if err := harness.store.save(manifest); err != nil {
			return err
		}
		if allCold {
			return nil
		}
		if !harness.now().Before(deadline) {
			return errors.New("all target Sprites did not report cold before the preparation timeout")
		}
		if err := waitColdSoak(ctx, 5*time.Second); err != nil {
			return err
		}
	}
}

func (harness *coldSoakHarness) recordColdStatuses(
	manifest *coldSoakManifest,
	snapshot coldSoakOrgSnapshot,
) (bool, error) {
	allCold := true
	for index := range manifest.Cohorts {
		cohort := &manifest.Cohorts[index]
		observation, found := snapshot.runtimes[cohort.Name]
		if !found {
			return false, fmt.Errorf("%s cohort disappeared during pressure", cohort.Label)
		}
		identity := runtimeprovider.ManagedIdentity{Name: cohort.Name, Labels: cohort.Labels}
		if err := requireLabels(identity, observation.Labels); err != nil {
			return false, err
		}
		if observation.Activity != runtimeprovider.RuntimeActivityCold {
			allCold = false
			continue
		}
		if cohort.FirstColdAt.IsZero() {
			cohort.FirstColdAt = harness.now().UTC()
		}
	}
	return allCold, nil
}

func (harness *coldSoakHarness) deletePressureAndStartSoak(
	ctx context.Context,
	manifest *coldSoakManifest,
) error {
	for index := range manifest.Pressure {
		if err := harness.destroyPressure(ctx, manifest, index); err != nil {
			return err
		}
	}
	snapshot, err := harness.organizationSnapshot(ctx)
	if err != nil {
		return fmt.Errorf("confirm cold targets after pressure cleanup: %w", err)
	}
	if err := requireOnlyColdTargets(manifest, snapshot); err != nil {
		return err
	}
	if err := harness.appendSnapshot(snapshot, "pressure absent and every target remains reported cold"); err != nil {
		return err
	}
	manifest.ColdEpoch = harness.now().UTC()
	for index := range manifest.Cohorts {
		manifest.Cohorts[index].DueAt = manifest.ColdEpoch.Add(
			time.Duration(manifest.Cohorts[index].DurationHours) * time.Hour,
		)
	}
	if err := harness.store.appendEvidence(coldSoakEvidence{
		Kind: "soak_started", Phase: harness.phase, Note: "common reported-cold epoch recorded after pressure deletion",
	}); err != nil {
		return err
	}
	return harness.store.save(manifest)
}

func requireOnlyColdTargets(manifest *coldSoakManifest, snapshot coldSoakOrgSnapshot) error {
	if len(snapshot.runtimes) != len(manifest.Cohorts) {
		return fmt.Errorf("organization contains %d Sprites after pressure cleanup, want %d", len(snapshot.runtimes), len(manifest.Cohorts))
	}
	for _, cohort := range manifest.Cohorts {
		observation, found := snapshot.runtimes[cohort.Name]
		if !found || observation.Activity != runtimeprovider.RuntimeActivityCold {
			return fmt.Errorf("%s cohort did not remain reported cold after pressure cleanup", cohort.Label)
		}
	}
	return nil
}

func (harness *coldSoakHarness) configureTarget(
	ctx context.Context,
	cohort *coldSoakCohort,
	manifest *coldSoakManifest,
) error {
	if err := harness.adapter.ConfigureURL(ctx, cohort.Name, runtimeprovider.URLAccessAuthenticated); err != nil {
		return err
	}
	policy := runtimeprovider.NetworkPolicy{Rules: []runtimeprovider.NetworkRule{
		{Domain: "example.com", Action: runtimeprovider.NetworkRuleAllow},
		{Domain: "*", Action: runtimeprovider.NetworkRuleDeny},
	}}
	if err := harness.adapter.ApplyNetworkPolicy(ctx, cohort.Name, policy); err != nil {
		return err
	}
	if _, err := harness.exec(ctx, runtimeprovider.ExecRequest{
		RuntimeName: cohort.Name, Path: "/usr/bin/mkdir", Arguments: []string{"-p", coldSoakRemoteRoot},
	}); err != nil {
		return err
	}
	sentinel := make([]byte, 32)
	if _, err := rand.Read(sentinel); err != nil {
		return fmt.Errorf("create persistence sentinel: %w", err)
	}
	digest := sha256.Sum256(sentinel)
	cohort.SentinelSHA256 = hex.EncodeToString(digest[:])
	if _, err := harness.exec(ctx, runtimeprovider.ExecRequest{
		RuntimeName: cohort.Name, Path: "/usr/bin/dd",
		Arguments: []string{"of=" + coldSoakRemoteSentinel, "status=none"}, Stdin: sentinel,
	}); err != nil {
		return err
	}
	if _, err := harness.exec(ctx, runtimeprovider.ExecRequest{
		RuntimeName: cohort.Name, Path: "/usr/bin/chmod", Arguments: []string{"0444", coldSoakRemoteSentinel},
	}); err != nil {
		return err
	}
	probeSource, err := os.ReadFile(filepath.Join("testdata", "cold_soak_service_probe.py"))
	if err != nil {
		return fmt.Errorf("read Service probe fixture: %w", err)
	}
	if _, err := harness.exec(ctx, runtimeprovider.ExecRequest{
		RuntimeName: cohort.Name, Path: "/usr/bin/dd",
		Arguments: []string{"of=" + coldSoakRemoteServiceProbe, "status=none"}, Stdin: probeSource,
	}); err != nil {
		return err
	}
	service, err := harness.adapter.EnsureService(ctx, cohort.Name, runtimeprovider.ServiceSpec{
		Name: coldSoakServiceName, Path: "/usr/bin/python3", Arguments: []string{coldSoakRemoteServiceProbe},
	})
	if err != nil {
		return err
	}
	if service.State != runtimeprovider.ServiceStateRunning {
		return fmt.Errorf("Service state is %q", service.State)
	}
	probe, healthy, err := harness.readProbeAtLeast(
		ctx,
		cohort.Name,
		coldSoakMinimumHeartbeat,
		20*time.Second,
	)
	if err != nil {
		return err
	}
	if !healthy || probe.StartCount != 1 || probe.SentinelSHA256 != cohort.SentinelSHA256 {
		return fmt.Errorf("invalid initial Service probe: %#v", probe)
	}
	cohort.InitialProbe = &probe
	if err := harness.store.appendEvidence(coldSoakEvidence{
		Kind: "initial_probe", Phase: harness.phase, Cohort: cohort.Label, Name: cohort.Name, Probe: &probe,
	}); err != nil {
		return err
	}
	return harness.store.save(manifest)
}

func (harness *coldSoakHarness) observe(ctx context.Context) error {
	manifest, err := harness.store.load()
	if err != nil {
		return err
	}
	if manifest.ColdEpoch.IsZero() {
		return errors.New("cold-soak preparation did not reach a reported-cold epoch")
	}
	snapshot, err := harness.organizationSnapshot(ctx)
	if err != nil {
		return err
	}
	if snapshot.capacity.Organization != manifest.InitialCapacity.Organization {
		return errors.New("cold-soak organization changed")
	}
	if err := harness.validateOwnedSnapshot(manifest, snapshot); err != nil {
		return err
	}
	return harness.appendSnapshot(snapshot, "non-waking management-plane observation")
}

func (harness *coldSoakHarness) verifyDue(ctx context.Context) error {
	manifest, err := harness.store.load()
	if err != nil {
		return err
	}
	if manifest.ColdEpoch.IsZero() {
		return errors.New("cold-soak preparation did not reach a reported-cold epoch")
	}
	verified := 0
	for index := range manifest.Cohorts {
		cohortVerified, err := harness.verifyDueCohort(ctx, manifest, index)
		if err != nil {
			return err
		}
		if cohortVerified {
			verified++
		}
	}
	if verified == 0 {
		fmt.Println("no unverified cold-soak cohort is due")
	}
	return nil
}

func (harness *coldSoakHarness) verifyDueCohort(
	ctx context.Context,
	manifest *coldSoakManifest,
	index int,
) (bool, error) {
	cohort := &manifest.Cohorts[index]
	if cohort.Classification != "" {
		if cohort.DeletedAt.IsZero() {
			return false, harness.destroyCohort(ctx, manifest, index)
		}
		return false, nil
	}
	if harness.now().Before(cohort.DueAt) {
		return false, nil
	}
	if !cohort.WakeStartedAt.IsZero() {
		if err := harness.recordClassification(
			manifest, cohort, coldSoakInconclusive,
			"a previous verification woke the cohort without durably recording a result",
			nil,
		); err != nil {
			return false, err
		}
		return true, harness.destroyCohort(ctx, manifest, index)
	}
	found, err := harness.recordPreWakeObservation(ctx, manifest, cohort)
	if err != nil {
		return false, err
	}
	if !found {
		return true, harness.recordClassification(
			manifest,
			cohort,
			coldSoakInconclusive,
			"provider resource disappeared before verification",
			nil,
		)
	}
	cohort.WakeStartedAt = harness.now().UTC()
	if err := harness.store.save(manifest); err != nil {
		return false, err
	}
	if err := harness.verifyWokenCohort(ctx, manifest, cohort); err != nil {
		return false, err
	}
	return true, harness.destroyCohort(ctx, manifest, index)
}

func (harness *coldSoakHarness) recordPreWakeObservation(
	ctx context.Context,
	manifest *coldSoakManifest,
	cohort *coldSoakCohort,
) (bool, error) {
	snapshot, err := harness.organizationSnapshot(ctx)
	if err != nil {
		return false, fmt.Errorf("pre-wake %s observation: %w", cohort.Label, err)
	}
	if err := harness.appendSnapshot(snapshot, "final pre-wake management-plane observation for "+cohort.Label); err != nil {
		return false, err
	}
	if err := harness.rejectUnknownSnapshot(manifest, snapshot); err != nil {
		return false, err
	}
	observation, found := snapshot.runtimes[cohort.Name]
	if !found {
		return false, nil
	}
	identity := runtimeprovider.ManagedIdentity{Name: cohort.Name, Labels: cohort.Labels}
	if err := requireLabels(identity, observation.Labels); err != nil {
		return false, err
	}
	return true, nil
}

func (harness *coldSoakHarness) verifyWokenCohort(
	ctx context.Context,
	manifest *coldSoakManifest,
	cohort *coldSoakCohort,
) error {
	wakeCtx, cancel := context.WithTimeout(ctx, coldSoakRequestTimeout)
	result, err := harness.exec(wakeCtx, runtimeprovider.ExecRequest{
		RuntimeName: cohort.Name, Path: "/usr/bin/sha256sum", Arguments: []string{coldSoakRemoteSentinel},
	})
	cancel()
	if err != nil {
		return harness.recordClassification(manifest, cohort, coldSoakProviderFail, "Sprite did not wake for the persistence check: "+err.Error(), nil)
	}
	digestFields := strings.Fields(string(result.Stdout))
	if len(digestFields) != 2 || digestFields[0] != cohort.SentinelSHA256 {
		return harness.recordClassification(manifest, cohort, coldSoakProviderFail, "persistence sentinel is missing or changed", nil)
	}

	deadline := harness.now().Add(coldSoakRestartTimeout)
	var lastNote string
	for harness.now().Before(deadline) {
		probe, healthy, probeErr := harness.readProbeOnce(ctx, cohort.Name)
		if probeErr == nil {
			classification, note, decided := classifyColdSoakProbe(
				*cohort.InitialProbe,
				*cohort.WarmBaseline,
				probe,
				healthy,
			)
			lastNote = note
			if decided {
				return harness.recordClassification(manifest, cohort, classification, note, &probe)
			}
		} else {
			lastNote = probeErr.Error()
		}
		if err := waitColdSoak(ctx, 250*time.Millisecond); err != nil {
			break
		}
	}
	return harness.recordClassification(
		manifest,
		cohort,
		coldSoakProviderFail,
		"Service did not recover consistently within 60 seconds: "+lastNote,
		nil,
	)
}

func (harness *coldSoakHarness) cleanup(ctx context.Context, repositoryRoot string) error {
	manifest, err := harness.store.load()
	if err != nil {
		return err
	}
	if err := harness.cleanupOwned(ctx, manifest); err != nil {
		return err
	}
	snapshot, err := harness.organizationSnapshot(ctx)
	if err != nil {
		return fmt.Errorf("confirm empty organization: %w", err)
	}
	if snapshot.capacity.Running != 0 || snapshot.capacity.Warm != 0 || snapshot.capacity.Cold != 0 || len(snapshot.runtimes) != 0 {
		return fmt.Errorf("organization is not empty after cleanup: %#v", snapshot.capacity)
	}
	manifest.EmptyConfirmed = harness.now().UTC()
	if err := harness.appendSnapshot(snapshot, "organization confirmed empty after cleanup"); err != nil {
		return err
	}
	if coldSoakAllClassified(manifest) && manifest.ReportPath == "" {
		reportPath, err := writeColdSoakReport(repositoryRoot, manifest)
		if err != nil {
			return err
		}
		if err := appendColdSoakProgress(repositoryRoot, manifest, reportPath); err != nil {
			return err
		}
		manifest.ReportPath = reportPath
	}
	return harness.store.save(manifest)
}

func (harness *coldSoakHarness) cleanupOwned(ctx context.Context, manifest *coldSoakManifest) error {
	manifest.CleanupAttempts = append(manifest.CleanupAttempts, harness.now().UTC())
	if err := harness.store.save(manifest); err != nil {
		return err
	}
	for index := range manifest.Pressure {
		if err := harness.destroyPressure(ctx, manifest, index); err != nil {
			return err
		}
	}
	for index := range manifest.Cohorts {
		if err := harness.destroyCohort(ctx, manifest, index); err != nil {
			return err
		}
	}
	return nil
}

func (harness *coldSoakHarness) destroyPressure(
	ctx context.Context,
	manifest *coldSoakManifest,
	index int,
) error {
	pressure := &manifest.Pressure[index]
	if !pressure.DeletedAt.IsZero() {
		return nil
	}
	pressure.DeletionAttemptAt = harness.now().UTC()
	if err := harness.store.save(manifest); err != nil {
		return err
	}
	if err := harness.destroyOwned(ctx, pressure.Name, pressure.Labels); err != nil {
		return fmt.Errorf("destroy pressure Sprite %d: %w", index, err)
	}
	pressure.DeletedAt = harness.now().UTC()
	if err := harness.store.appendEvidence(coldSoakEvidence{
		Kind: "pressure_deleted", Phase: harness.phase, Name: pressure.Name,
	}); err != nil {
		return err
	}
	return harness.store.save(manifest)
}

func (harness *coldSoakHarness) destroyCohort(
	ctx context.Context,
	manifest *coldSoakManifest,
	index int,
) error {
	cohort := &manifest.Cohorts[index]
	if !cohort.DeletedAt.IsZero() {
		return nil
	}
	if err := harness.destroyOwned(ctx, cohort.Name, cohort.Labels); err != nil {
		return fmt.Errorf("destroy %s cohort: %w", cohort.Label, err)
	}
	cohort.DeletedAt = harness.now().UTC()
	if err := harness.store.appendEvidence(coldSoakEvidence{
		Kind: "cohort_deleted", Phase: harness.phase, Cohort: cohort.Label, Name: cohort.Name,
	}); err != nil {
		return err
	}
	return harness.store.save(manifest)
}

func (harness *coldSoakHarness) destroyOwned(ctx context.Context, name string, labels []string) error {
	observation, found, err := harness.adapter.Inspect(ctx, name)
	if err != nil {
		return err
	}
	if !found {
		return nil
	}
	identity := runtimeprovider.ManagedIdentity{Name: name, Labels: labels}
	if err := requireLabels(identity, observation.Labels); err != nil {
		return err
	}
	if err := harness.adapter.Destroy(ctx, name); err != nil {
		return err
	}
	_, found, err = harness.adapter.Inspect(ctx, name)
	if err != nil {
		return err
	}
	if found {
		return fmt.Errorf("Sprite %s still exists after deletion", name)
	}
	return nil
}

func (harness *coldSoakHarness) recordClassification(
	manifest *coldSoakManifest,
	cohort *coldSoakCohort,
	classification coldSoakClassification,
	note string,
	probe *coldSoakProbe,
) error {
	cohort.Classification = classification
	cohort.ClassificationNote = note
	cohort.PostWakeProbe = probe
	if err := harness.store.appendEvidence(coldSoakEvidence{
		Kind: "classification", Phase: harness.phase, Cohort: cohort.Label, Name: cohort.Name,
		Probe: probe, Classification: classification, Note: note,
	}); err != nil {
		return err
	}
	if err := harness.store.save(manifest); err != nil {
		return err
	}
	fmt.Printf("cohort %s classification=%s note=%s\n", cohort.Label, classification, note)
	return nil
}

func (harness *coldSoakHarness) organizationSnapshot(ctx context.Context) (coldSoakOrgSnapshot, error) {
	snapshot, err := harness.adapter.client.OrganizationSnapshot(ctx)
	if err != nil {
		return coldSoakOrgSnapshot{}, err
	}
	result := coldSoakOrgSnapshot{
		capacity: coldSoakCapacity{
			Organization: snapshot.Info.Name,
			Running:      snapshot.Info.Running, Warm: snapshot.Info.Warm, Cold: snapshot.Info.Cold,
			RunningLimit: snapshot.Info.RunningLimit, WarmLimit: snapshot.Info.WarmLimit,
		},
		runtimes: make(map[string]runtimeprovider.RuntimeObservation, len(snapshot.Runtimes)),
	}
	if snapshot.Info.Running+snapshot.Info.Warm+snapshot.Info.Cold != len(snapshot.Runtimes) {
		return coldSoakOrgSnapshot{}, fmt.Errorf(
			"%w: organization counters total %d but listing contains %d Sprites",
			ErrUnexpectedProviderValue,
			snapshot.Info.Running+snapshot.Info.Warm+snapshot.Info.Cold,
			len(snapshot.Runtimes),
		)
	}
	for index := range snapshot.Runtimes {
		runtime := &snapshot.Runtimes[index]
		activity, err := mapRuntimeActivity(runtime.Status)
		if err != nil {
			return coldSoakOrgSnapshot{}, err
		}
		result.runtimes[runtime.Name] = runtimeprovider.RuntimeObservation{
			ProviderResourceID: runtime.ID,
			Name:               runtime.Name, Labels: slices.Clone(runtime.Labels), Activity: activity,
			CreatedAt: runtime.CreatedAt, UpdatedAt: runtime.UpdatedAt,
		}
	}
	return result, nil
}

func (harness *coldSoakHarness) appendSnapshot(snapshot coldSoakOrgSnapshot, note string) error {
	capacity := snapshot.capacity
	if err := harness.store.appendEvidence(coldSoakEvidence{
		Kind: "organization_observation", Phase: harness.phase, Capacity: &capacity, Note: note,
	}); err != nil {
		return err
	}
	names := make([]string, 0, len(snapshot.runtimes))
	for name := range snapshot.runtimes {
		names = append(names, name)
	}
	slices.Sort(names)
	for _, name := range names {
		observation := snapshot.runtimes[name]
		if err := harness.store.appendEvidence(coldSoakEvidence{
			Kind: "runtime_observation", Phase: harness.phase, Name: name,
			Activity: string(observation.Activity), ProviderTime: observation.UpdatedAt, Capacity: &capacity,
		}); err != nil {
			return err
		}
	}
	return nil
}

func (harness *coldSoakHarness) validateOwnedSnapshot(
	manifest *coldSoakManifest,
	snapshot coldSoakOrgSnapshot,
) error {
	if err := harness.rejectUnknownSnapshot(manifest, snapshot); err != nil {
		return err
	}
	for _, pressure := range manifest.Pressure {
		if _, found := snapshot.runtimes[pressure.Name]; found {
			return fmt.Errorf("pressure Sprite %s still exists during soak", pressure.Name)
		}
	}
	for _, cohort := range manifest.Cohorts {
		observation, found := snapshot.runtimes[cohort.Name]
		if !cohort.DeletedAt.IsZero() {
			if found {
				return fmt.Errorf("deleted cohort %s still exists", cohort.Label)
			}
			continue
		}
		if !found {
			return fmt.Errorf("unverified cohort %s is absent", cohort.Label)
		}
		if err := requireLabels(runtimeprovider.ManagedIdentity{Name: cohort.Name, Labels: cohort.Labels}, observation.Labels); err != nil {
			return err
		}
	}
	return nil
}

func (harness *coldSoakHarness) rejectUnknownSnapshot(
	manifest *coldSoakManifest,
	snapshot coldSoakOrgSnapshot,
) error {
	ownedNames := make(map[string]struct{}, len(manifest.Cohorts)+len(manifest.Pressure))
	for _, cohort := range manifest.Cohorts {
		ownedNames[cohort.Name] = struct{}{}
	}
	for _, pressure := range manifest.Pressure {
		ownedNames[pressure.Name] = struct{}{}
	}
	for name := range snapshot.runtimes {
		if _, owned := ownedNames[name]; !owned {
			return fmt.Errorf("foreign Sprite %s appeared in the dedicated cold-soak organization", name)
		}
	}
	return nil
}

func (harness *coldSoakHarness) createWithBackoff(
	ctx context.Context,
	identity runtimeprovider.ManagedIdentity,
) (runtimeprovider.RuntimeObservation, error) {
	for {
		observation, err := harness.adapter.Create(ctx, runtimeprovider.CreateRequest{
			Identity: identity, Resources: testRuntimeResources(),
		})
		if err == nil {
			return observation, nil
		}
		var operationErr *OperationError
		if !errors.As(err, &operationErr) || operationErr.StatusCode != http.StatusTooManyRequests || operationErr.RetryAfter < 1 {
			return runtimeprovider.RuntimeObservation{}, err
		}
		if err := waitColdSoak(ctx, time.Duration(operationErr.RetryAfter)*time.Second); err != nil {
			return runtimeprovider.RuntimeObservation{}, err
		}
	}
}

func (harness *coldSoakHarness) exec(
	ctx context.Context,
	request runtimeprovider.ExecRequest,
) (runtimeprovider.ExecResult, error) {
	result, err := harness.adapter.Exec(ctx, request)
	if err != nil {
		return result, err
	}
	if result.ExitCode != 0 {
		return result, fmt.Errorf("exec %s exited %d: %s", request.Path, result.ExitCode, strings.TrimSpace(string(result.Stderr)))
	}
	return result, nil
}

func (harness *coldSoakHarness) readConsistentProbe(
	ctx context.Context,
	name string,
	timeout time.Duration,
) (coldSoakProbe, bool, error) {
	return harness.readProbeAtLeast(ctx, name, 0, timeout)
}

func (harness *coldSoakHarness) readProbeAtLeast(
	ctx context.Context,
	name string,
	minimumHeartbeat int,
	timeout time.Duration,
) (coldSoakProbe, bool, error) {
	deadline := harness.now().Add(timeout)
	var lastErr error
	for harness.now().Before(deadline) {
		probe, healthy, err := harness.readProbeOnce(ctx, name)
		if err == nil && probe.Heartbeat >= minimumHeartbeat {
			return probe, healthy, nil
		}
		if err != nil {
			lastErr = err
		} else {
			lastErr = fmt.Errorf("heartbeat %d is below %d", probe.Heartbeat, minimumHeartbeat)
		}
		if err := waitColdSoak(ctx, 250*time.Millisecond); err != nil {
			return coldSoakProbe{}, false, err
		}
	}
	return coldSoakProbe{}, false, fmt.Errorf("probe did not become consistent: %w", lastErr)
}

func (harness *coldSoakHarness) readProbeOnce(
	ctx context.Context,
	name string,
) (coldSoakProbe, bool, error) {
	requestCtx, cancel := context.WithTimeout(ctx, coldSoakRequestTimeout)
	defer cancel()
	result, err := harness.exec(requestCtx, runtimeprovider.ExecRequest{
		RuntimeName: name,
		Path:        "/usr/bin/python3",
		Arguments:   []string{coldSoakRemoteServiceProbe, "--read"},
	})
	if err != nil {
		return coldSoakProbe{}, false, err
	}
	var probe coldSoakProbe
	decoder := json.NewDecoder(strings.NewReader(string(result.Stdout)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&probe); err != nil {
		return coldSoakProbe{}, false, fmt.Errorf("decode Service probe: %w", err)
	}
	if err := validateColdSoakProbe(probe); err != nil {
		return coldSoakProbe{}, false, err
	}
	service, found, err := harness.adapter.InspectService(requestCtx, name, coldSoakServiceName)
	if err != nil {
		return coldSoakProbe{}, false, err
	}
	return probe, found && service.State == runtimeprovider.ServiceStateRunning, nil
}

func waitColdSoak(ctx context.Context, duration time.Duration) error {
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return context.Cause(ctx)
	case <-timer.C:
		return nil
	}
}

func coldSoakAllClassified(manifest *coldSoakManifest) bool {
	for _, cohort := range manifest.Cohorts {
		if cohort.Classification == "" {
			return false
		}
	}
	return true
}

func writeColdSoakReport(repositoryRoot string, manifest *coldSoakManifest) (string, error) {
	safeRunID := strings.Map(func(character rune) rune {
		if character >= 'a' && character <= 'z' || character >= 'A' && character <= 'Z' ||
			character >= '0' && character <= '9' || character == '-' {
			return character
		}
		return '-'
	}, manifest.RunID)
	relativePath := filepath.Join(
		"docs",
		"reports",
		manifest.CreatedAt.Format("2006-01-02")+"-sprites-confirmed-cold-soak-"+safeRunID+".md",
	)
	path := filepath.Join(repositoryRoot, relativePath)
	if _, err := os.Stat(path); err == nil {
		return relativePath, nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", err
	}
	var report strings.Builder
	fmt.Fprintf(&report, "# Sprites Confirmed-Cold Soak Report\n\n")
	fmt.Fprintf(&report, "Run ID: `%s`  \n", manifest.RunID)
	fmt.Fprintf(&report, "Cold epoch: %s  \n", manifest.ColdEpoch.Format(time.RFC3339))
	fmt.Fprintf(&report, "Organization empty after cleanup: %s\n\n", manifest.EmptyConfirmed.Format(time.RFC3339))
	fmt.Fprintf(&report, "| Cohort | Sprite | Due | Result | Evidence |\n")
	fmt.Fprintf(&report, "| --- | --- | --- | --- | --- |\n")
	for _, cohort := range manifest.Cohorts {
		fmt.Fprintf(
			&report,
			"| %s | `%s` | %s | `%s` | %s |\n",
			cohort.Label,
			cohort.Name,
			cohort.DueAt.Format(time.RFC3339),
			cohort.Classification,
			strings.ReplaceAll(cohort.ClassificationNote, "|", "\\|"),
		)
	}
	fmt.Fprintf(&report, "\nProvider API: `%s`; SDK: `%s`; CLI: `%s`; live server: `%s`.\n", manifest.Versions.ProviderAPI, manifest.Versions.SDK, manifest.Versions.CLI, manifest.Versions.LiveServer)
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	if err != nil {
		return "", fmt.Errorf("create sanitized cold-soak report: %w", err)
	}
	if _, err := file.WriteString(report.String()); err != nil {
		file.Close()
		return "", err
	}
	if err := file.Sync(); err != nil {
		file.Close()
		return "", err
	}
	if err := file.Close(); err != nil {
		return "", err
	}
	return relativePath, nil
}

func appendColdSoakProgress(
	repositoryRoot string,
	manifest *coldSoakManifest,
	reportPath string,
) error {
	planPath := filepath.Join(repositoryRoot, "docs", "plans", "setta-cloud-platform-sprites-plan.md")
	contents, err := os.ReadFile(planPath)
	if err != nil {
		return fmt.Errorf("read Sprites progress log: %w", err)
	}
	marker := "cold-soak run `" + manifest.RunID + "`"
	if strings.Contains(string(contents), marker) {
		return nil
	}
	results := make([]string, 0, len(manifest.Cohorts))
	for _, cohort := range manifest.Cohorts {
		results = append(results, cohort.Label+"="+string(cohort.Classification))
	}
	entry := fmt.Sprintf(
		"\n- %s: Completed %s (%s); the dedicated organization was confirmed empty after cleanup. See `%s`.\n",
		manifest.EmptyConfirmed.Format("2006-01-02"),
		marker,
		strings.Join(results, ", "),
		reportPath,
	)
	file, err := os.OpenFile(planPath, os.O_APPEND|os.O_WRONLY, 0)
	if err != nil {
		return fmt.Errorf("open Sprites progress log: %w", err)
	}
	defer file.Close()
	if _, err := file.WriteString(entry); err != nil {
		return fmt.Errorf("append Sprites progress log: %w", err)
	}
	if err := file.Sync(); err != nil {
		return fmt.Errorf("sync Sprites progress log: %w", err)
	}
	return nil
}
