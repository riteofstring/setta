package hostedmeasurement

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	spritessdk "github.com/superfly/sprites-go"

	"setta/internal/runtimeinstall"
	"setta/internal/runtimeprovider"
	"setta/internal/runtimeprovider/runtimetest"
	settasprites "setta/internal/sprites"
)

const serviceStreamContentMarker = "SERVICE-STDOUT-MARKER-a1b2c3"

func TestFailedHostedInstallKeepsServiceStreamDetailOutOfDurableEvidence(t *testing.T) {
	authorization, directory := loadTestAuthorization(t)
	store, err := OpenStateStore(directory, authorization, testAuthorizedAt)
	if err != nil {
		t.Fatal(err)
	}
	identity, err := runtimeprovider.NewManagedIdentity("hosted-service-stream-content-safety")
	if err != nil {
		t.Fatal(err)
	}
	observation := runtimeprovider.RuntimeObservation{
		ProviderResourceID: "sprite-service-stream-test",
		Name:               identity.Name,
		Labels:             identity.Labels,
		Activity:           runtimeprovider.RuntimeActivityActive,
		URL:                "https://" + identity.Name + ".invalid",
		URLAccess:          runtimeprovider.URLAccessAuthenticated,
		Placement:          "yyz",
	}
	if err := store.RecordResource(ResourceState{
		Kind:         ResourceSprite,
		ID:           observation.ProviderResourceID,
		Name:         observation.Name,
		ActualRegion: observation.Placement,
	}, OperationCreateAccepted, testAuthorizedAt.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}

	server := hostedServiceErrorServer(t, identity)
	defer server.Close()
	adapter, err := settasprites.NewAdapterWithBaseURL("provider-token", server.URL)
	if err != nil {
		t.Fatal(err)
	}
	layout := runtimeinstall.DefaultLayout()
	baseProvider := runtimetest.NewProvider(runtimetest.Options{
		Now:                 func() time.Time { return testAuthorizedAt.Add(2 * time.Minute) },
		WorkloadIdentity:    layout.WorkloadIdentity,
		AllowMissingRuntime: true,
	})
	installer := runtimeinstall.Loop{
		Provider: &hostedServiceErrorProvider{
			Provider:        baseProvider,
			serviceProvider: adapter,
		},
		Verifier: acceptingHostedReleaseVerifier{},
		Now:      func() time.Time { return testAuthorizedAt.Add(2 * time.Minute) },
		Sleep: func(context.Context, time.Duration) error {
			return nil
		},
	}
	stages := []string{}
	preparer := SpriteRuntimePreparer{
		Provisioner: &fakeHostedSpriteProvisioner{stages: &stages, observation: observation},
		Verifier:    &fakeHostedVerifierInstaller{stages: &stages},
		Installer:   installer,
		Release: RuntimeReleaseInputs{
			Artifact: testHostedServiceErrorArtifact(t),
		},
		HealthAttempts: 1,
	}

	_, err = preparer.Prepare(context.Background(), authorization)
	var operationErr *settasprites.OperationError
	if !errors.As(err, &operationErr) {
		t.Fatalf("Prepare error = %T %v, want *sprites.OperationError", err, err)
	}
	if operationErr.Detail != serviceStreamContentMarker {
		t.Fatalf("OperationError.Detail = %q, want %q", operationErr.Detail, serviceStreamContentMarker)
	}
	if !errors.Is(err, runtimeinstall.ErrHealthCheckFailed) {
		t.Fatalf("Prepare error = %v, want ErrHealthCheckFailed", err)
	}

	stateBytes, err := os.ReadFile(filepath.Join(directory, stateFileName))
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(stateBytes, []byte(serviceStreamContentMarker)) {
		t.Fatalf("hosted measurement %s contains service stream content", stateFileName)
	}
	installMetadata, found := baseProvider.File(layout.MetadataPath)
	if !found {
		t.Fatalf("failed install did not write %s before its health check", layout.MetadataPath)
	}
	if bytes.Contains(installMetadata, []byte(serviceStreamContentMarker)) {
		t.Fatalf("runtime install metadata %s contains service stream content", layout.MetadataPath)
	}
}

func hostedServiceErrorServer(t *testing.T, identity runtimeprovider.ManagedIdentity) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		runtimePath := "/v1/sprites/" + identity.Name
		servicePath := runtimePath + "/services/" + runtimeinstall.DefaultLayout().ServiceName
		switch {
		case request.Method == http.MethodGet && request.URL.Path == runtimePath:
			response.Header().Set("Content-Type", "application/json")
			err := json.NewEncoder(response).Encode(spritessdk.SpriteInfo{
				ID:            "sprite-service-stream-test",
				Name:          identity.Name,
				Status:        "running",
				Config:        &spritessdk.SpriteConfig{CPUs: 1, RamMB: 512, StorageGB: 10},
				PrimaryRegion: "yyz",
				URL:           "https://" + identity.Name + ".invalid",
				URLSettings:   &spritessdk.URLSettings{Auth: "sprite"},
				Labels:        identity.Labels,
			})
			if err != nil {
				t.Errorf("encode Sprite response: %v", err)
			}
		case request.Method == http.MethodPut && request.URL.Path == servicePath:
			response.Header().Set("Content-Type", "application/x-ndjson")
			encoder := json.NewEncoder(response)
			for _, event := range []spritessdk.ServiceLogEvent{
				{Type: "stdout", Data: "ordinary service output"},
				{Type: "error", Data: "  " + serviceStreamContentMarker + "  "},
			} {
				if err := encoder.Encode(event); err != nil {
					t.Errorf("encode service event: %v", err)
					return
				}
			}
		default:
			http.Error(response, fmt.Sprintf("unexpected request %s %s", request.Method, request.URL.Path), http.StatusNotFound)
		}
	}))
}

type hostedServiceErrorProvider struct {
	*runtimetest.Provider
	serviceProvider runtimeprovider.Provider
}

func (provider *hostedServiceErrorProvider) EnsureService(
	ctx context.Context,
	runtimeName string,
	spec runtimeprovider.ServiceSpec,
) (runtimeprovider.ServiceObservation, error) {
	return provider.serviceProvider.EnsureService(ctx, runtimeName, spec)
}

type acceptingHostedReleaseVerifier struct{}

func (acceptingHostedReleaseVerifier) VerifyReleaseSignature(
	context.Context,
	runtimeinstall.SignatureVerificationRequest,
) error {
	return nil
}

func testHostedServiceErrorArtifact(t *testing.T) runtimeinstall.ReleaseArtifact {
	t.Helper()
	const version = "service-error"
	artifactDirectory := "setta_" + version + "_linux_amd64"
	archiveName := artifactDirectory + ".tar.gz"
	binaryPayload := []byte("version:" + version + "\n")

	var archive bytes.Buffer
	gzipWriter := gzip.NewWriter(&archive)
	tarWriter := tar.NewWriter(gzipWriter)
	if err := tarWriter.WriteHeader(&tar.Header{
		Name: artifactDirectory + "/setta",
		Mode: 0o755,
		Size: int64(len(binaryPayload)),
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := tarWriter.Write(binaryPayload); err != nil {
		t.Fatal(err)
	}
	if err := tarWriter.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gzipWriter.Close(); err != nil {
		t.Fatal(err)
	}

	directory := t.TempDir()
	archivePath := filepath.Join(directory, archiveName)
	if err := os.WriteFile(archivePath, archive.Bytes(), 0o600); err != nil {
		t.Fatal(err)
	}
	checksumsPath := filepath.Join(directory, "SHA256SUMS-"+version)
	checksums := fmt.Sprintf(
		"%s  %s\n%s  %s/setta\n",
		hostedArtifactSHA256(archive.Bytes()),
		archiveName,
		hostedArtifactSHA256(binaryPayload),
		artifactDirectory,
	)
	if err := os.WriteFile(checksumsPath, []byte(checksums), 0o600); err != nil {
		t.Fatal(err)
	}
	signaturePath := filepath.Join(directory, "SHA256SUMS-"+version+".minisig")
	if err := os.WriteFile(signaturePath, []byte("test signature\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	return runtimeinstall.ReleaseArtifact{
		Version:       version,
		OS:            "linux",
		Arch:          "amd64",
		ArchivePath:   archivePath,
		ChecksumsPath: checksumsPath,
		SignaturePath: signaturePath,
		PublicKey:     "RWQtestminisignpublickey",
	}
}

func hostedArtifactSHA256(data []byte) string {
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:])
}
