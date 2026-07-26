package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"path/filepath"
	"time"

	"setta/internal/controlplane"
	"setta/internal/runtimeaccounting"
)

const adminRequestTimeout = 10 * time.Second

type adminClientConfig struct {
	SocketPath string
}

func runAdmin(args []string, stdin io.Reader, stdout io.Writer, stderr io.Writer) int {
	if len(args) == 0 {
		fmt.Fprintln(stderr, "usage: setta-control-plane admin <ensure-device|revoke-device|set-user-status|set-user-budget|set-runtime-access|request-runtime-wake|schedule-runtime-deletion|cancel-runtime-deletion|inspect-runtime-metadata|record-runtime-health|rotate-runtime-reporting-credential|record-usage|record-accounting-event|finalize-accounting-window> [options]")
		return 2
	}
	ctx := context.Background()
	commandArgs := args[1:]
	commands := map[string]func() error{
		"ensure-device": func() error {
			return adminEnsureDevice(ctx, commandArgs, stdin, stdout, stderr)
		},
		"revoke-device": func() error {
			return adminRevokeDevice(ctx, commandArgs, stdout, stderr)
		},
		"set-user-status": func() error {
			return adminSetUserStatus(ctx, commandArgs, stdout, stderr)
		},
		"set-user-budget": func() error {
			return adminSetUserBudget(ctx, commandArgs, stdout, stderr)
		},
		"set-runtime-access": func() error {
			return adminSetRuntimeAccess(ctx, commandArgs, stdout, stderr)
		},
		"request-runtime-wake": func() error {
			return adminRequestRuntimeWake(ctx, commandArgs, stdout, stderr)
		},
		"schedule-runtime-deletion": func() error {
			return adminScheduleRuntimeDeletion(ctx, commandArgs, stdout, stderr)
		},
		"cancel-runtime-deletion": func() error {
			return adminCancelRuntimeDeletion(ctx, commandArgs, stdout, stderr)
		},
		"inspect-runtime-metadata": func() error {
			return adminInspectRuntimeMetadata(ctx, commandArgs, stdout, stderr)
		},
		"record-runtime-health": func() error {
			return adminRecordRuntimeHealth(ctx, commandArgs, stdout, stderr)
		},
		"rotate-runtime-reporting-credential": func() error {
			return adminRotateRuntimeReportingCredential(ctx, commandArgs, stdin, stdout, stderr)
		},
		"record-usage": func() error {
			return adminRecordUsage(ctx, commandArgs, stdin, stdout, stderr)
		},
		"record-accounting-event": func() error {
			return adminRecordAccountingEvent(ctx, commandArgs, stdin, stdout, stderr)
		},
		"finalize-accounting-window": func() error {
			return adminFinalizeAccountingWindow(ctx, commandArgs, stdout, stderr)
		},
	}
	command, found := commands[args[0]]
	if !found {
		fmt.Fprintf(stderr, "unknown control-plane administration command %q\n", args[0])
		return 2
	}
	err := command()
	if err != nil {
		fmt.Fprintf(stderr, "control-plane administration failed: %v\n", err)
		return 1
	}
	return 0
}

func adminSetRuntimeAccess(
	ctx context.Context,
	args []string,
	stdout io.Writer,
	stderr io.Writer,
) error {
	var config adminClientConfig
	var payload controlplane.AdminSetRuntimeAccessRequest
	flagSet := flag.NewFlagSet("setta-control-plane admin set-runtime-access", flag.ContinueOnError)
	flagSet.SetOutput(stderr)
	flagSet.StringVar((*string)(&payload.AccessState), "access-state", "", "enabled, suspended, or export_only")
	flagSet.StringVar(&config.SocketPath, "socket", "", "absolute private administration socket path")
	flagSet.StringVar(&payload.RuntimeName, "runtime-name", "", "Setta-managed runtime name")
	if err := flagSet.Parse(args); err != nil {
		return err
	}
	if flagSet.NArg() != 0 {
		return errors.New("set-runtime-access accepts no positional arguments")
	}
	if err := validateAdminClientConfig(config); err != nil {
		return err
	}
	return executeAdminRequest(
		ctx,
		config,
		"/v1/runtimes/access",
		payload,
		"runtime_access_set",
		stdout,
	)
}

func adminInspectRuntimeMetadata(
	ctx context.Context,
	args []string,
	stdout io.Writer,
	stderr io.Writer,
) error {
	var config adminClientConfig
	var payload controlplane.AdminInspectRuntimeMetadataRequest
	flagSet := flag.NewFlagSet("setta-control-plane admin inspect-runtime-metadata", flag.ContinueOnError)
	flagSet.SetOutput(stderr)
	flagSet.StringVar(&config.SocketPath, "socket", "", "absolute private administration socket path")
	flagSet.StringVar(&payload.RuntimeName, "runtime-name", "", "Setta-managed runtime name")
	if err := flagSet.Parse(args); err != nil {
		return err
	}
	if flagSet.NArg() != 0 {
		return errors.New("inspect-runtime-metadata accepts no positional arguments")
	}
	if err := validateAdminClientConfig(config); err != nil {
		return err
	}
	var metadata controlplane.AdminRuntimeMetadata
	if err := executeAdminJSONRequest(
		ctx,
		config,
		"/v1/runtimes/metadata/read",
		payload,
		&metadata,
	); err != nil {
		return err
	}
	if err := metadata.Validate(); err != nil {
		return errors.New("control-plane administration response was invalid")
	}
	if err := json.NewEncoder(stdout).Encode(metadata); err != nil {
		return errors.New("write runtime metadata failed")
	}
	return nil
}

func adminScheduleRuntimeDeletion(
	ctx context.Context,
	args []string,
	stdout io.Writer,
	stderr io.Writer,
) error {
	var config adminClientConfig
	var payload controlplane.AdminScheduleRuntimeDeletionRequest
	var scheduledAt string
	flagSet := flag.NewFlagSet("setta-control-plane admin schedule-runtime-deletion", flag.ContinueOnError)
	flagSet.SetOutput(stderr)
	flagSet.StringVar(&config.SocketPath, "socket", "", "absolute private administration socket path")
	flagSet.StringVar(&payload.IdempotencyKey, "idempotency-key", "", "globally unique immutable deletion request key")
	flagSet.StringVar(&payload.RuntimeName, "runtime-name", "", "Setta-managed runtime name")
	flagSet.StringVar(&scheduledAt, "scheduled-at", "", "future RFC3339 deletion time")
	if err := flagSet.Parse(args); err != nil {
		return err
	}
	if flagSet.NArg() != 0 {
		return errors.New("schedule-runtime-deletion accepts no positional arguments")
	}
	if err := validateAdminClientConfig(config); err != nil {
		return err
	}
	var err error
	payload.ScheduledAt, err = time.Parse(time.RFC3339Nano, scheduledAt)
	if err != nil {
		return errors.New("runtime deletion time must be RFC3339")
	}
	return executeAdminRequest(
		ctx,
		config,
		"/v1/runtimes/deletion/schedule",
		payload,
		"runtime_deletion_scheduled",
		stdout,
	)
}

func adminCancelRuntimeDeletion(
	ctx context.Context,
	args []string,
	stdout io.Writer,
	stderr io.Writer,
) error {
	var config adminClientConfig
	var payload controlplane.AdminCancelRuntimeDeletionRequest
	flagSet := flag.NewFlagSet("setta-control-plane admin cancel-runtime-deletion", flag.ContinueOnError)
	flagSet.SetOutput(stderr)
	flagSet.StringVar((*string)(&payload.AccessState), "access-state", "", "enabled, suspended, or export_only")
	flagSet.StringVar(&config.SocketPath, "socket", "", "absolute private administration socket path")
	flagSet.StringVar(&payload.RuntimeName, "runtime-name", "", "Setta-managed runtime name")
	if err := flagSet.Parse(args); err != nil {
		return err
	}
	if flagSet.NArg() != 0 {
		return errors.New("cancel-runtime-deletion accepts no positional arguments")
	}
	if err := validateAdminClientConfig(config); err != nil {
		return err
	}
	return executeAdminRequest(
		ctx,
		config,
		"/v1/runtimes/deletion/cancel",
		payload,
		"runtime_deletion_cancelled",
		stdout,
	)
}

func adminRotateRuntimeReportingCredential(
	ctx context.Context,
	args []string,
	stdin io.Reader,
	stdout io.Writer,
	stderr io.Writer,
) error {
	var config adminClientConfig
	var payload controlplane.AdminRotateRuntimeReportingCredentialRequest
	flagSet := flag.NewFlagSet(
		"setta-control-plane admin rotate-runtime-reporting-credential",
		flag.ContinueOnError,
	)
	flagSet.SetOutput(stderr)
	flagSet.StringVar(&config.SocketPath, "socket", "", "absolute private administration socket path")
	flagSet.StringVar(&payload.RuntimeName, "runtime-name", "", "Setta-managed runtime name")
	if err := flagSet.Parse(args); err != nil {
		return err
	}
	if flagSet.NArg() != 0 {
		return errors.New("rotate-runtime-reporting-credential accepts no positional arguments")
	}
	if err := validateAdminClientConfig(config); err != nil {
		return err
	}
	if err := decodeAdminStdin(stdin, &payload.Credential, "runtime reporting credential"); err != nil {
		return err
	}
	return executeAdminRequest(
		ctx,
		config,
		"/v1/runtimes/reporting-credential",
		payload,
		"runtime_reporting_credential_rotated",
		stdout,
	)
}

func adminRequestRuntimeWake(
	ctx context.Context,
	args []string,
	stdout io.Writer,
	stderr io.Writer,
) error {
	var config adminClientConfig
	var payload controlplane.AdminRequestRuntimeWakeRequest
	flagSet := flag.NewFlagSet("setta-control-plane admin request-runtime-wake", flag.ContinueOnError)
	flagSet.SetOutput(stderr)
	flagSet.StringVar(&config.SocketPath, "socket", "", "absolute private administration socket path")
	flagSet.StringVar(&payload.IdempotencyKey, "idempotency-key", "", "globally unique immutable wake request key")
	flagSet.StringVar(&payload.RuntimeName, "runtime-name", "", "Setta-managed runtime name")
	if err := flagSet.Parse(args); err != nil {
		return err
	}
	if flagSet.NArg() != 0 {
		return errors.New("request-runtime-wake accepts no positional arguments")
	}
	if err := validateAdminClientConfig(config); err != nil {
		return err
	}
	return executeAdminRequest(
		ctx,
		config,
		"/v1/runtimes/wake",
		payload,
		"runtime_wake_requested",
		stdout,
	)
}

func adminRecordRuntimeHealth(
	ctx context.Context,
	args []string,
	stdout io.Writer,
	stderr io.Writer,
) error {
	var config adminClientConfig
	var payload controlplane.AdminRecordRuntimeHealthRequest
	flagSet := flag.NewFlagSet("setta-control-plane admin record-runtime-health", flag.ContinueOnError)
	flagSet.SetOutput(stderr)
	flagSet.StringVar(&config.SocketPath, "socket", "", "absolute private administration socket path")
	flagSet.StringVar((*string)(&payload.HealthState), "health-state", "", "unknown, healthy, degraded, or unreachable")
	flagSet.StringVar(&payload.ObservedRelease, "observed-release", "", "verified installed Setta runtime release")
	flagSet.StringVar(&payload.RuntimeName, "runtime-name", "", "Setta-managed runtime name")
	if err := flagSet.Parse(args); err != nil {
		return err
	}
	if flagSet.NArg() != 0 {
		return errors.New("record-runtime-health accepts no positional arguments")
	}
	if err := validateAdminClientConfig(config); err != nil {
		return err
	}
	return executeAdminRequest(
		ctx,
		config,
		"/v1/runtimes/health",
		payload,
		"runtime_health_recorded",
		stdout,
	)
}

func adminFinalizeAccountingWindow(
	ctx context.Context,
	args []string,
	stdout io.Writer,
	stderr io.Writer,
) error {
	var config adminClientConfig
	var payload controlplane.AdminFinalizeRuntimeAccountingWindowRequest
	var windowEnd string
	flagSet := flag.NewFlagSet("setta-control-plane admin finalize-accounting-window", flag.ContinueOnError)
	flagSet.SetOutput(stderr)
	flagSet.StringVar(&config.SocketPath, "socket", "", "absolute private administration socket path")
	flagSet.StringVar(&payload.IdempotencyKey, "idempotency-key", "", "globally unique immutable accounting window key")
	flagSet.StringVar(&payload.RuntimeName, "runtime-name", "", "Setta-managed runtime name")
	flagSet.StringVar(&payload.UserID, "user-id", "", "immutable Setta user identifier")
	flagSet.StringVar(&windowEnd, "window-end", "", "exclusive RFC3339 accounting window end")
	if err := flagSet.Parse(args); err != nil {
		return err
	}
	if flagSet.NArg() != 0 {
		return errors.New("finalize-accounting-window accepts no positional arguments")
	}
	if err := validateAdminClientConfig(config); err != nil {
		return err
	}
	var err error
	payload.WindowEnd, err = time.Parse(time.RFC3339Nano, windowEnd)
	if err != nil {
		return errors.New("accounting window end must be RFC3339")
	}
	return executeAdminRequest(
		ctx,
		config,
		"/v1/runtime-accounting/windows/finalize",
		payload,
		"runtime_accounting_window_finalized",
		stdout,
	)
}

func adminRecordAccountingEvent(
	ctx context.Context,
	args []string,
	stdin io.Reader,
	stdout io.Writer,
	stderr io.Writer,
) error {
	var config adminClientConfig
	var payload controlplane.AdminRecordRuntimeAccountingEventRequest
	flagSet := flag.NewFlagSet("setta-control-plane admin record-accounting-event", flag.ContinueOnError)
	flagSet.SetOutput(stderr)
	flagSet.StringVar(&config.SocketPath, "socket", "", "absolute private administration socket path")
	flagSet.StringVar(&payload.RuntimeName, "runtime-name", "", "Setta-managed runtime name")
	if err := flagSet.Parse(args); err != nil {
		return err
	}
	if flagSet.NArg() != 0 {
		return errors.New("record-accounting-event accepts no positional arguments")
	}
	if err := validateAdminClientConfig(config); err != nil {
		return err
	}
	if err := decodeAdminStdin(stdin, &payload.Transition, "runtime accounting transition"); err != nil {
		return err
	}
	return executeAdminRequest(
		ctx,
		config,
		"/v1/runtime-accounting/events",
		payload,
		"runtime_accounting_event_recorded",
		stdout,
	)
}

func adminSetUserBudget(
	ctx context.Context,
	args []string,
	stdout io.Writer,
	stderr io.Writer,
) error {
	var config adminClientConfig
	var payload controlplane.AdminSetUserBudgetRequest
	var periodStart string
	var periodEnd string
	flagSet := flag.NewFlagSet("setta-control-plane admin set-user-budget", flag.ContinueOnError)
	flagSet.SetOutput(stderr)
	flagSet.StringVar(&config.SocketPath, "socket", "", "absolute private administration socket path")
	flagSet.StringVar(&payload.UserID, "user-id", "", "immutable Setta user identifier")
	flagSet.StringVar(&periodStart, "period-start", "", "inclusive RFC3339 budget period start")
	flagSet.StringVar(&periodEnd, "period-end", "", "exclusive RFC3339 budget period end")
	flagSet.Int64Var(&payload.CoveredLimitUSDMicros, "limit-usd-micros", 0, "covered hard limit in micro-US dollars")
	flagSet.Int64Var(&payload.SafetyReserveUSDMicros, "reserve-usd-micros", 0, "uncertainty reserve in micro-US dollars")
	flagSet.Int64Var(&payload.CutoffExposureUSDMicros, "cutoff-exposure-usd-micros", 0, "worst-case cutoff-lag exposure in micro-US dollars")
	flagSet.DurationVar(&payload.MaximumCutoffLag, "maximum-cutoff-lag", 0, "maximum allowed provider cutoff lag")
	if err := flagSet.Parse(args); err != nil {
		return err
	}
	if flagSet.NArg() != 0 {
		return errors.New("set-user-budget does not accept positional arguments")
	}
	if err := validateAdminClientConfig(config); err != nil {
		return err
	}
	var err error
	payload.PeriodStart, err = time.Parse(time.RFC3339Nano, periodStart)
	if err != nil {
		return errors.New("budget period start must be RFC3339")
	}
	payload.PeriodEnd, err = time.Parse(time.RFC3339Nano, periodEnd)
	if err != nil {
		return errors.New("budget period end must be RFC3339")
	}
	return executeAdminRequest(ctx, config, "/v1/users/budget", payload, "user_budget_set", stdout)
}

func adminRecordUsage(
	ctx context.Context,
	args []string,
	stdin io.Reader,
	stdout io.Writer,
	stderr io.Writer,
) error {
	var config adminClientConfig
	var payload controlplane.AdminRecordUsageRequest
	flagSet := flag.NewFlagSet("setta-control-plane admin record-usage", flag.ContinueOnError)
	flagSet.SetOutput(stderr)
	flagSet.StringVar(&config.SocketPath, "socket", "", "absolute private administration socket path")
	flagSet.StringVar(&payload.IdempotencyKey, "idempotency-key", "", "globally unique immutable interval key")
	flagSet.StringVar(&payload.UserID, "user-id", "", "immutable Setta user identifier")
	if err := flagSet.Parse(args); err != nil {
		return err
	}
	if flagSet.NArg() != 0 {
		return errors.New("record-usage does not accept positional arguments")
	}
	if err := validateAdminClientConfig(config); err != nil {
		return err
	}
	if err := decodeRuntimeAccountingEvidence(stdin, &payload.Evidence); err != nil {
		return err
	}
	return executeAdminRequest(ctx, config, "/v1/usage/record", payload, "usage_recorded", stdout)
}

func decodeRuntimeAccountingEvidence(
	reader io.Reader,
	target *runtimeaccounting.Evidence,
) error {
	return decodeAdminStdin(reader, target, "runtime accounting evidence")
}

func decodeAdminStdin(reader io.Reader, target any, label string) error {
	decoder := json.NewDecoder(io.LimitReader(reader, maximumBootstrapCredentialBytes+1))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil || decoder.Decode(&struct{}{}) != io.EOF {
		return fmt.Errorf("decode %s failed", label)
	}
	return nil
}

func adminEnsureDevice(
	ctx context.Context,
	args []string,
	stdin io.Reader,
	stdout io.Writer,
	stderr io.Writer,
) error {
	config, payload, err := parseAdminEnsureDevice(args, stdin, stderr)
	if err != nil {
		return err
	}
	return executeAdminRequest(ctx, config, "/v1/devices/ensure", payload, "device_ensured", stdout)
}

func parseAdminEnsureDevice(
	args []string,
	stdin io.Reader,
	stderr io.Writer,
) (adminClientConfig, controlplane.AdminEnsureDeviceRequest, error) {
	var config adminClientConfig
	var payload controlplane.AdminEnsureDeviceRequest
	flagSet := flag.NewFlagSet("setta-control-plane admin ensure-device", flag.ContinueOnError)
	flagSet.SetOutput(stderr)
	flagSet.StringVar(&config.SocketPath, "socket", "", "absolute private administration socket path")
	flagSet.StringVar(&payload.DisplayName, "device-name", "", "operator-visible device name")
	flagSet.DurationVar(&payload.GrantTTL, "grant-ttl", 2*time.Hour, "bounded client access grant lifetime")
	flagSet.StringVar(&payload.RuntimeName, "runtime-name", "", "Setta-managed runtime name")
	flagSet.StringVar(&payload.UserID, "user-id", "", "immutable Setta user identifier")
	if err := flagSet.Parse(args); err != nil {
		return adminClientConfig{}, controlplane.AdminEnsureDeviceRequest{}, err
	}
	if flagSet.NArg() != 0 {
		return adminClientConfig{}, controlplane.AdminEnsureDeviceRequest{}, errors.New("ensure-device does not accept positional arguments")
	}
	if err := validateAdminClientConfig(config); err != nil {
		return adminClientConfig{}, controlplane.AdminEnsureDeviceRequest{}, err
	}
	credential, err := decodeDeviceCredential(stdin)
	if err != nil {
		return adminClientConfig{}, controlplane.AdminEnsureDeviceRequest{}, err
	}
	payload.Credential = credential
	return config, payload, nil
}

func adminRevokeDevice(
	ctx context.Context,
	args []string,
	stdout io.Writer,
	stderr io.Writer,
) error {
	var config adminClientConfig
	var payload controlplane.AdminRevokeDeviceRequest
	flagSet := flag.NewFlagSet("setta-control-plane admin revoke-device", flag.ContinueOnError)
	flagSet.SetOutput(stderr)
	flagSet.StringVar(&payload.DeviceID, "device-id", "", "exact device identifier")
	flagSet.StringVar(&config.SocketPath, "socket", "", "absolute private administration socket path")
	if err := flagSet.Parse(args); err != nil {
		return err
	}
	if flagSet.NArg() != 0 {
		return errors.New("revoke-device does not accept positional arguments")
	}
	if err := validateAdminClientConfig(config); err != nil {
		return err
	}
	return executeAdminRequest(ctx, config, "/v1/devices/revoke", payload, "device_revoked", stdout)
}

func adminSetUserStatus(
	ctx context.Context,
	args []string,
	stdout io.Writer,
	stderr io.Writer,
) error {
	var config adminClientConfig
	var payload controlplane.AdminSetUserStatusRequest
	flagSet := flag.NewFlagSet("setta-control-plane admin set-user-status", flag.ContinueOnError)
	flagSet.SetOutput(stderr)
	flagSet.StringVar(&config.SocketPath, "socket", "", "absolute private administration socket path")
	flagSet.StringVar((*string)(&payload.Status), "status", "", "active or suspended")
	flagSet.StringVar(&payload.UserID, "user-id", "", "immutable Setta user identifier")
	if err := flagSet.Parse(args); err != nil {
		return err
	}
	if flagSet.NArg() != 0 {
		return errors.New("set-user-status does not accept positional arguments")
	}
	if err := validateAdminClientConfig(config); err != nil {
		return err
	}
	return executeAdminRequest(ctx, config, "/v1/users/status", payload, "user_status_set", stdout)
}

func validateAdminClientConfig(config adminClientConfig) error {
	if config.SocketPath == "" || !filepath.IsAbs(config.SocketPath) {
		return errors.New("control-plane administration socket path must be absolute")
	}
	return nil
}

func executeAdminRequest(
	ctx context.Context,
	config adminClientConfig,
	path string,
	payload any,
	wantEvent string,
	stdout io.Writer,
) error {
	var event controlplane.AdminEvent
	if err := executeAdminJSONRequest(ctx, config, path, payload, &event); err != nil {
		return err
	}
	if event.Event != wantEvent {
		return errors.New("control-plane administration response was invalid")
	}
	if err := json.NewEncoder(stdout).Encode(event); err != nil {
		return errors.New("write control-plane administration event failed")
	}
	return nil
}

func executeAdminJSONRequest(
	ctx context.Context,
	config adminClientConfig,
	path string,
	payload any,
	target any,
) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return errors.New("encode control-plane administration request failed")
	}
	client := &http.Client{
		Timeout: adminRequestTimeout,
		Transport: &http.Transport{DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			return (&net.Dialer{}).DialContext(ctx, "unix", config.SocketPath)
		}},
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, "http://unix"+path, bytes.NewReader(data))
	if err != nil {
		return errors.New("build control-plane administration request failed")
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := client.Do(request)
	if err != nil {
		return errors.New("send control-plane administration request failed")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return errors.New("control-plane administration request was rejected")
	}
	decoder := json.NewDecoder(io.LimitReader(response.Body, maximumBootstrapCredentialBytes+1))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil || decoder.Decode(&struct{}{}) != io.EOF {
		return errors.New("control-plane administration response was invalid")
	}
	return nil
}
