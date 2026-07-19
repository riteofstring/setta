package hostedmeasurement

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

var testAuthorizedAt = time.Date(2026, 7, 20, 1, 0, 0, 0, time.UTC)

func testImageReference() string {
	return "registry.fly.io/setta-gateway-night@sha256:" + strings.Repeat("a", 64)
}

func TestLoadManifestValidatesStrictAuthorizationAndCleanupExpiryException(t *testing.T) {
	directory, path := writeTestManifest(t, validManifest(), nil)
	authorization, err := LoadManifest(path, testAuthorizedAt.Add(10*time.Minute), ValidateForStart)
	if err != nil {
		t.Fatalf("LoadManifest start: %v", err)
	}
	if authorization.MaximumSpendCents != 500 || len(authorization.ManifestDigest) != 64 {
		t.Fatalf("authorization = %+v", authorization)
	}
	if _, err := LoadManifest(path, testAuthorizedAt.Add(3*time.Hour), ValidateForStart); err == nil {
		t.Fatal("LoadManifest accepted an expired start authorization")
	}
	if _, err := LoadManifest(path, testAuthorizedAt.Add(3*time.Hour), ValidateForCleanup); err != nil {
		t.Fatalf("cleanup validation rejected expired authorization: %v", err)
	}
	if err := os.Chmod(directory, 0o755); err != nil {
		t.Fatalf("expose manifest directory: %v", err)
	}
	if _, err := LoadManifest(path, testAuthorizedAt.Add(10*time.Minute), ValidateForStart); err == nil {
		t.Fatal("LoadManifest accepted a group/other accessible state directory")
	}
}

func TestLoadManifestRejectsUnknownDuplicateAndUnsafeBoundaries(t *testing.T) {
	t.Run("unknown field", func(t *testing.T) {
		manifest := validManifest()
		directory := newPrivateDirectory(t)
		data, err := json.Marshal(manifest)
		if err != nil {
			t.Fatal(err)
		}
		data = append(data[:len(data)-1], []byte(`,"surprise":true}`)...)
		path := writePrivateFile(t, directory, "manifest.json", data)
		if _, err := LoadManifest(path, testAuthorizedAt.Add(time.Minute), ValidateForStart); err == nil {
			t.Fatal("LoadManifest accepted an unknown field")
		}
	})
	t.Run("duplicate field", func(t *testing.T) {
		manifest := validManifest()
		directory := newPrivateDirectory(t)
		data, err := json.Marshal(manifest)
		if err != nil {
			t.Fatal(err)
		}
		data = append(data[:len(data)-1], []byte(`,"run_id":"second"}`)...)
		path := writePrivateFile(t, directory, "manifest.json", data)
		if _, err := LoadManifest(path, testAuthorizedAt.Add(time.Minute), ValidateForStart); err == nil || !strings.Contains(err.Error(), "duplicate") {
			t.Fatalf("duplicate field error = %v", err)
		}
	})
	t.Run("symlink manifest", func(t *testing.T) {
		directory, path := writeTestManifest(t, validManifest(), nil)
		linked := filepath.Join(directory, "linked.json")
		if err := os.Symlink(path, linked); err != nil {
			t.Fatalf("create manifest symlink: %v", err)
		}
		if _, err := LoadManifest(linked, testAuthorizedAt.Add(time.Minute), ValidateForStart); err == nil {
			t.Fatal("LoadManifest followed a manifest symlink")
		}
	})
}

func TestLoadManifestRejectsExpandedWorkloadDurationAndReserve(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*Manifest)
		now    time.Time
	}{
		{
			name: "expanded workload",
			mutate: func(manifest *Manifest) {
				manifest.AuthorizedWorkload = append(manifest.AuthorizedWorkload, "phase1c")
			},
			now: testAuthorizedAt.Add(time.Minute),
		},
		{
			name: "over two hours",
			mutate: func(manifest *Manifest) {
				manifest.CleanupDeadline = testAuthorizedAt.Add(2*time.Hour + time.Second).Format(time.RFC3339)
			},
			now: testAuthorizedAt.Add(time.Minute),
		},
		{
			name:   "cleanup reserve",
			mutate: func(*Manifest) {},
			now:    testAuthorizedAt.Add(105 * time.Minute),
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			manifest := validManifest()
			test.mutate(&manifest)
			_, path := writeTestManifest(t, manifest, nil)
			if _, err := LoadManifest(path, test.now, ValidateForStart); err == nil {
				t.Fatal("LoadManifest accepted an invalid authorization")
			}
		})
	}
}

func TestStateStorePersistsRestartAndSurvivesInterruptedAtomicWrite(t *testing.T) {
	authorization, directory := loadTestAuthorization(t)
	store, err := OpenStateStore(directory, authorization, testAuthorizedAt.Add(time.Minute))
	if err != nil {
		t.Fatalf("OpenStateStore: %v", err)
	}
	resource := ResourceState{Kind: ResourceFlyApp, ID: "setta-gateway-night", Name: "setta-gateway-night", ActualRegion: "yyz"}
	if err := store.RecordResource(resource, OperationCreateAccepted, testAuthorizedAt.Add(2*time.Minute)); err != nil {
		t.Fatalf("RecordResource: %v", err)
	}
	restarted, err := OpenStateStore(directory, authorization, testAuthorizedAt.Add(3*time.Minute))
	if err != nil {
		t.Fatalf("restart OpenStateStore: %v", err)
	}
	if got := restarted.Snapshot(); len(got.Resources) != 1 || got.Resources[0] != resource {
		t.Fatalf("restarted state resources = %+v", got.Resources)
	}
	restarted.beforeRename = func(string) error { return errors.New("injected interruption before rename") }
	if err := restarted.SetPhase(PhaseMeasuring, testAuthorizedAt.Add(4*time.Minute)); err == nil {
		t.Fatal("SetPhase succeeded across injected interruption")
	}
	afterInterruption, err := OpenStateStore(directory, authorization, testAuthorizedAt.Add(5*time.Minute))
	if err != nil {
		t.Fatalf("OpenStateStore after interrupted write: %v", err)
	}
	if afterInterruption.Snapshot().Phase != PhaseAuthorized {
		t.Fatalf("phase after interrupted write = %s, want authorized", afterInterruption.Snapshot().Phase)
	}
}

func TestOpenExistingStateStoreNeverCreatesMissingCleanupState(t *testing.T) {
	authorization, directory := loadTestAuthorization(t)
	if _, err := OpenExistingStateStore(directory, authorization); err == nil {
		t.Fatal("OpenExistingStateStore created or accepted missing cleanup state")
	}
	if _, err := os.Stat(filepath.Join(directory, stateFileName)); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("missing cleanup state was mutated: %v", err)
	}
	created, err := OpenStateStore(directory, authorization, testAuthorizedAt.Add(time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	reopened, err := OpenExistingStateStore(directory, authorization)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(reopened.Snapshot(), created.Snapshot()) {
		t.Fatalf("reopened cleanup state = %+v, want %+v", reopened.Snapshot(), created.Snapshot())
	}
}

func TestReadPrivateCredentialFileRequiresSamePrivateDirectoryAndVisibleASCII(t *testing.T) {
	authorization, directory := loadTestAuthorization(t)
	credentialPath := writePrivateFile(t, directory, "credential", []byte("private-token"))
	credential, err := ReadPrivateCredentialFile(credentialPath, authorization)
	if err != nil {
		t.Fatal(err)
	}
	if string(credential) != "private-token" {
		t.Fatalf("credential = %q", credential)
	}
	outside := newPrivateDirectory(t)
	outsidePath := writePrivateFile(t, outside, "credential", []byte("private-token"))
	if _, err := ReadPrivateCredentialFile(outsidePath, authorization); err == nil {
		t.Fatal("ReadPrivateCredentialFile accepted a credential outside the run directory")
	}
	invalidPath := writePrivateFile(t, directory, "invalid-credential", []byte("token\n"))
	if _, err := ReadPrivateCredentialFile(invalidPath, authorization); err == nil {
		t.Fatal("ReadPrivateCredentialFile accepted a multiline credential")
	}
}

func TestProvisionerAdoptsAmbiguousCreateAndResumesAfterFailure(t *testing.T) {
	authorization, directory := loadTestAuthorization(t)
	store, err := OpenStateStore(directory, authorization, testAuthorizedAt.Add(time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	fly := newFakeFly()
	fly.appCreateAmbiguous = true
	fly.machineCreateError = errors.New("injected machine failure")
	now := testAuthorizedAt.Add(2 * time.Minute)
	provisioner := Provisioner{Fly: fly, Preparer: &fakeFlyAppPreparer{}, Now: func() time.Time { return now }, State: store}
	if err := provisioner.ProvisionFly(context.Background(), authorization, testImageReference(), []byte("inner-runtime-sentinel")); err == nil {
		t.Fatal("ProvisionFly succeeded across machine failure")
	}
	assertInterruptedProvisionState(t, store.Snapshot())
	fly.machineCreateError = nil
	restarted, err := OpenStateStore(directory, authorization, now)
	if err != nil {
		t.Fatal(err)
	}
	provisioner.State = restarted
	if err := provisioner.ProvisionFly(context.Background(), authorization, testImageReference(), []byte("inner-runtime-sentinel")); err != nil {
		t.Fatalf("restart ProvisionFly: %v", err)
	}
	assertRestartedProvision(t, restarted.Snapshot(), fly)
}

func TestProvisionerRejectsMissingInnerCredentialBeforeFlyMutations(t *testing.T) {
	authorization, directory := loadTestAuthorization(t)
	store, err := OpenStateStore(directory, authorization, testAuthorizedAt)
	if err != nil {
		t.Fatal(err)
	}
	fly := newFakeFly()
	provisioner := Provisioner{
		Fly: fly, Preparer: &fakeFlyAppPreparer{}, State: store,
		Now: func() time.Time { return testAuthorizedAt.Add(time.Minute) },
	}
	if err := provisioner.ProvisionFly(context.Background(), authorization, testImageReference(), nil); err == nil {
		t.Fatal("ProvisionFly accepted a missing freshly paired credential")
	}
	if fly.createAppCalls != 0 || fly.createVolumeCalls != 0 || fly.createMachineCalls != 0 || store.Snapshot().Phase != PhaseAuthorized {
		t.Fatalf("invalid credential changed provider or state: fly=%+v state=%+v", fly, store.Snapshot())
	}
}

func assertInterruptedProvisionState(t *testing.T, state State) {
	t.Helper()
	if _, ok := resourceByKind(state, ResourceFlyApp); !ok {
		t.Fatal("ambiguous app create was not adopted durably")
	}
	if _, ok := resourceByKind(state, ResourceFlyVolume); !ok {
		t.Fatal("volume create was not persisted before machine failure")
	}
	if _, ok := resourceByKind(state, ResourceFlyMachine); ok {
		t.Fatal("failed machine was recorded")
	}
	if state.Operations[0].Code != OperationCreateAdopted {
		t.Fatalf("first operation code = %s, want adopted", state.Operations[0].Code)
	}
}

func assertRestartedProvision(t *testing.T, state State, fly *fakeFly) {
	t.Helper()
	if _, ok := resourceByKind(state, ResourceFlyMachine); !ok {
		t.Fatal("restart did not finish machine provisioning")
	}
	if fly.createAppCalls != 1 || fly.createVolumeCalls != 1 || fly.createMachineCalls != 2 {
		t.Fatalf("create calls = app %d volume %d machine %d", fly.createAppCalls, fly.createVolumeCalls, fly.createMachineCalls)
	}
	if fly.lastMachineSpec.CPUKind != "shared" || fly.lastMachineSpec.CPUs != 1 || fly.lastMachineSpec.MemoryMiB != 256 ||
		fly.lastMachineSpec.VolumeMountPath != "/data" || !fly.lastMachineSpec.ForceHTTPS ||
		!fly.lastMachineSpec.AutoStartMachines || fly.lastMachineSpec.AutoStopMachines != "stop" ||
		fly.lastMachineSpec.MinimumMachines != 0 || fly.lastMachineSpec.HealthPath != "/healthz" {
		t.Fatalf("machine spec escaped fixed shape: %+v", fly.lastMachineSpec)
	}
}

func TestProvisionerDeadlineTransitionsToCleanupWithoutFurtherCreates(t *testing.T) {
	authorization, directory := loadTestAuthorization(t)
	store, err := OpenStateStore(directory, authorization, testAuthorizedAt.Add(time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	fly := newFakeFly()
	now := testAuthorizedAt.Add(2 * time.Minute)
	fly.afterCreateApp = func() { now = authorization.CleanupDeadline.Add(-10 * time.Minute) }
	provisioner := Provisioner{Fly: fly, Preparer: &fakeFlyAppPreparer{}, Now: func() time.Time { return now }, State: store}
	if err := provisioner.ProvisionFly(context.Background(), authorization, testImageReference(), []byte("inner-runtime-sentinel")); err == nil {
		t.Fatal("ProvisionFly continued into the teardown reserve")
	}
	if store.Snapshot().Phase != PhaseCleaning || fly.createVolumeCalls != 0 {
		t.Fatalf("deadline state = %s, volume creates = %d", store.Snapshot().Phase, fly.createVolumeCalls)
	}
}

func TestProvisionerPreparesSecretsAndIngressBeforeMachineWithDeadlineChecks(t *testing.T) {
	authorization, directory := loadTestAuthorization(t)
	store, err := OpenStateStore(directory, authorization, testAuthorizedAt.Add(time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	fly := newFakeFly()
	now := testAuthorizedAt.Add(2 * time.Minute)
	preparer := &fakeFlyAppPreparer{afterStage: func() {
		now = authorization.CleanupDeadline.Add(-10 * time.Minute)
	}}
	provisioner := Provisioner{Fly: fly, Preparer: preparer, Now: func() time.Time { return now }, State: store}
	if err := provisioner.ProvisionFly(context.Background(), authorization, testImageReference(), []byte("inner-runtime-sentinel")); err == nil {
		t.Fatal("ProvisionFly crossed the cleanup reserve after staging secrets")
	}
	if preparer.stageCalls != 1 || preparer.ipCalls != 0 || fly.createMachineCalls != 0 {
		t.Fatalf("preparation calls = stage %d ip %d machine %d", preparer.stageCalls, preparer.ipCalls, fly.createMachineCalls)
	}
	if string(preparer.stageCredential) != "inner-runtime-sentinel" {
		t.Fatalf("staged inner runtime credential = %q", preparer.stageCredential)
	}
	if store.Snapshot().Phase != PhaseCleaning {
		t.Fatalf("phase = %s, want cleaning", store.Snapshot().Phase)
	}
}

func TestProvisionerRestartRejectsMachineWithDifferentImageDigest(t *testing.T) {
	authorization, directory := loadTestAuthorization(t)
	store, err := OpenStateStore(directory, authorization, testAuthorizedAt.Add(time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	fly := newFakeFly()
	provisioner := Provisioner{Fly: fly, Preparer: &fakeFlyAppPreparer{}, Now: func() time.Time { return testAuthorizedAt.Add(2 * time.Minute) }, State: store}
	if err := provisioner.ProvisionFly(context.Background(), authorization, testImageReference(), []byte("inner-runtime-sentinel")); err != nil {
		t.Fatal(err)
	}
	fly.machines[0].ImageDigest = "sha256:" + strings.Repeat("b", 64)
	if err := provisioner.ProvisionFly(context.Background(), authorization, testImageReference(), []byte("inner-runtime-sentinel")); err == nil {
		t.Fatal("ProvisionFly adopted a restarted Machine with a different image digest")
	}
	if fly.createMachineCalls != 1 {
		t.Fatalf("restart created another Machine: %d creates", fly.createMachineCalls)
	}
}

func TestDurableIntentRecoversCreateAfterResourceJournalInterruption(t *testing.T) {
	authorization, directory := loadTestAuthorization(t)
	store, err := OpenStateStore(directory, authorization, testAuthorizedAt.Add(time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	writes := 0
	store.beforeRename = func(string) error {
		writes++
		if writes == 3 {
			return errors.New("injected resource journal interruption")
		}
		return nil
	}
	fly := newFakeFly()
	now := testAuthorizedAt.Add(2 * time.Minute)
	provisioner := Provisioner{Fly: fly, Preparer: &fakeFlyAppPreparer{}, Now: func() time.Time { return now }, State: store}
	if err := provisioner.ProvisionFly(context.Background(), authorization, testImageReference(), []byte("inner-runtime-sentinel")); err == nil {
		t.Fatal("ProvisionFly succeeded across interrupted resource journal write")
	}
	if len(fly.apps) != 1 {
		t.Fatalf("provider app count = %d, want one ambiguous success", len(fly.apps))
	}
	restarted, err := OpenStateStore(directory, authorization, now)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := intentByKind(restarted.Snapshot(), ResourceFlyApp); !ok {
		t.Fatal("pre-mutation app intent was not durable")
	}
	if _, ok := resourceByKind(restarted.Snapshot(), ResourceFlyApp); ok {
		t.Fatal("interrupted resource journal unexpectedly recorded the app")
	}
	sprites := &fakeSprites{sharedOrder: &fly.destroyOrder}
	coordinator := CleanupCoordinator{
		Fly: fly, Sprites: sprites, Now: func() time.Time { return testAuthorizedAt.Add(3 * time.Hour) },
		Wait: func(context.Context, time.Duration) error { return nil }, State: restarted,
	}
	if err := coordinator.Cleanup(context.Background(), authorization); err != nil {
		t.Fatalf("Cleanup from durable intent: %v", err)
	}
	if len(fly.apps) != 0 || !reflect.DeepEqual(fly.destroyOrder, []string{"app"}) {
		t.Fatalf("cleanup from intent left apps=%v order=%v", fly.apps, fly.destroyOrder)
	}
}

func TestCleanupIsOrderedRestartSafeAndUsesIndependentInventory(t *testing.T) {
	authorization, directory := loadTestAuthorization(t)
	store, fly, sprites := populatedCleanupState(t, authorization, directory)
	fly.destroyVolumeError = errors.New("injected volume delete failure")
	coordinator := CleanupCoordinator{
		Fly: fly, Sprites: sprites, Now: func() time.Time { return testAuthorizedAt.Add(3 * time.Hour) },
		Wait: func(context.Context, time.Duration) error { return nil }, State: store,
	}
	if err := coordinator.Cleanup(context.Background(), authorization); err == nil {
		t.Fatal("Cleanup succeeded across a volume deletion failure")
	}
	wantFirst := []string{"sprite", "machine", "volume"}
	if !reflect.DeepEqual(flyAndSpriteOrder(fly, sprites), wantFirst) {
		t.Fatalf("first cleanup order = %v, want %v", flyAndSpriteOrder(fly, sprites), wantFirst)
	}
	fly.destroyVolumeError = nil
	restarted, err := OpenStateStore(directory, authorization, testAuthorizedAt.Add(3*time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	coordinator.State = restarted
	if err := coordinator.Cleanup(context.Background(), authorization); err != nil {
		t.Fatalf("restart Cleanup: %v", err)
	}
	if restarted.Snapshot().Phase != PhaseClean {
		t.Fatalf("cleanup phase = %s", restarted.Snapshot().Phase)
	}
	wantAll := []string{"sprite", "machine", "volume", "volume", "app"}
	if !reflect.DeepEqual(flyAndSpriteOrder(fly, sprites), wantAll) {
		t.Fatalf("cleanup order = %v, want %v", flyAndSpriteOrder(fly, sprites), wantAll)
	}
	if len(fly.apps) != 0 || len(fly.volumes) != 0 || len(fly.machines) != 0 || len(sprites.resources) != 0 {
		t.Fatal("cleanup completed without empty independent inventories")
	}
	if err := coordinator.Cleanup(context.Background(), authorization); err != nil {
		t.Fatalf("idempotent Cleanup: %v", err)
	}
	if !reflect.DeepEqual(flyAndSpriteOrder(fly, sprites), wantAll) {
		t.Fatal("idempotent cleanup repeated a provider delete")
	}
}

func TestCleanupContinuesProviderTeardownAfterCredentialFailureAndFinishesOnRetry(t *testing.T) {
	authorization, directory := loadTestAuthorization(t)
	store, fly, sprites := populatedCleanupState(t, authorization, directory)
	machine, _ := resourceByKind(store.Snapshot(), ResourceFlyMachine)
	runtime, _ := resourceByKind(store.Snapshot(), ResourceSprite)
	if err := store.RecordBootstrapIntent(BootstrapState{
		MachineID: machine.ID, RuntimeName: runtime.Name, DeviceID: "device_cleanup",
		CredentialSHA256: strings.Repeat("a", 64),
	}, testAuthorizedAt.Add(2*time.Minute)); err != nil {
		t.Fatal(err)
	}
	credentials := &fakeClientCredentialCleaner{err: errors.New("injected credential revocation failure")}
	coordinator := CleanupCoordinator{
		Credentials: credentials, Fly: fly, Sprites: sprites,
		Now:  func() time.Time { return testAuthorizedAt.Add(3 * time.Hour) },
		Wait: func(context.Context, time.Duration) error { return nil }, State: store,
	}
	if err := coordinator.Cleanup(context.Background(), authorization); err == nil {
		t.Fatal("cleanup hid a credential revocation failure")
	}
	if credentials.calls != 1 || len(fly.apps) != 0 || len(fly.volumes) != 0 || len(fly.machines) != 0 || len(sprites.resources) != 0 {
		t.Fatalf("cleanup progress after credential failure: calls=%d fly=%v/%v/%v sprites=%v",
			credentials.calls, fly.apps, fly.volumes, fly.machines, sprites.resources)
	}
	if store.Snapshot().Phase != PhaseCleaning {
		t.Fatalf("phase after credential failure = %s", store.Snapshot().Phase)
	}
	coordinator.Credentials = nil
	if err := coordinator.Cleanup(context.Background(), authorization); err != nil {
		t.Fatal(err)
	}
	if store.Snapshot().Phase != PhaseClean {
		t.Fatalf("cleanup retry phase = %s", store.Snapshot().Phase)
	}
}

func TestCleanupRemovesSpriteBeforeFlyInventoryFailure(t *testing.T) {
	authorization, directory := loadTestAuthorization(t)
	store, fly, sprites := populatedCleanupState(t, authorization, directory)
	fly.listAppsError = errors.New("injected Fly inventory failure")
	coordinator := CleanupCoordinator{
		Fly: fly, Sprites: sprites, Now: func() time.Time { return testAuthorizedAt.Add(3 * time.Hour) },
		Wait: func(context.Context, time.Duration) error { return nil }, State: store,
	}
	if err := coordinator.Cleanup(context.Background(), authorization); err == nil {
		t.Fatal("Cleanup succeeded across Fly inventory failure")
	}
	if len(sprites.resources) != 0 || !reflect.DeepEqual(flyAndSpriteOrder(fly, sprites), []string{"sprite"}) {
		t.Fatalf("cleanup did not make safe Sprite progress: sprites=%v order=%v", sprites.resources, flyAndSpriteOrder(fly, sprites))
	}
	resource, ok := resourceByKind(store.Snapshot(), ResourceSprite)
	if !ok || resource.AbsenceConfirmedAt == "" {
		t.Fatalf("Sprite absence was not durable before Fly failure: %+v", resource)
	}
}

func populatedCleanupState(t *testing.T, authorization Authorization, directory string) (*StateStore, *fakeFly, *fakeSprites) {
	t.Helper()
	store, err := OpenStateStore(directory, authorization, testAuthorizedAt.Add(time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	resources := []ResourceState{
		{Kind: ResourceFlyApp, ID: authorization.Manifest.FlyAppName, Name: authorization.Manifest.FlyAppName},
		{Kind: ResourceFlyVolume, ID: "vol-night", Name: authorization.Manifest.ResourcePrefix + "-data", ActualRegion: "yyz"},
		{Kind: ResourceFlyMachine, ID: "machine-night", Name: authorization.Manifest.ResourcePrefix + "-machine", ActualRegion: "yyz"},
		{Kind: ResourceSprite, ID: "sprite-night", Name: authorization.Manifest.ResourcePrefix + "-sprite"},
	}
	for _, resource := range resources {
		if err := store.RecordResource(resource, OperationCreateAccepted, testAuthorizedAt.Add(2*time.Minute)); err != nil {
			t.Fatal(err)
		}
	}
	fly := newFakeFly()
	fly.apps = []ProviderResource{{ID: resources[0].ID, Name: resources[0].Name}}
	fly.volumes = []ProviderResource{{ID: resources[1].ID, Name: resources[1].Name, Region: "yyz"}}
	fly.machines = []ProviderResource{{ID: resources[2].ID, Name: resources[2].Name, Region: "yyz"}}
	sprites := &fakeSprites{resources: []ProviderResource{{ID: resources[3].ID, Name: resources[3].Name}}, sharedOrder: &fly.destroyOrder}
	return store, fly, sprites
}

type fakeFly struct {
	apps               []ProviderResource
	volumes            []ProviderResource
	machines           []ProviderResource
	appCreateAmbiguous bool
	machineCreateError error
	destroyVolumeError error
	listAppsError      error
	afterCreateApp     func()
	createAppCalls     int
	createVolumeCalls  int
	createMachineCalls int
	lastMachineSpec    MachineSpec
	destroyOrder       []string
}

type fakeClientCredentialCleaner struct {
	err   error
	calls int
}

func (cleaner *fakeClientCredentialCleaner) CleanupCredentials(context.Context, Authorization) error {
	cleaner.calls++
	return cleaner.err
}

type fakeFlyAppPreparer struct {
	stageErr        error
	ipErr           error
	afterStage      func()
	stageCalls      int
	ipCalls         int
	stageCredential []byte
}

func (preparer *fakeFlyAppPreparer) StageSecrets(_ context.Context, _ string, credential []byte) error {
	preparer.stageCalls++
	preparer.stageCredential = append([]byte(nil), credential...)
	if preparer.afterStage != nil {
		preparer.afterStage()
	}
	return preparer.stageErr
}

func (preparer *fakeFlyAppPreparer) EnsureSharedIPv4(context.Context, string) error {
	preparer.ipCalls++
	return preparer.ipErr
}

func newFakeFly() *fakeFly { return &fakeFly{} }

func (fly *fakeFly) ListApps(context.Context, string) ([]ProviderResource, error) {
	if fly.listAppsError != nil {
		return nil, fly.listAppsError
	}
	return append([]ProviderResource(nil), fly.apps...), nil
}

func (fly *fakeFly) CreateApp(_ context.Context, _ string, name string) (ProviderResource, error) {
	fly.createAppCalls++
	resource := ProviderResource{ID: name, Name: name}
	fly.apps = append(fly.apps, resource)
	if fly.afterCreateApp != nil {
		fly.afterCreateApp()
	}
	if fly.appCreateAmbiguous {
		fly.appCreateAmbiguous = false
		return ProviderResource{}, errors.New("ambiguous app create response")
	}
	return resource, nil
}

func (fly *fakeFly) DestroyApp(_ context.Context, _ string, id string) error {
	fly.destroyOrder = append(fly.destroyOrder, "app")
	fly.apps = removeProviderResource(fly.apps, id)
	return nil
}

func (fly *fakeFly) ListVolumes(context.Context, string) ([]ProviderResource, error) {
	return append([]ProviderResource(nil), fly.volumes...), nil
}

func (fly *fakeFly) CreateVolume(_ context.Context, spec VolumeSpec) (ProviderResource, error) {
	fly.createVolumeCalls++
	resource := ProviderResource{ID: "vol-night", Name: spec.Name, Region: spec.Region}
	fly.volumes = append(fly.volumes, resource)
	return resource, nil
}

func (fly *fakeFly) DestroyVolume(_ context.Context, _ string, id string) error {
	fly.destroyOrder = append(fly.destroyOrder, "volume")
	if fly.destroyVolumeError != nil {
		return fly.destroyVolumeError
	}
	fly.volumes = removeProviderResource(fly.volumes, id)
	return nil
}

func (fly *fakeFly) ListMachines(context.Context, string) ([]ProviderResource, error) {
	return append([]ProviderResource(nil), fly.machines...), nil
}

func (fly *fakeFly) CreateMachine(_ context.Context, spec MachineSpec) (ProviderResource, error) {
	fly.createMachineCalls++
	fly.lastMachineSpec = spec
	if fly.machineCreateError != nil {
		return ProviderResource{}, fly.machineCreateError
	}
	resource := ProviderResource{
		ID: "machine-night", Name: spec.Name, Region: spec.Region,
		ImageDigest: spec.ImageReference[strings.LastIndex(spec.ImageReference, "@")+1:],
	}
	fly.machines = append(fly.machines, resource)
	return resource, nil
}

func (fly *fakeFly) DestroyMachine(_ context.Context, _ string, id string) error {
	fly.destroyOrder = append(fly.destroyOrder, "machine")
	fly.machines = removeProviderResource(fly.machines, id)
	return nil
}

type fakeSprites struct {
	resources   []ProviderResource
	sharedOrder *[]string
}

func (sprites *fakeSprites) List(context.Context, string) ([]ProviderResource, error) {
	return append([]ProviderResource(nil), sprites.resources...), nil
}

func (sprites *fakeSprites) Destroy(_ context.Context, _ string, id string) error {
	*sprites.sharedOrder = append(*sprites.sharedOrder, "sprite")
	sprites.resources = removeProviderResource(sprites.resources, id)
	return nil
}

func removeProviderResource(resources []ProviderResource, id string) []ProviderResource {
	result := resources[:0]
	for _, resource := range resources {
		if resource.ID != id {
			result = append(result, resource)
		}
	}
	return result
}

func flyAndSpriteOrder(fly *fakeFly, _ *fakeSprites) []string {
	return append([]string(nil), fly.destroyOrder...)
}

func loadTestAuthorization(t *testing.T) (Authorization, string) {
	t.Helper()
	directory, path := writeTestManifest(t, validManifest(), nil)
	authorization, err := LoadManifest(path, testAuthorizedAt.Add(time.Minute), ValidateForStart)
	if err != nil {
		t.Fatal(err)
	}
	return authorization, directory
}

func validManifest() Manifest {
	runID := "night"
	return Manifest{
		SchemaVersion:       ManifestSchemaVersion,
		RunID:               runID,
		OwnerAuthorizedAt:   testAuthorizedAt.Format(time.RFC3339),
		StartDeadline:       testAuthorizedAt.Add(30 * time.Minute).Format(time.RFC3339),
		CleanupDeadline:     testAuthorizedAt.Add(2 * time.Hour).Format(time.RFC3339),
		MaximumSpendUSD:     "5.00",
		SpritesOrganization: "setta-100",
		FlyOrganization:     "setta-100",
		FlyRegion:           "yyz",
		FlyAppName:          "setta-gateway-" + runID,
		ResourcePrefix:      "setta-gateway-" + runID,
		AuthorizedWorkload:  append([]string(nil), authorizedWorkload...),
		ExcludedWorkload:    append([]string(nil), excludedWorkload...),
		CleanupAuthority:    CleanupAuthority,
		BillingObserver:     BillingObserver,
	}
}

func writeTestManifest(t *testing.T, manifest Manifest, mutate func([]byte) []byte) (string, string) {
	t.Helper()
	directory := newPrivateDirectory(t)
	data, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if mutate != nil {
		data = mutate(data)
	}
	return directory, writePrivateFile(t, directory, "manifest.json", data)
}

func newPrivateDirectory(t *testing.T) string {
	t.Helper()
	directory := filepath.Join(t.TempDir(), "run")
	if err := os.Mkdir(directory, 0o700); err != nil {
		t.Fatal(err)
	}
	return directory
}

func writePrivateFile(t *testing.T, directory string, name string, data []byte) string {
	t.Helper()
	path := filepath.Join(directory, name)
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}
