package appdefinition_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"setta/internal/appsubsystem/appdefinition"
	"setta/internal/appsubsystem/appspec"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/pythonsdkcontracts"
	"setta/internal/pythonsdklocalcore"
)

func TestBackendRuntimeProviderCompareAndSetPlansAgainstQueuedLocalCoreDocument(t *testing.T) {
	settaFilesRoot := t.TempDir()
	pluginID := "setta-json-render-app-gen"
	storage := appdefinition.MustStorageForPlugin(pluginID)
	appSpecStore := appspec.MustForPlugin(pluginID)
	appSpecPath := appSpecStore.DefaultPath()

	blockV3Save := make(chan struct{})
	releaseV3Save := make(chan struct{})
	var releaseBlockedV3Save sync.Once
	defer releaseBlockedV3Save.Do(func() { close(releaseV3Save) })
	store, runtime := openBackendRuntimeLocalCoreRuntimeWithBlockedV3Save(
		t,
		settaFilesRoot,
		storage,
		blockV3Save,
		releaseV3Save,
	)

	owner := appdefinition.NewAppDefinitionService(runtime, pluginID)
	catalogID := appspec.DefaultCatalogID
	seedBackendRuntimeLocalCoreAppDefinition(t, owner, appSpecPath, catalogID)

	setV3Done := startBackendRuntimeLocalCoreV3Set(t, owner, appSpecPath, catalogID)

	waitForClosed(t, blockV3Save, "v3 save to block")

	invoker := &backendRuntimeLocalCoreInvoker{
		settaFilesRoot: settaFilesRoot,
		invoked:        make(chan projectstate.Document, 1),
	}
	providerRuntime := appdefinition.NewBackendRuntime(runtime, pluginID, invoker)
	casDone := startBackendRuntimeLocalCoreCAS(t, providerRuntime)

	assertBackendRuntimeLocalCorePlanningWaits(t, invoker.invoked)

	releaseBlockedV3Save.Do(func() { close(releaseV3Save) })
	if err := waitForError(t, setV3Done, "v3 set"); err != nil {
		t.Fatalf("v3 set failed: %v", err)
	}
	providerDocument := waitForDocument(t, invoker.invoked, "provider planning")
	assertBackendRuntimeLocalCoreProviderSawVersion(t, storage, providerDocument, "v3")

	casResult := waitForCASResult(t, casDone)
	assertBackendRuntimeLocalCoreCASResult(t, casResult)
	assertBackendRuntimeLocalCorePersistedVersion(t, store, storage, casResult.snapshot)

	storedSpec, err := appSpecStore.Read(settaFilesRoot, appSpecPath)
	if err != nil {
		t.Fatalf("read app spec: %v", err)
	}
	if label := backendRuntimeLocalCoreTestAppSpecLabel(storedSpec); label != "queued" {
		t.Fatalf("expected app spec file to match queued snapshot, got %q", label)
	}
	assertBackendRuntimeLocalCoreCompletedFrontendOps(t, runtime)
}

func openBackendRuntimeLocalCoreRuntimeWithBlockedV3Save(
	t *testing.T,
	settaFilesRoot string,
	storage appdefinition.DocumentStorage,
	blockV3Save chan<- struct{},
	releaseV3Save <-chan struct{},
) (*projectstate.Store, *projectstate.Runtime) {
	t.Helper()

	store, err := projectstate.NewStore(
		filepath.Join(settaFilesRoot, projectstate.MainFileName),
		projectstate.StoreOptions{},
	)
	if err != nil {
		t.Fatalf("new project store: %v", err)
	}
	if err := store.Save(context.Background(), projectstate.NewDocument()); err != nil {
		t.Fatalf("save initial document: %v", err)
	}
	runtime, err := projectstate.OpenRuntimeWithOptions(
		context.Background(),
		store,
		projectstate.RuntimeOptions{
			BeforeSave: func(_ context.Context, snapshot projectstate.Snapshot) error {
				definition := mustDecodeStoredDefinition(
					t,
					storage.StoredDocumentAppDefinitionRaw(snapshot.Document),
				)
				if definition.AppSpecVersion != "v3" {
					return nil
				}
				close(blockV3Save)
				<-releaseV3Save
				return nil
			},
		},
	)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})
	return store, runtime
}

func seedBackendRuntimeLocalCoreAppDefinition(
	t *testing.T,
	owner appdefinition.Runtime,
	appSpecPath string,
	catalogID string,
) {
	t.Helper()

	seedVersion := "v1"
	if _, _, err := owner.SetAppDefinition(context.Background(), appdefinition.SetInput{
		AppSpec:        backendRuntimeLocalCoreTestAppSpec("seed"),
		AppSpecPath:    &appSpecPath,
		AppSpecVersion: &seedVersion,
		CatalogID:      &catalogID,
	}); err != nil {
		t.Fatalf("seed app definition: %v", err)
	}
}

func startBackendRuntimeLocalCoreV3Set(
	t *testing.T,
	owner appdefinition.Runtime,
	appSpecPath string,
	catalogID string,
) <-chan error {
	t.Helper()

	setV3Done := make(chan error, 1)
	go func() {
		nextVersion := "v3"
		_, _, err := owner.SetAppDefinition(context.Background(), appdefinition.SetInput{
			AppSpec:        backendRuntimeLocalCoreTestAppSpec("queued"),
			AppSpecPath:    &appSpecPath,
			AppSpecVersion: &nextVersion,
			CatalogID:      &catalogID,
		})
		setV3Done <- err
	}()
	return setV3Done
}

func startBackendRuntimeLocalCoreCAS(
	t *testing.T,
	providerRuntime appdefinition.Runtime,
) <-chan backendRuntimeCASTestResult {
	t.Helper()

	casDone := make(chan backendRuntimeCASTestResult, 1)
	go func() {
		expected := "v3"
		snapshot, result, err := providerRuntime.CompareAndSetAppDefinitionSpecVersion(
			projectstate.ContextWithFrontendOpID(context.Background(), "cas-v4"),
			"v4",
			&expected,
		)
		casDone <- backendRuntimeCASTestResult{
			snapshot: snapshot,
			result:   result,
			err:      err,
		}
	}()
	return casDone
}

func assertBackendRuntimeLocalCorePlanningWaits(t *testing.T, invoked <-chan projectstate.Document) {
	t.Helper()

	select {
	case <-invoked:
		t.Fatal("provider local-core planning ran before the queued owner document committed")
	case <-time.After(50 * time.Millisecond):
	}
}

func assertBackendRuntimeLocalCoreProviderSawVersion(
	t *testing.T,
	storage appdefinition.DocumentStorage,
	providerDocument projectstate.Document,
	expectedVersion string,
) {
	t.Helper()

	providerDefinition := mustDecodeStoredDefinition(
		t,
		storage.StoredDocumentAppDefinitionRaw(providerDocument),
	)
	if providerDefinition.AppSpecVersion != expectedVersion {
		t.Fatalf("expected provider to plan against queued v3 document, got %#v", providerDefinition)
	}
}

func assertBackendRuntimeLocalCoreCASResult(t *testing.T, casResult backendRuntimeCASTestResult) {
	t.Helper()

	if casResult.err != nil {
		t.Fatalf("provider-backed compare-and-set failed: %v", casResult.err)
	}
	if casResult.result.OldValue != "v3" || casResult.result.NewValue != "v4" {
		t.Fatalf("unexpected compare-and-set result %#v", casResult.result)
	}
}

func assertBackendRuntimeLocalCorePersistedVersion(
	t *testing.T,
	store *projectstate.Store,
	storage appdefinition.DocumentStorage,
	snapshot projectstate.Snapshot,
) {
	t.Helper()

	persisted, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted document: %v", err)
	}
	if got := mustDecodeStoredDefinition(t, storage.StoredDocumentAppDefinitionRaw(persisted)); got.AppSpecVersion != "v4" {
		t.Fatalf("expected persisted app definition v4, got %#v", got)
	}
	if got := mustDecodeStoredDefinition(t, storage.StoredDocumentAppDefinitionRaw(snapshot.Document)); got.AppSpecVersion != "v4" {
		t.Fatalf("expected snapshot app definition v4, got %#v", got)
	}
}

func assertBackendRuntimeLocalCoreCompletedFrontendOps(t *testing.T, runtime *projectstate.Runtime) {
	t.Helper()

	_, ops, err := runtime.SnapshotAndConsumeFrontendOps()
	if err != nil {
		t.Fatalf("consume frontend ops: %v", err)
	}
	if len(ops.Completed) != 1 || ops.Completed[0] != "cas-v4" {
		t.Fatalf("expected completed frontend op [cas-v4], got %#v", ops.Completed)
	}
}

type backendRuntimeCASTestResult struct {
	snapshot projectstate.Snapshot
	result   projectstate.CompareAndSetResult[string]
	err      error
}

type backendRuntimeLocalCoreInvoker struct {
	settaFilesRoot string
	invoked        chan projectstate.Document
}

func (i *backendRuntimeLocalCoreInvoker) InvokeRegisteredListenerEndpoint(
	ctx context.Context,
	request plugins.BackendListenerEndpointRequest,
) (any, bool, error) {
	_ = ctx
	commandName, ok := backendRuntimeLocalCoreCommandName(request.EndpointName)
	if !ok {
		return nil, false, nil
	}

	payload := map[string]any{}
	for key, value := range request.Payload {
		payload[key] = value
	}
	payload["settaFilesRoot"] = i.settaFilesRoot
	payload["pluginId"] = request.PluginID
	if rawDocument, ok := payload["projectStateDocument"]; ok && i.invoked != nil {
		i.invoked <- mustDecodeBackendRuntimeLocalCoreDocument(rawDocument)
	}

	var input bytes.Buffer
	if err := json.NewEncoder(&input).Encode(pythonsdkcontracts.LocalCoreCommandEnvelope{
		CallID:      "test-call",
		CommandName: commandName,
		Payload:     payload,
	}); err != nil {
		return nil, true, err
	}

	var output bytes.Buffer
	if err := pythonsdklocalcore.Run(pythonsdklocalcore.RunOptions{
		Stdin:  &input,
		Stdout: &output,
	}); err != nil {
		return nil, true, err
	}
	decoder := json.NewDecoder(&output)
	var handshake pythonsdkcontracts.LocalCoreVersionHandshake
	if err := decoder.Decode(&handshake); err != nil {
		return nil, true, err
	}
	var result pythonsdkcontracts.LocalCoreResultEnvelope
	if err := decoder.Decode(&result); err != nil {
		return nil, true, err
	}
	if !result.OK {
		message := ""
		if result.Error != nil {
			message = *result.Error
		}
		code, _ := result.Details["code"].(string)
		return nil, true, &plugins.BackendRuntimeError{
			Code:    code,
			Message: message,
			Details: result.Details,
		}
	}
	return result.Result, true, nil
}

func backendRuntimeLocalCoreCommandName(endpointName string) (string, bool) {
	for _, command := range pythonsdklocalcore.AppSubsystemBackendListenerEndpointCommands() {
		if command.ListenerEndpointName == endpointName {
			return command.LocalCoreCommandName, true
		}
	}
	return "", false
}

func backendRuntimeLocalCoreTestAppSpec(label string) map[string]any {
	return map[string]any{
		"root": "root",
		"elements": map[string]any{
			"root": map[string]any{
				"key":      "root",
				"type":     "Stack",
				"children": []any{"heading"},
			},
			"heading": map[string]any{
				"key":  "heading",
				"type": "Heading",
				"props": map[string]any{
					"text": label,
				},
			},
		},
	}
}

func backendRuntimeLocalCoreTestAppSpecLabel(appSpec any) string {
	spec, _ := appSpec.(map[string]any)
	elements, _ := spec["elements"].(map[string]any)
	heading, _ := elements["heading"].(map[string]any)
	props, _ := heading["props"].(map[string]any)
	label, _ := props["text"].(string)
	return label
}

func mustDecodeStoredDefinition(
	t *testing.T,
	raw projectstate.RawJSON,
) appdefinition.AppDefinition {
	t.Helper()
	definition, err := appdefinition.DecodeStoredAppDefinition(raw)
	if err != nil {
		t.Fatalf("decode stored app definition: %v", err)
	}
	if definition == nil {
		return appdefinition.AppDefinition{}
	}
	return *definition
}

func mustDecodeBackendRuntimeLocalCoreDocument(raw any) projectstate.Document {
	encoded, err := json.Marshal(raw)
	if err != nil {
		panic(fmt.Sprintf("marshal projectStateDocument: %v", err))
	}
	var document projectstate.Document
	if err := json.Unmarshal(encoded, &document); err != nil {
		panic(fmt.Sprintf("decode projectStateDocument: %v", err))
	}
	return document
}

func waitForClosed(t *testing.T, ch <-chan struct{}, label string) {
	t.Helper()
	select {
	case <-ch:
	case <-time.After(2 * time.Second):
		t.Fatalf("timed out waiting for %s", label)
	}
}

func waitForError(t *testing.T, ch <-chan error, label string) error {
	t.Helper()
	select {
	case err := <-ch:
		return err
	case <-time.After(2 * time.Second):
		t.Fatalf("timed out waiting for %s", label)
		return nil
	}
}

func waitForDocument(t *testing.T, ch <-chan projectstate.Document, label string) projectstate.Document {
	t.Helper()
	select {
	case document := <-ch:
		return document
	case <-time.After(2 * time.Second):
		t.Fatalf("timed out waiting for %s", label)
		return projectstate.Document{}
	}
}

func waitForCASResult(t *testing.T, ch <-chan backendRuntimeCASTestResult) backendRuntimeCASTestResult {
	t.Helper()
	select {
	case result := <-ch:
		return result
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for compare-and-set result")
		return backendRuntimeCASTestResult{}
	}
}
