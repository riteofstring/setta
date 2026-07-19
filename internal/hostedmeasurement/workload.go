package hostedmeasurement

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"setta/internal/runtimeprovider"
)

const (
	candidateBReportSchemaVersion = 1
	candidateBMeasurementCount    = 20
	candidateBReportFileName      = "candidate-b-report.json"
	maximumMeasuredResponseBytes  = 1024 * 1024
	coldAuthenticatedBudget       = 2500 * time.Millisecond
	interactiveAccessBudget       = 250 * time.Millisecond
	reconnectBudget               = 3 * time.Second
)

type HostedSpriteWakeController interface {
	Inspect(context.Context, string) (runtimeprovider.RuntimeObservation, bool, error)
	Suspend(context.Context, string) error
}

type CandidateBWorkload struct {
	HTTPClient *http.Client
	Now        func() time.Time
	Provider   HostedSpriteWakeController
	Sleep      func(context.Context, time.Duration) error
	baseURL    string
}

type CandidateBReport struct {
	SchemaVersion                 int     `json:"schema_version"`
	RunID                         string  `json:"run_id"`
	FlyRegion                     string  `json:"fly_region"`
	SpritePlacement               string  `json:"sprite_placement,omitempty"`
	MeasurementsPerPath           int     `json:"measurements_per_path"`
	ColdAuthenticatedP95MS        float64 `json:"cold_authenticated_p95_ms"`
	InteractiveHTTPP95MS          float64 `json:"interactive_http_p95_ms"`
	SSEFirstEventP95MS            float64 `json:"sse_first_event_p95_ms"`
	ReconnectP95MS                float64 `json:"reconnect_p95_ms"`
	UnauthenticatedStatus         int     `json:"unauthenticated_status"`
	UnauthenticatedOpenedRuntime  bool    `json:"unauthenticated_opened_runtime"`
	ColdAuthenticatedWithinBudget bool    `json:"cold_authenticated_within_budget"`
	InteractiveWithinBudget       bool    `json:"interactive_within_budget"`
	ReconnectWithinBudget         bool    `json:"reconnect_within_budget"`
	Passed                        bool    `json:"passed"`
	MeasuredAt                    string  `json:"measured_at"`
}

func (workload CandidateBWorkload) Execute(
	ctx context.Context,
	authorization Authorization,
	runtime HostedRuntime,
	bootstrap ControlPlaneBootstrapResult,
) error {
	workload = workload.withDefaults()
	if err := workload.validate(authorization, runtime, bootstrap); err != nil {
		return err
	}
	reportPath := filepath.Join(authorization.StateDirectory, candidateBReportFileName)
	if reused, err := reuseCandidateBReport(reportPath, authorization); reused || err != nil {
		return err
	}
	return workload.executeMeasurements(ctx, authorization, runtime, bootstrap, reportPath)
}

func (workload CandidateBWorkload) executeMeasurements(
	ctx context.Context,
	authorization Authorization,
	runtime HostedRuntime,
	bootstrap ControlPlaneBootstrapResult,
	reportPath string,
) error {
	credential, found, err := loadLocalClientCredential(bootstrap.ClientCredentialPath)
	if err != nil || !found || credential.DeviceID != bootstrap.DeviceID {
		return errors.New("Candidate B workload client credential differs from durable bootstrap")
	}
	client := workload.measurementClient()
	baseURL := workload.measurementBaseURL(authorization)
	unauthenticatedStatus, openedRuntime, err := workload.measureUnauthenticatedWake(ctx, client, baseURL, runtime.Sprite.Observation.Name)
	if err != nil {
		return err
	}
	cold, err := measureHTTP(ctx, client, baseURL, credential.Token, true)
	if err != nil {
		return err
	}
	interactive, err := measureHTTP(ctx, client, baseURL, credential.Token, false)
	if err != nil {
		return err
	}
	sse, err := measureSSE(ctx, client, baseURL, credential.Token)
	if err != nil {
		return err
	}
	report := buildCandidateBReport(authorization, runtime, unauthenticatedStatus, openedRuntime, cold, interactive, sse, workload.Now())
	if err := writeCandidateBReport(reportPath, report); err != nil {
		return err
	}
	if !report.Passed {
		return errors.New("Candidate B hosted workload exceeded an adopted access or wake budget")
	}
	return nil
}

func (workload CandidateBWorkload) withDefaults() CandidateBWorkload {
	if workload.Now == nil {
		workload.Now = time.Now
	}
	if workload.Sleep == nil {
		workload.Sleep = sleepCandidateBWithContext
	}
	if workload.HTTPClient == nil {
		workload.HTTPClient = &http.Client{Timeout: 20 * time.Second}
	}
	return workload
}

func sleepCandidateBWithContext(ctx context.Context, duration time.Duration) error {
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func (workload CandidateBWorkload) validate(
	authorization Authorization,
	runtime HostedRuntime,
	bootstrap ControlPlaneBootstrapResult,
) error {
	if workload.Provider == nil || workload.HTTPClient.Timeout <= 0 {
		return errors.New("Candidate B workload requires a Sprite controller and bounded HTTP client")
	}
	if runtime.Sprite.Observation.Name == "" || bootstrap.DeviceID == "" ||
		filepath.Clean(bootstrap.ClientCredentialPath) != filepath.Join(authorization.StateDirectory, clientCredentialFileName) {
		return errors.New("Candidate B workload requires exact prepared runtime and bootstrap identities")
	}
	if _, err := url.ParseRequestURI(workload.measurementBaseURL(authorization)); err != nil {
		return errors.New("Candidate B workload base URL is invalid")
	}
	return nil
}

func (workload CandidateBWorkload) measurementClient() *http.Client {
	client := *workload.HTTPClient
	client.CheckRedirect = func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	}
	return &client
}

func (workload CandidateBWorkload) measurementBaseURL(authorization Authorization) string {
	if workload.baseURL != "" {
		return strings.TrimRight(workload.baseURL, "/")
	}
	return "https://" + authorization.Manifest.FlyAppName + ".fly.dev"
}

func (workload CandidateBWorkload) measureUnauthenticatedWake(
	ctx context.Context,
	client *http.Client,
	baseURL string,
	runtimeName string,
) (int, bool, error) {
	before, err := workload.prepareUnauthenticatedWakeProbe(ctx, runtimeName)
	if err != nil {
		return 0, false, err
	}
	status, _, err := measuredRequest(ctx, client, http.MethodGet, baseURL+"/workspace-session", "")
	if err != nil {
		return 0, false, err
	}
	return workload.completeUnauthenticatedWakeProbe(ctx, runtimeName, status, before)
}

func (workload CandidateBWorkload) prepareUnauthenticatedWakeProbe(
	ctx context.Context,
	runtimeName string,
) (runtimeprovider.RuntimeObservation, error) {
	if err := workload.Provider.Suspend(ctx, runtimeName); err != nil {
		return runtimeprovider.RuntimeObservation{}, errors.New("suspend Sprite before unauthenticated wake probe failed")
	}
	if err := workload.Sleep(ctx, 2*time.Second); err != nil {
		return runtimeprovider.RuntimeObservation{}, err
	}
	return workload.inspectCold(ctx, runtimeName)
}

func (workload CandidateBWorkload) completeUnauthenticatedWakeProbe(
	ctx context.Context,
	runtimeName string,
	status int,
	before runtimeprovider.RuntimeObservation,
) (int, bool, error) {
	if err := workload.Sleep(ctx, time.Second); err != nil {
		return 0, false, err
	}
	after, found, err := workload.Provider.Inspect(ctx, runtimeName)
	if err != nil || !found {
		return 0, false, errors.New("inspect Sprite after unauthenticated wake probe failed")
	}
	opened := before.Activity != runtimeprovider.RuntimeActivityActive && after.Activity == runtimeprovider.RuntimeActivityActive
	if status != http.StatusUnauthorized || opened {
		return status, opened, errors.New("unauthenticated Candidate B request was not denied before Sprite wake")
	}
	return status, false, nil
}

func (workload CandidateBWorkload) inspectCold(ctx context.Context, runtimeName string) (runtimeprovider.RuntimeObservation, error) {
	observation, found, err := workload.Provider.Inspect(ctx, runtimeName)
	if err != nil || !found || observation.Activity == runtimeprovider.RuntimeActivityActive {
		return runtimeprovider.RuntimeObservation{}, errors.New("Sprite did not confirm a non-active state before unauthenticated wake probe")
	}
	return observation, nil
}

func measureHTTP(ctx context.Context, client *http.Client, baseURL string, credential string, coldConnections bool) ([]time.Duration, error) {
	measurements := make([]time.Duration, 0, candidateBMeasurementCount)
	for range candidateBMeasurementCount {
		if coldConnections {
			client.CloseIdleConnections()
		}
		status, duration, err := measuredRequest(ctx, client, http.MethodGet, baseURL+"/workspace-session", credential)
		if err != nil {
			return nil, err
		}
		if status != http.StatusOK {
			return nil, errors.New("authenticated Candidate B HTTP request returned a non-OK status")
		}
		measurements = append(measurements, duration)
	}
	return measurements, nil
}

func measureSSE(ctx context.Context, client *http.Client, baseURL string, credential string) ([]time.Duration, error) {
	measurements := make([]time.Duration, 0, candidateBMeasurementCount)
	for range candidateBMeasurementCount {
		client.CloseIdleConnections()
		duration, err := measureFirstSSEEvent(ctx, client, baseURL+"/codex/account/events", credential)
		if err != nil {
			return nil, err
		}
		measurements = append(measurements, duration)
	}
	return measurements, nil
}

func measuredRequest(
	ctx context.Context,
	client *http.Client,
	method string,
	requestURL string,
	credential string,
) (int, time.Duration, error) {
	request, err := http.NewRequestWithContext(ctx, method, requestURL, nil)
	if err != nil {
		return 0, 0, errors.New("build Candidate B request failed")
	}
	if credential != "" {
		request.Header.Set("Authorization", "Bearer "+credential)
	}
	started := time.Now()
	response, err := client.Do(request)
	duration := time.Since(started)
	if err != nil {
		return 0, 0, errors.New("Candidate B request transport failed")
	}
	defer response.Body.Close()
	size, err := io.Copy(io.Discard, io.LimitReader(response.Body, maximumMeasuredResponseBytes+1))
	if err != nil || size > maximumMeasuredResponseBytes {
		return 0, 0, errors.New("Candidate B response exceeded the bounded body contract")
	}
	return response.StatusCode, duration, nil
}

func measureFirstSSEEvent(ctx context.Context, client *http.Client, requestURL string, credential string) (time.Duration, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return 0, errors.New("build Candidate B SSE request failed")
	}
	request.Header.Set("Authorization", "Bearer "+credential)
	started := time.Now()
	response, err := client.Do(request)
	if err != nil {
		return 0, errors.New("Candidate B SSE transport failed")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK || !strings.HasPrefix(response.Header.Get("Content-Type"), "text/event-stream") {
		return 0, errors.New("Candidate B SSE response differs from the event-stream contract")
	}
	reader := bufio.NewReader(io.LimitReader(response.Body, maximumMeasuredResponseBytes+1))
	for lines := 0; lines < 256; lines++ {
		line, readErr := reader.ReadString('\n')
		if readErr != nil {
			return 0, errors.New("Candidate B SSE ended before its first data event")
		}
		if strings.HasPrefix(line, "data:") {
			return time.Since(started), nil
		}
	}
	return 0, errors.New("Candidate B SSE exceeded the bounded first-event prelude")
}

func buildCandidateBReport(
	authorization Authorization,
	runtime HostedRuntime,
	unauthenticatedStatus int,
	openedRuntime bool,
	cold []time.Duration,
	interactive []time.Duration,
	sse []time.Duration,
	measuredAt time.Time,
) CandidateBReport {
	coldP95 := percentile95(cold)
	interactiveP95 := percentile95(interactive)
	sseP95 := percentile95(sse)
	coldOK := coldP95 <= coldAuthenticatedBudget
	interactiveOK := interactiveP95 <= interactiveAccessBudget && sseP95 <= interactiveAccessBudget
	reconnectOK := sseP95 <= reconnectBudget
	return CandidateBReport{
		SchemaVersion: candidateBReportSchemaVersion, RunID: authorization.Manifest.RunID,
		FlyRegion: authorization.Manifest.FlyRegion, SpritePlacement: runtime.Sprite.Observation.Placement,
		MeasurementsPerPath:    candidateBMeasurementCount,
		ColdAuthenticatedP95MS: milliseconds(coldP95), InteractiveHTTPP95MS: milliseconds(interactiveP95),
		SSEFirstEventP95MS: milliseconds(sseP95), ReconnectP95MS: milliseconds(sseP95),
		UnauthenticatedStatus: unauthenticatedStatus, UnauthenticatedOpenedRuntime: openedRuntime,
		ColdAuthenticatedWithinBudget: coldOK, InteractiveWithinBudget: interactiveOK,
		ReconnectWithinBudget: reconnectOK,
		Passed:                coldOK && interactiveOK && reconnectOK && unauthenticatedStatus == http.StatusUnauthorized && !openedRuntime,
		MeasuredAt:            measuredAt.UTC().Format(time.RFC3339Nano),
	}
}

func percentile95(values []time.Duration) time.Duration {
	ordered := slices.Clone(values)
	slices.Sort(ordered)
	index := int(math.Ceil(float64(len(ordered))*0.95)) - 1
	return ordered[index]
}

func milliseconds(duration time.Duration) float64 {
	return float64(duration) / float64(time.Millisecond)
}

func reuseCandidateBReport(path string, authorization Authorization) (bool, error) {
	data, err := readPrivateRegularFile(path, maximumBootstrapEventBytes, "Candidate B report")
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if err := rejectDuplicateJSONFields(data); err != nil {
		return false, errors.New("existing Candidate B report has duplicate fields")
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var report CandidateBReport
	if err := decoder.Decode(&report); err != nil || decoder.Decode(&struct{}{}) != io.EOF ||
		report.SchemaVersion != candidateBReportSchemaVersion || report.RunID != authorization.Manifest.RunID || !report.Passed {
		return false, errors.New("existing Candidate B report is invalid or incomplete")
	}
	return true, nil
}

func writeCandidateBReport(path string, report CandidateBReport) error {
	temporary, err := os.CreateTemp(filepath.Dir(path), ".candidate-b-report-*")
	if err != nil {
		return errors.New("create Candidate B report failed")
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
		return errors.New("protect Candidate B report failed")
	}
	encoder := json.NewEncoder(temporary)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(report); err != nil {
		return errors.New("encode Candidate B report failed")
	}
	if err := temporary.Sync(); err != nil {
		return errors.New("persist Candidate B report failed")
	}
	if err := temporary.Close(); err != nil {
		return errors.New("close Candidate B report failed")
	}
	if err := os.Rename(temporaryPath, path); err != nil {
		return errors.New("publish Candidate B report failed")
	}
	installed = true
	return syncPrivateDirectory(filepath.Dir(path))
}
