package runtime

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"

	"setta/internal/easyrun"
	"setta/internal/httpapi"
	"setta/internal/speech"
)

func TestRuntimeKeepsSpeechSecretsAndAudioOutOfOutputAndPersistence(t *testing.T) {
	provider := newRuntimeSpeechProvider(t)
	defer provider.Close()

	config := testConfig(t)
	appDataDir := config.AppDataDir
	config.ChatHarness = ChatHarnessScriptedWorkflow
	config.Speech = speech.OpenAIClientConfig{
		APIKey:           runtimeSpeechAPIKey,
		BaseURL:          provider.URL + "/v1",
		AllowTestBaseURL: true,
	}
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	config.Stdout = &stdout
	config.Stderr = &stderr

	server, err := Start(t.Context(), config)
	if err != nil {
		t.Fatalf("start configured speech runtime: %v", err)
	}
	serverStopped := false
	defer func() {
		if !serverStopped {
			shutdownServer(t, server)
		}
	}()

	var ready ReadyEvent
	if err := json.NewDecoder(bytes.NewReader(stdout.Bytes())).Decode(&ready); err != nil {
		t.Fatalf("decode configured speech runtime ready event: %v", err)
	}
	client := authenticatedRuntimeTestClient(ready.BootstrapToken, 10*time.Second)
	baseURL := "http://" + server.Addr()
	workspaceRoot := t.TempDir()
	opened := postRuntimeJSON[httpapi.OpenWorkspaceResponse](t, client, baseURL, "/workspaces/open", httpapi.OpenWorkspaceRequest{
		RootPath: workspaceRoot,
	}, http.StatusOK)

	session := postRuntimeJSON[speech.SpeechTranscriptionSession](
		t,
		client,
		baseURL,
		"/speech/transcription/sessions",
		httpapi.CreateSpeechTranscriptionSessionRequest{WorkspaceID: opened.Workspace.ID},
		http.StatusOK,
	)
	if session.ClientSecret != runtimeSpeechTranscriptionSecret {
		t.Fatal("runtime returned an unexpected transcription client secret")
	}
	started := postRuntimeJSON[easyrun.EasyRun](t, client, baseURL, "/easy-runs/start", httpapi.StartEasyRunRequest{
		WorkspaceID: opened.Workspace.ID,
		RequestText: "easy run phase4 narrator workflow",
	}, http.StatusOK)
	waitForRuntimeSpeechSource(t, client, baseURL, opened.Workspace.ID, started.ID)
	audio := postRuntimeJSON[speech.SpeechAudio](t, client, baseURL, "/speech/easy-runs/summary", httpapi.SynthesizeEasyRunSummaryRequest{
		WorkspaceID: opened.Workspace.ID,
		EasyRunID:   started.ID,
	}, http.StatusOK)
	assertRuntimeSpeechAudio(t, audio, started.ID)

	provider.RejectSynthesis()
	failure := postRuntimeJSON[httpapi.ErrorResponse](t, client, baseURL, "/speech/easy-runs/summary", httpapi.SynthesizeEasyRunSummaryRequest{
		WorkspaceID: opened.Workspace.ID,
		EasyRunID:   started.ID,
	}, http.StatusServiceUnavailable)
	if failure.Error.Code != string(speech.ErrorProviderUnavailable) || failure.Error.OperationApplied {
		t.Fatalf("provider failure = %+v", failure.Error)
	}
	failureJSON, err := json.Marshal(failure)
	if err != nil {
		t.Fatalf("encode safe provider failure: %v", err)
	}

	shutdownServer(t, server)
	serverStopped = true
	markers := runtimeSpeechPrivateMarkers()
	assertNoRuntimeSpeechMarkers(t, "runtime stdout", stdout.Bytes(), markers)
	assertNoRuntimeSpeechMarkers(t, "runtime stderr", stderr.Bytes(), markers)
	assertNoRuntimeSpeechMarkers(t, "speech failure response", failureJSON, markers)
	assertNoRuntimeSpeechMarkersInDirectory(t, appDataDir, markers)
	assertNoRuntimeSpeechMarkersInDirectory(t, workspaceRoot, markers)
}

func runtimeSpeechPrivateMarkers() map[string][]byte {
	audio := runtimeSpeechWAV()
	return map[string][]byte{
		"permanent API key":   []byte(runtimeSpeechAPIKey),
		"client secret":       []byte(runtimeSpeechTranscriptionSecret),
		"provider body":       []byte(runtimeSpeechProviderFailureBody),
		"raw generated audio": audio,
		"base64 audio":        []byte(base64.StdEncoding.EncodeToString(audio)),
	}
}

func assertNoRuntimeSpeechMarkersInDirectory(t *testing.T, root string, markers map[string][]byte) {
	t.Helper()
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if !entry.Type().IsRegular() {
			return nil
		}
		contents, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		assertNoRuntimeSpeechMarkers(t, path, contents, markers)
		return nil
	})
	if err != nil {
		t.Fatalf("scan %s for private speech data: %v", root, err)
	}
}

func assertNoRuntimeSpeechMarkers(t *testing.T, location string, contents []byte, markers map[string][]byte) {
	t.Helper()
	for label, marker := range markers {
		if bytes.Contains(contents, marker) {
			t.Fatalf("%s contains private speech %s", location, label)
		}
	}
}
