package sprites

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	spritessdk "github.com/superfly/sprites-go"

	"setta/internal/httpapi"
	"setta/internal/runtimeinstall"
	"setta/internal/runtimeprovider"
)

func TestAdapterSDKAPICallCountsByOperation(t *testing.T) {
	identity := testManagedIdentity(t)
	serviceSpec := measurementServiceSpec()
	networkPolicy := measurementNetworkPolicy()

	tests := []struct {
		name       string
		runtimeSet bool
		invoke     func(*Adapter) error
		want       map[string]int
	}{
		{
			name: "Create fresh runtime",
			invoke: func(adapter *Adapter) error {
				_, err := adapter.Create(context.Background(), testCreateRequest(identity))
				return err
			},
			want: map[string]int{"FindRuntime": 2, "Create": 1},
		},
		{
			name:       "Inspect",
			runtimeSet: true,
			invoke: func(adapter *Adapter) error {
				_, _, err := adapter.Inspect(context.Background(), identity.Name)
				return err
			},
			want: map[string]int{"FindRuntime": 1},
		},
		{
			name:       "Suspend",
			runtimeSet: true,
			invoke: func(adapter *Adapter) error {
				return adapter.Suspend(context.Background(), identity.Name)
			},
			want: map[string]int{"FindRuntime": 1, "Suspend": 1},
		},
		{
			name:       "Exec",
			runtimeSet: true,
			invoke: func(adapter *Adapter) error {
				_, err := adapter.Exec(context.Background(), runtimeprovider.ExecRequest{
					RuntimeName: identity.Name,
					Path:        "/bin/true",
				})
				return err
			},
			want: map[string]int{"FindRuntime": 1, "Exec": 1},
		},
		{
			name:       "ConfigureURL",
			runtimeSet: true,
			invoke: func(adapter *Adapter) error {
				return adapter.ConfigureURL(
					context.Background(),
					identity.Name,
					runtimeprovider.URLAccessAuthenticated,
				)
			},
			want: map[string]int{"FindRuntime": 1, "ConfigureURL": 1},
		},
		{
			name:       "DialPrivateRuntime",
			runtimeSet: true,
			invoke: func(adapter *Adapter) error {
				connection, err := adapter.DialPrivateRuntime(
					context.Background(),
					identity.Name,
					"tcp",
					"127.0.0.1:7345",
				)
				if err != nil {
					return err
				}
				return connection.Close()
			},
			want: map[string]int{"FindRuntime": 1, "ProxySocket": 1},
		},
		{
			name:       "EnsureService",
			runtimeSet: true,
			invoke: func(adapter *Adapter) error {
				_, err := adapter.EnsureService(context.Background(), identity.Name, serviceSpec)
				return err
			},
			want: map[string]int{"FindRuntime": 1, "EnsureService": 1},
		},
		{
			name:       "InspectService",
			runtimeSet: true,
			invoke: func(adapter *Adapter) error {
				_, _, err := adapter.InspectService(context.Background(), identity.Name, serviceSpec.Name)
				return err
			},
			want: map[string]int{"FindRuntime": 1, "FindService": 1},
		},
		{
			name:       "ApplyNetworkPolicy",
			runtimeSet: true,
			invoke: func(adapter *Adapter) error {
				return adapter.ApplyNetworkPolicy(context.Background(), identity.Name, networkPolicy)
			},
			want: map[string]int{"FindRuntime": 1, "ApplyNetworkPolicy": 1},
		},
		{
			name:       "InspectNetworkPolicy",
			runtimeSet: true,
			invoke: func(adapter *Adapter) error {
				_, err := adapter.InspectNetworkPolicy(context.Background(), identity.Name)
				return err
			},
			want: map[string]int{"FindRuntime": 1, "InspectNetworkPolicy": 1},
		},
		{
			name:       "CreateCheckpoint",
			runtimeSet: true,
			invoke: func(adapter *Adapter) error {
				_, err := adapter.CreateCheckpoint(context.Background(), identity.Name, "measurement")
				return err
			},
			want: map[string]int{"FindRuntime": 1, "CreateCheckpoint": 1},
		},
		{
			name:       "InspectCheckpoint",
			runtimeSet: true,
			invoke: func(adapter *Adapter) error {
				_, _, err := adapter.InspectCheckpoint(context.Background(), identity.Name, "checkpoint-1")
				return err
			},
			want: map[string]int{"FindRuntime": 1, "FindCheckpoint": 1},
		},
		{
			name:       "RestoreCheckpoint",
			runtimeSet: true,
			invoke: func(adapter *Adapter) error {
				return adapter.RestoreCheckpoint(context.Background(), identity.Name, "checkpoint-1")
			},
			want: map[string]int{"FindRuntime": 1, "RestoreCheckpoint": 1},
		},
		{
			name:       "Destroy",
			runtimeSet: true,
			invoke: func(adapter *Adapter) error {
				return adapter.Destroy(context.Background(), identity.Name)
			},
			want: map[string]int{"FindRuntime": 1, "Destroy": 1},
		},
		{
			name:       "ServerVersion",
			runtimeSet: true,
			invoke: func(adapter *Adapter) error {
				_, err := adapter.ServerVersion(context.Background(), identity.Name)
				return err
			},
			want: map[string]int{"FindRuntime": 1, "ServerVersion": 1},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			client := newCountingFakeSDKAPI(t, identity, test.runtimeSet)
			if err := test.invoke(&Adapter{client: client}); err != nil {
				t.Fatalf("%s: %v", test.name, err)
			}
			assertSDKAPICallCounts(t, client.calls, test.want)
			t.Logf("total=%d breakdown=%s", totalSDKAPICalls(client.calls), formatSDKAPICallCounts(client.calls))
		})
	}
}

func TestRuntimeInstallLoopSDKAPICallCounts(t *testing.T) {
	identity := testManagedIdentity(t)
	artifact, archiveSHA256, binarySHA256 := makeMeasurementReleaseArtifact(t)
	client := newCountingFakeSDKAPI(t, identity, true)
	client.exec = measurementInstallExec(t, artifact, archiveSHA256, binarySHA256)
	adapter := &Adapter{client: client}

	result, err := (runtimeinstall.Loop{
		Provider: adapter,
		Verifier: measurementSignatureVerifier{},
		Now: func() time.Time {
			return time.Date(2026, 7, 25, 12, 0, 0, 0, time.UTC)
		},
		Sleep: func(context.Context, time.Duration) error {
			return nil
		},
	}).Install(context.Background(), runtimeinstall.InstallRequest{
		RuntimeName: identity.Name,
		Desired:     artifact,
	})
	if err != nil {
		t.Fatalf("Install: %v", err)
	}
	if result.Status != runtimeinstall.InstallStatusFresh || !result.Health.OK {
		t.Fatalf("install result = %#v", result)
	}

	want := map[string]int{
		"FindRuntime":   22,
		"Exec":          21,
		"EnsureService": 1,
	}
	assertSDKAPICallCounts(t, client.calls, want)
	t.Logf("total=%d breakdown=%s", totalSDKAPICalls(client.calls), formatSDKAPICallCounts(client.calls))
}

func newCountingFakeSDKAPI(
	t *testing.T,
	identity runtimeprovider.ManagedIdentity,
	runtimeSet bool,
) *fakeSDKAPI {
	t.Helper()
	serviceSpec := measurementServiceSpec()
	providerPolicy, err := mapNetworkPolicyToSDK(measurementNetworkPolicy())
	if err != nil {
		t.Fatalf("map measurement network policy: %v", err)
	}
	runtimeExists := runtimeSet
	client := &fakeSDKAPI{calls: make(map[string]int)}
	client.create = func(context.Context, string, []string, runtimeprovider.RuntimeResources) error {
		runtimeExists = true
		return nil
	}
	client.findRuntime = func(context.Context, string) (*spritessdk.SpriteInfo, bool, error) {
		if !runtimeExists {
			return nil, false, nil
		}
		return testRuntimeInfo(identity, "running"), true, nil
	}
	client.exec = func(context.Context, runtimeprovider.ExecRequest) (runtimeprovider.ExecResult, error) {
		return runtimeprovider.ExecResult{}, nil
	}
	client.configureURL = func(context.Context, string, string) error {
		return nil
	}
	client.proxySocket = func(context.Context, string, string, string) (net.Conn, error) {
		connection, peer := net.Pipe()
		if err := peer.Close(); err != nil {
			t.Fatalf("close fake proxy peer: %v", err)
		}
		return connection, nil
	}
	client.ensureService = func(
		_ context.Context,
		_ string,
		spec runtimeprovider.ServiceSpec,
	) (*spritessdk.ServiceWithState, error) {
		return measurementSDKService(t, spec), nil
	}
	client.findService = func(
		context.Context,
		string,
		string,
	) (*spritessdk.ServiceWithState, bool, error) {
		return measurementSDKService(t, serviceSpec), true, nil
	}
	client.applyPolicy = func(context.Context, string, *spritessdk.NetworkPolicy) error {
		return nil
	}
	client.inspectPolicy = func(context.Context, string) (*spritessdk.NetworkPolicy, error) {
		return providerPolicy, nil
	}
	client.createCP = func(context.Context, string, string) (*spritessdk.Checkpoint, error) {
		return &spritessdk.Checkpoint{ID: "checkpoint-1"}, nil
	}
	client.findCP = func(context.Context, string, string) (*spritessdk.Checkpoint, bool, error) {
		return &spritessdk.Checkpoint{ID: "checkpoint-1"}, true, nil
	}
	client.restoreCP = func(context.Context, string, string) error {
		return nil
	}
	client.suspend = func(context.Context, string) error {
		return nil
	}
	client.destroy = func(context.Context, string) error {
		return nil
	}
	client.serverVersion = func(context.Context, string) (string, error) {
		return "measurement-version", nil
	}
	return client
}

func measurementServiceSpec() runtimeprovider.ServiceSpec {
	port := 7345
	return runtimeprovider.ServiceSpec{
		Name:      "setta-runtime",
		Path:      "/var/lib/setta/runtime-install/releases/measurement/setta",
		Arguments: []string{"serve", "--port", "7345"},
		HTTPPort:  &port,
		RunAs: runtimeprovider.ServiceIdentity{
			User:  "root",
			Group: "root",
		},
	}
}

func measurementSDKService(t *testing.T, spec runtimeprovider.ServiceSpec) *spritessdk.ServiceWithState {
	t.Helper()
	request, err := mapServiceSpecToSDK(spec)
	if err != nil {
		t.Fatalf("map service spec: %v", err)
	}
	return &spritessdk.ServiceWithState{
		Service: spritessdk.Service{
			Name:     spec.Name,
			Cmd:      request.Cmd,
			Args:     slices.Clone(request.Args),
			Needs:    slices.Clone(request.Needs),
			HTTPPort: request.HTTPPort,
		},
		State: &spritessdk.ServiceState{Status: "running", PID: 25},
	}
}

func measurementNetworkPolicy() runtimeprovider.NetworkPolicy {
	return runtimeprovider.NetworkPolicy{Rules: []runtimeprovider.NetworkRule{{
		Domain: "github.com",
		Action: runtimeprovider.NetworkRuleAllow,
	}}}
}

func assertSDKAPICallCounts(t *testing.T, got map[string]int, want map[string]int) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Fatalf(
			"sdkAPI calls = total %d, %s; want total %d, %s",
			totalSDKAPICalls(got),
			formatSDKAPICallCounts(got),
			totalSDKAPICalls(want),
			formatSDKAPICallCounts(want),
		)
	}
}

func totalSDKAPICalls(calls map[string]int) int {
	total := 0
	for _, count := range calls {
		total += count
	}
	return total
}

func formatSDKAPICallCounts(calls map[string]int) string {
	methods := make([]string, 0, len(calls))
	for method := range calls {
		methods = append(methods, method)
	}
	slices.Sort(methods)
	parts := make([]string, 0, len(methods))
	for _, method := range methods {
		parts = append(parts, fmt.Sprintf("%s=%d", method, calls[method]))
	}
	return strings.Join(parts, ", ")
}

type measurementSignatureVerifier struct{}

func (measurementSignatureVerifier) VerifyReleaseSignature(
	context.Context,
	runtimeinstall.SignatureVerificationRequest,
) error {
	return nil
}

func makeMeasurementReleaseArtifact(t *testing.T) (runtimeinstall.ReleaseArtifact, string, string) {
	t.Helper()
	const (
		version     = "measurement"
		artifactDir = "setta_measurement_linux_amd64"
	)
	tempDir := t.TempDir()
	archiveName := artifactDir + ".tar.gz"
	archivePath := filepath.Join(tempDir, archiveName)
	binaryPayload := []byte("measurement runtime\n")

	var archive bytes.Buffer
	gzipWriter := gzip.NewWriter(&archive)
	tarWriter := tar.NewWriter(gzipWriter)
	if err := tarWriter.WriteHeader(&tar.Header{
		Name: artifactDir + "/setta",
		Mode: 0o755,
		Size: int64(len(binaryPayload)),
	}); err != nil {
		t.Fatalf("write tar header: %v", err)
	}
	if _, err := tarWriter.Write(binaryPayload); err != nil {
		t.Fatalf("write tar payload: %v", err)
	}
	if err := tarWriter.Close(); err != nil {
		t.Fatalf("close tar: %v", err)
	}
	if err := gzipWriter.Close(); err != nil {
		t.Fatalf("close gzip: %v", err)
	}
	if err := os.WriteFile(archivePath, archive.Bytes(), 0o600); err != nil {
		t.Fatalf("write archive: %v", err)
	}

	archiveSHA256 := fmt.Sprintf("%x", sha256.Sum256(archive.Bytes()))
	binarySHA256 := fmt.Sprintf("%x", sha256.Sum256(binaryPayload))
	checksumsPath := filepath.Join(tempDir, "SHA256SUMS")
	checksums := fmt.Sprintf(
		"%s  %s\n%s  %s/setta\n",
		archiveSHA256,
		archiveName,
		binarySHA256,
		artifactDir,
	)
	if err := os.WriteFile(checksumsPath, []byte(checksums), 0o600); err != nil {
		t.Fatalf("write checksums: %v", err)
	}
	signaturePath := filepath.Join(tempDir, "SHA256SUMS.minisig")
	if err := os.WriteFile(signaturePath, []byte("measurement signature\n"), 0o600); err != nil {
		t.Fatalf("write signature: %v", err)
	}
	return runtimeinstall.ReleaseArtifact{
		Version:       version,
		OS:            "linux",
		Arch:          "amd64",
		ArchivePath:   archivePath,
		ChecksumsPath: checksumsPath,
		SignaturePath: signaturePath,
		PublicKey:     "measurement-public-key",
	}, archiveSHA256, binarySHA256
}

func measurementInstallExec(
	t *testing.T,
	artifact runtimeinstall.ReleaseArtifact,
	archiveSHA256 string,
	binarySHA256 string,
) func(context.Context, runtimeprovider.ExecRequest) (runtimeprovider.ExecResult, error) {
	t.Helper()
	return func(_ context.Context, request runtimeprovider.ExecRequest) (runtimeprovider.ExecResult, error) {
		switch request.Path {
		case "/usr/bin/test":
			return runtimeprovider.ExecResult{ExitCode: 1}, nil
		case "/usr/bin/sha256sum":
			if len(request.Arguments) != 1 {
				t.Fatalf("sha256sum arguments = %q", request.Arguments)
			}
			checksum := binarySHA256
			if strings.HasSuffix(request.Arguments[0], filepath.Base(artifact.ArchivePath)) {
				checksum = archiveSHA256
			}
			return runtimeprovider.ExecResult{
				Stdout: []byte(checksum + "  " + request.Arguments[0] + "\n"),
			}, nil
		case "/usr/bin/curl":
			if len(request.Arguments) != 2 {
				t.Fatalf("curl arguments = %q", request.Arguments)
			}
			var payload any
			if strings.HasSuffix(request.Arguments[1], "/runtime/info") {
				payload = httpapi.RuntimeInfoResponse{
					RuntimeID:       "0123456789abcdef0123456789abcdef",
					DisplayName:     "Measurement runtime",
					BackendName:     httpapi.BackendName,
					BackendVersion:  artifact.Version,
					ProtocolVersion: httpapi.ProtocolVersion,
				}
			} else {
				payload = httpapi.BackendHealth{
					OK:              true,
					Name:            httpapi.BackendName,
					Version:         artifact.Version,
					ProtocolVersion: httpapi.ProtocolVersion,
				}
			}
			stdout, err := json.Marshal(payload)
			if err != nil {
				t.Fatalf("marshal health response: %v", err)
			}
			return runtimeprovider.ExecResult{Stdout: stdout}, nil
		default:
			return runtimeprovider.ExecResult{}, nil
		}
	}
}
