package hostedmeasurement

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"setta/internal/controlplane"
)

const (
	candidateBLifecycleReportSchemaVersion = 1
	candidateBLifecycleReportFileName      = "candidate-b-lifecycle-report.json"
	replacementCredentialFileName          = "replacement-client-credential.json"
	maximumRateLimitProbeRequests          = 241
	newRequestRevocationBudget             = 5 * time.Second
	establishedStreamRevocationBudget      = 10 * time.Second
)

type CandidateBLifecycleWorkload struct {
	Fly        HostedFlyMachineExecutor
	HTTPClient *http.Client
	Now        func() time.Time
	State      *StateStore
	baseURL    string
}

type CandidateBLifecycleReport struct {
	SchemaVersion             int     `json:"schema_version"`
	RunID                     string  `json:"run_id"`
	RotationPassed            bool    `json:"rotation_passed"`
	RevokedRequestMS          float64 `json:"revoked_request_ms"`
	RevokedStreamMS           float64 `json:"revoked_stream_ms"`
	RevocationPassed          bool    `json:"revocation_passed"`
	SuspendedRequestMS        float64 `json:"suspended_request_ms"`
	SuspendedStreamMS         float64 `json:"suspended_stream_ms"`
	SuspensionPassed          bool    `json:"suspension_passed"`
	ResumePassed              bool    `json:"resume_passed"`
	RateLimitedAfterRequests  int     `json:"rate_limited_after_requests"`
	RateLimitPassed           bool    `json:"rate_limit_passed"`
	CredentialRedactionPassed bool    `json:"credential_redaction_passed"`
	Passed                    bool    `json:"passed"`
	MeasuredAt                string  `json:"measured_at"`
}

type lifecycleTimings struct {
	revokedRequest   time.Duration
	revokedStream    time.Duration
	suspendedRequest time.Duration
	suspendedStream  time.Duration
}

func (workload CandidateBLifecycleWorkload) Execute(
	ctx context.Context,
	authorization Authorization,
	runtime HostedRuntime,
	bootstrap ControlPlaneBootstrapResult,
) error {
	workload = workload.withDefaults()
	reportPath := filepath.Join(authorization.StateDirectory, candidateBLifecycleReportFileName)
	if reused, err := reuseCandidateBLifecycleReport(reportPath, authorization); reused || err != nil {
		return err
	}
	admin, original, replacement, reportPath, err := workload.prepare(authorization, runtime, bootstrap)
	if err != nil {
		return err
	}
	return workload.execute(ctx, authorization, admin, original, replacement, reportPath)
}

func (workload CandidateBLifecycleWorkload) execute(
	ctx context.Context,
	authorization Authorization,
	admin HostedLifecycleAdmin,
	original controlplane.DeviceCredential,
	replacement controlplane.DeviceCredential,
	reportPath string,
) error {
	client := workload.measurementClient()
	baseURL := workload.measurementBaseURL(authorization)
	if err := admin.EnsureDevice(ctx, authorization, replacement); err != nil {
		return err
	}
	if err := requireLifecycleStatus(ctx, client, baseURL, replacement.Token, http.StatusOK, original.Token, replacement.Token); err != nil {
		return errors.New("hosted lifecycle replacement credential was not authorized")
	}
	timings, err := workload.measureRevocationAndSuspension(ctx, client, baseURL, authorization, admin, original, replacement)
	if err != nil {
		return err
	}
	rateLimitedAfter, err := measureRateLimit(ctx, client, baseURL, replacement.Token)
	if err != nil {
		return err
	}
	report := buildCandidateBLifecycleReport(authorization, timings, rateLimitedAfter, workload.Now())
	if err := writeCandidateBLifecycleReport(reportPath, report); err != nil {
		return err
	}
	if !report.Passed {
		return errors.New("Candidate B lifecycle workload exceeded an adopted access budget")
	}
	return nil
}

func (workload CandidateBLifecycleWorkload) measureRevocationAndSuspension(
	ctx context.Context,
	client *http.Client,
	baseURL string,
	authorization Authorization,
	admin HostedLifecycleAdmin,
	original controlplane.DeviceCredential,
	replacement controlplane.DeviceCredential,
) (lifecycleTimings, error) {
	revokedRequest, revokedStream, err := measureDeviceRevocation(ctx, client, baseURL, authorization, admin, original)
	if err != nil {
		return lifecycleTimings{}, err
	}
	suspendedRequest, suspendedStream, err := measureUserSuspension(ctx, client, baseURL, authorization, admin, replacement)
	if err != nil {
		return lifecycleTimings{}, err
	}
	return lifecycleTimings{
		revokedRequest: revokedRequest, revokedStream: revokedStream,
		suspendedRequest: suspendedRequest, suspendedStream: suspendedStream,
	}, nil
}

func (workload CandidateBLifecycleWorkload) prepare(
	authorization Authorization,
	runtime HostedRuntime,
	bootstrap ControlPlaneBootstrapResult,
) (HostedLifecycleAdmin, controlplane.DeviceCredential, controlplane.DeviceCredential, string, error) {
	if workload.Fly == nil || workload.State == nil || workload.HTTPClient.Timeout <= 0 {
		return HostedLifecycleAdmin{}, controlplane.DeviceCredential{}, controlplane.DeviceCredential{}, "",
			errors.New("Candidate B lifecycle workload requires Fly exec, durable state, and a bounded HTTP client")
	}
	machine, runtimeName, err := bootstrapResources(workload.State.Snapshot(), runtime)
	if err != nil {
		return HostedLifecycleAdmin{}, controlplane.DeviceCredential{}, controlplane.DeviceCredential{}, "", err
	}
	original, found, err := loadLocalClientCredential(bootstrap.ClientCredentialPath)
	if err != nil || !found || original.DeviceID != bootstrap.DeviceID {
		return HostedLifecycleAdmin{}, controlplane.DeviceCredential{}, controlplane.DeviceCredential{}, "",
			errors.New("Candidate B lifecycle credential differs from durable bootstrap")
	}
	replacementPath := filepath.Join(authorization.StateDirectory, replacementCredentialFileName)
	replacement, err := ensureReplacementCredential(replacementPath)
	if err != nil || replacement.DeviceID == original.DeviceID {
		return HostedLifecycleAdmin{}, controlplane.DeviceCredential{}, controlplane.DeviceCredential{}, "",
			errors.New("Candidate B replacement credential is invalid")
	}
	admin := HostedLifecycleAdmin{Fly: workload.Fly, MachineID: machine.ID, RuntimeName: runtimeName}
	return admin, original, replacement, filepath.Join(authorization.StateDirectory, candidateBLifecycleReportFileName), nil
}

func (workload CandidateBLifecycleWorkload) withDefaults() CandidateBLifecycleWorkload {
	if workload.Now == nil {
		workload.Now = time.Now
	}
	if workload.HTTPClient == nil {
		workload.HTTPClient = &http.Client{Timeout: 20 * time.Second}
	}
	return workload
}

func (workload CandidateBLifecycleWorkload) measurementClient() *http.Client {
	traffic := CandidateBWorkload{HTTPClient: workload.HTTPClient}
	return traffic.measurementClient()
}

func (workload CandidateBLifecycleWorkload) measurementBaseURL(authorization Authorization) string {
	traffic := CandidateBWorkload{baseURL: workload.baseURL}
	return traffic.measurementBaseURL(authorization)
}

func ensureReplacementCredential(path string) (controlplane.DeviceCredential, error) {
	credential, found, err := loadLocalClientCredential(path)
	if err != nil || found {
		return credential, err
	}
	credential, err = controlplane.NewDeviceCredential()
	if err != nil {
		return controlplane.DeviceCredential{}, errors.New("generate Candidate B replacement credential failed")
	}
	if err := writeLocalClientCredential(path, credential); err != nil {
		return controlplane.DeviceCredential{}, err
	}
	return credential, nil
}

func measureDeviceRevocation(
	ctx context.Context,
	client *http.Client,
	baseURL string,
	authorization Authorization,
	admin HostedLifecycleAdmin,
	credential controlplane.DeviceCredential,
) (time.Duration, time.Duration, error) {
	stream, err := openLifecycleEventStream(ctx, client, baseURL, credential.Token)
	if err != nil {
		return 0, 0, err
	}
	defer stream.Close()
	started := time.Now()
	if err := admin.RevokeDevice(ctx, authorization, credential.DeviceID); err != nil {
		return 0, 0, err
	}
	if err := requireLifecycleStatus(ctx, client, baseURL, credential.Token, http.StatusUnauthorized, credential.Token); err != nil {
		return 0, 0, errors.New("revoked Candidate B request was not denied")
	}
	requestDuration := time.Since(started)
	streamDuration, err := stream.WaitForClose(ctx, started, establishedStreamRevocationBudget)
	if err != nil {
		return 0, 0, err
	}
	return requestDuration, streamDuration, nil
}

func measureUserSuspension(
	ctx context.Context,
	client *http.Client,
	baseURL string,
	authorization Authorization,
	admin HostedLifecycleAdmin,
	credential controlplane.DeviceCredential,
) (time.Duration, time.Duration, error) {
	stream, err := openLifecycleEventStream(ctx, client, baseURL, credential.Token)
	if err != nil {
		return 0, 0, err
	}
	defer stream.Close()
	started := time.Now()
	if err := admin.SetUserStatus(ctx, authorization, controlplane.UserStatusSuspended); err != nil {
		return 0, 0, err
	}
	if err := requireLifecycleStatus(ctx, client, baseURL, credential.Token, http.StatusForbidden, credential.Token); err != nil {
		return 0, 0, errors.New("suspended Candidate B request was not denied")
	}
	requestDuration := time.Since(started)
	streamDuration, err := stream.WaitForClose(ctx, started, establishedStreamRevocationBudget)
	if err != nil {
		return 0, 0, err
	}
	if err := admin.SetUserStatus(ctx, authorization, controlplane.UserStatusActive); err != nil {
		return 0, 0, err
	}
	if err := requireLifecycleStatus(ctx, client, baseURL, credential.Token, http.StatusOK, credential.Token); err != nil {
		return 0, 0, errors.New("resumed Candidate B request was not authorized")
	}
	return requestDuration, streamDuration, nil
}

func requireLifecycleStatus(
	ctx context.Context,
	client *http.Client,
	baseURL string,
	credential string,
	want int,
	forbidden ...string,
) error {
	status, body, err := lifecycleRequest(ctx, client, baseURL+"/workspace-session", credential)
	if err != nil || status != want || containsCredential(body, forbidden) {
		return errors.New("Candidate B lifecycle request returned an unexpected status")
	}
	return nil
}

func measureRateLimit(ctx context.Context, client *http.Client, baseURL string, credential string) (int, error) {
	for requestNumber := 1; requestNumber <= maximumRateLimitProbeRequests; requestNumber++ {
		status, body, err := lifecycleRequest(ctx, client, baseURL+"/workspace-session", credential)
		if err != nil {
			return 0, err
		}
		if containsCredential(body, []string{credential}) {
			return 0, errors.New("Candidate B rate-limit response exposed credential material")
		}
		switch status {
		case http.StatusOK:
		case http.StatusTooManyRequests:
			return requestNumber, nil
		default:
			return 0, errors.New("Candidate B rate-limit probe returned an unexpected status")
		}
	}
	return 0, errors.New("Candidate B rate limit was not observed within the bounded request count")
}

func lifecycleRequest(
	ctx context.Context,
	client *http.Client,
	requestURL string,
	credential string,
) (int, []byte, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return 0, nil, errors.New("build Candidate B lifecycle request failed")
	}
	request.Header.Set("Authorization", "Bearer "+credential)
	response, err := client.Do(request)
	if err != nil {
		return 0, nil, errors.New("Candidate B lifecycle request transport failed")
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, maximumMeasuredResponseBytes+1))
	if err != nil || len(body) > maximumMeasuredResponseBytes {
		return 0, nil, errors.New("Candidate B lifecycle response exceeded the bounded body contract")
	}
	return response.StatusCode, body, nil
}

func containsCredential(body []byte, credentials []string) bool {
	for _, credential := range credentials {
		if credential != "" && bytes.Contains(body, []byte(credential)) {
			return true
		}
	}
	return false
}

type lifecycleEventStream struct {
	cancel context.CancelFunc
	closed chan struct{}
}

func openLifecycleEventStream(
	ctx context.Context,
	client *http.Client,
	baseURL string,
	credential string,
) (*lifecycleEventStream, error) {
	streamCtx, cancel := context.WithCancel(ctx)
	request, err := http.NewRequestWithContext(streamCtx, http.MethodGet, baseURL+"/codex/account/events", nil)
	if err != nil {
		cancel()
		return nil, errors.New("build Candidate B lifecycle SSE request failed")
	}
	request.Header.Set("Authorization", "Bearer "+credential)
	response, err := client.Do(request)
	if err != nil {
		cancel()
		return nil, errors.New("Candidate B lifecycle SSE transport failed")
	}
	if response.StatusCode != http.StatusOK || !strings.HasPrefix(response.Header.Get("Content-Type"), "text/event-stream") {
		_ = response.Body.Close()
		cancel()
		return nil, errors.New("Candidate B lifecycle SSE response differs from the event-stream contract")
	}
	reader := bufio.NewReader(response.Body)
	for lines := 0; lines < 256; lines++ {
		line, readErr := reader.ReadString('\n')
		if readErr != nil {
			_ = response.Body.Close()
			cancel()
			return nil, errors.New("Candidate B lifecycle SSE ended before its first data event")
		}
		if strings.HasPrefix(line, "data:") {
			stream := &lifecycleEventStream{cancel: cancel, closed: make(chan struct{})}
			go func() {
				_, _ = io.Copy(io.Discard, reader)
				_ = response.Body.Close()
				close(stream.closed)
			}()
			return stream, nil
		}
	}
	_ = response.Body.Close()
	cancel()
	return nil, errors.New("Candidate B lifecycle SSE exceeded the bounded first-event prelude")
}

func (stream *lifecycleEventStream) WaitForClose(
	ctx context.Context,
	started time.Time,
	budget time.Duration,
) (time.Duration, error) {
	remaining := budget - time.Since(started)
	if remaining <= 0 {
		return 0, errors.New("Candidate B established SSE exceeded the revocation budget")
	}
	timer := time.NewTimer(remaining)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return 0, ctx.Err()
	case <-timer.C:
		return 0, errors.New("Candidate B established SSE exceeded the revocation budget")
	case <-stream.closed:
		return time.Since(started), nil
	}
}

func (stream *lifecycleEventStream) Close() {
	stream.cancel()
	<-stream.closed
}

func buildCandidateBLifecycleReport(
	authorization Authorization,
	timings lifecycleTimings,
	rateLimitedAfter int,
	measuredAt time.Time,
) CandidateBLifecycleReport {
	revocationPassed := timings.revokedRequest <= newRequestRevocationBudget &&
		timings.revokedStream <= establishedStreamRevocationBudget
	suspensionPassed := timings.suspendedRequest <= newRequestRevocationBudget &&
		timings.suspendedStream <= establishedStreamRevocationBudget
	return CandidateBLifecycleReport{
		SchemaVersion: candidateBLifecycleReportSchemaVersion, RunID: authorization.Manifest.RunID,
		RotationPassed: true, RevokedRequestMS: milliseconds(timings.revokedRequest),
		RevokedStreamMS: milliseconds(timings.revokedStream), RevocationPassed: revocationPassed,
		SuspendedRequestMS: milliseconds(timings.suspendedRequest), SuspendedStreamMS: milliseconds(timings.suspendedStream),
		SuspensionPassed: suspensionPassed, ResumePassed: true,
		RateLimitedAfterRequests: rateLimitedAfter, RateLimitPassed: rateLimitedAfter > 0,
		CredentialRedactionPassed: true,
		Passed:                    revocationPassed && suspensionPassed && rateLimitedAfter > 0,
		MeasuredAt:                measuredAt.UTC().Format(time.RFC3339Nano),
	}
}

func reuseCandidateBLifecycleReport(path string, authorization Authorization) (bool, error) {
	data, err := readPrivateRegularFile(path, maximumBootstrapEventBytes, "Candidate B lifecycle report")
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if err := rejectDuplicateJSONFields(data); err != nil {
		return false, errors.New("existing Candidate B lifecycle report has duplicate fields")
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var report CandidateBLifecycleReport
	if err := decoder.Decode(&report); err != nil || decoder.Decode(&struct{}{}) != io.EOF ||
		report.SchemaVersion != candidateBLifecycleReportSchemaVersion || report.RunID != authorization.Manifest.RunID || !report.Passed {
		return false, errors.New("existing Candidate B lifecycle report is invalid or incomplete")
	}
	return true, nil
}

func writeCandidateBLifecycleReport(path string, report CandidateBLifecycleReport) error {
	temporary, err := os.CreateTemp(filepath.Dir(path), ".candidate-b-lifecycle-report-*")
	if err != nil {
		return errors.New("create Candidate B lifecycle report failed")
	}
	temporaryPath := temporary.Name()
	installed := false
	defer func() {
		if !installed {
			_ = temporary.Close()
			_ = os.Remove(temporaryPath)
		}
	}()
	if err := temporary.Chmod(0o600); err != nil {
		return errors.New("protect Candidate B lifecycle report failed")
	}
	encoder := json.NewEncoder(temporary)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(report); err != nil {
		return errors.New("encode Candidate B lifecycle report failed")
	}
	if err := temporary.Sync(); err != nil {
		return errors.New("persist Candidate B lifecycle report failed")
	}
	if err := temporary.Close(); err != nil {
		return errors.New("close Candidate B lifecycle report failed")
	}
	if err := os.Rename(temporaryPath, path); err != nil {
		return errors.New("publish Candidate B lifecycle report failed")
	}
	installed = true
	return syncPrivateDirectory(filepath.Dir(path))
}
