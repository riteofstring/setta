package runtime

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"

	"setta/internal/httpapi"
	"setta/internal/speech"
)

func TestRuntimeKeepsSpeechSecretsAndAudioOutOfOutputAndPersistence(t *testing.T) {
	provider := newRuntimeSpeechProvider(t)
	defer provider.Close()

	config := testConfig(t)
	appDataDir := config.AppDataDir
	config.Speech = speech.OpenAIProviderConfig{
		BaseURL:          provider.URL + "/v1",
		AllowTestBaseURL: true,
	}
	config.SpeechCredentialOwner = SpeechCredentialOwnerServerStartup
	config.SpeechStartupAPIKey = runtimeSpeechAPIKey
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

	session := postRuntimeJSON[speech.SpeechTranscriptionSession](
		t,
		client,
		baseURL,
		"/speech/transcription/sessions",
		httpapi.CreateSpeechTranscriptionSessionRequest{Provider: speech.SpeechProviderOpenAI},
		http.StatusOK,
	)
	if session.ClientSecret != runtimeSpeechTranscriptionSecret {
		t.Fatal("runtime returned an unexpected transcription client secret")
	}
	shutdownServer(t, server)
	serverStopped = true
	markers := runtimeSpeechPrivateMarkers()
	assertNoRuntimeSpeechMarkers(t, "runtime stdout", stdout.Bytes(), markers)
	assertNoRuntimeSpeechMarkers(t, "runtime stderr", stderr.Bytes(), markers)
	assertNoRuntimeSpeechMarkersInDirectory(t, appDataDir, markers)
}

func runtimeSpeechPrivateMarkers() map[string][]byte {
	return map[string][]byte{
		"permanent API key": []byte(runtimeSpeechAPIKey),
		"client secret":     []byte(runtimeSpeechTranscriptionSecret),
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
