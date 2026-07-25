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
)

const adminRequestTimeout = 10 * time.Second

type adminClientConfig struct {
	SocketPath string
}

func runAdmin(args []string, stdin io.Reader, stdout io.Writer, stderr io.Writer) int {
	if len(args) == 0 {
		fmt.Fprintln(stderr, "usage: setta-control-plane admin <ensure-device|revoke-device|set-user-status> [options]")
		return 2
	}
	var err error
	switch args[0] {
	case "ensure-device":
		err = adminEnsureDevice(context.Background(), args[1:], stdin, stdout, stderr)
	case "revoke-device":
		err = adminRevokeDevice(context.Background(), args[1:], stdout, stderr)
	case "set-user-status":
		err = adminSetUserStatus(context.Background(), args[1:], stdout, stderr)
	default:
		fmt.Fprintf(stderr, "unknown control-plane administration command %q\n", args[0])
		return 2
	}
	if err != nil {
		fmt.Fprintf(stderr, "control-plane administration failed: %v\n", err)
		return 1
	}
	return 0
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
