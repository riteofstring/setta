// Package runtimepair owns the provider-neutral management pairing flow used
// to mint an inner runtime credential over authenticated private access.
package runtimepair

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"path"
	"strings"
	"time"

	"setta/internal/httpapi"
	"setta/internal/jsonio"
	"setta/internal/runtimeaccess"
	"setta/internal/runtimeprovider"
)

const (
	maximumPairingPayload = 16 * 1024
	pairingHTTPTimeout    = 45 * time.Second
)

type Provider interface {
	Exec(context.Context, runtimeprovider.ExecRequest) (runtimeprovider.ExecResult, error)
	runtimeprovider.PrivateAccessDialer
}

type Pairer struct {
	Provider Provider
}

type Request struct {
	RuntimeName       string
	RuntimeBinaryPath string
	RuntimeStateDir   string
	ClientDisplayName string
}

type Result struct {
	DeviceID        string
	DeviceToken     string
	RuntimeID       string
	ProtocolVersion int
}

type pairingEvent struct {
	SchemaVersion int    `json:"schema_version"`
	Event         string `json:"event"`
	RuntimeID     string `json:"runtime_id"`
	PairingToken  string `json:"pairing_token"`
}

func (pairer Pairer) Pair(ctx context.Context, request Request) (Result, error) {
	if pairer.Provider == nil {
		return Result{}, errors.New("runtime pairer requires a provider")
	}
	if err := validateRequest(request); err != nil {
		return Result{}, err
	}
	event, err := pairer.mint(ctx, request)
	if err != nil {
		return Result{}, err
	}
	transport, err := runtimeaccess.NewPrivateHTTPTransport(pairer.Provider, request.RuntimeName, "127.0.0.1:7345")
	if err != nil {
		return Result{}, err
	}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: pairingHTTPTimeout}
	return complete(ctx, client, request.ClientDisplayName, event)
}

func (pairer Pairer) mint(ctx context.Context, request Request) (pairingEvent, error) {
	result, err := pairer.Provider.Exec(ctx, runtimeprovider.ExecRequest{
		RuntimeName: request.RuntimeName,
		Path:        request.RuntimeBinaryPath,
		Arguments:   []string{"pair", "--json", "--app-data-dir", request.RuntimeStateDir},
	})
	if err != nil {
		return pairingEvent{}, errors.New("mint runtime pairing token failed")
	}
	if result.ExitCode != 0 || len(result.Stdout) > maximumPairingPayload {
		return pairingEvent{}, errors.New("mint runtime pairing token returned an invalid result")
	}
	var event pairingEvent
	if err := jsonio.DecodeSingle(bytes.NewReader(result.Stdout), &event); err != nil {
		return pairingEvent{}, errors.New("decode runtime pairing event failed")
	}
	if event.SchemaVersion != 1 || event.Event != "runtime_pairing_ready" ||
		!validVisible(event.RuntimeID, 200) || !validVisible(event.PairingToken, 512) {
		return pairingEvent{}, errors.New("runtime pairing event differs from the typed contract")
	}
	return event, nil
}

func complete(ctx context.Context, client *http.Client, displayName string, event pairingEvent) (Result, error) {
	body, err := json.Marshal(httpapi.CompletePairingRequest{
		PairingToken: event.PairingToken, ClientDisplayName: displayName,
	})
	if err != nil {
		return Result{}, errors.New("encode runtime pairing completion failed")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, "http://localhost:7345/pairing/complete", bytes.NewReader(body))
	if err != nil {
		return Result{}, errors.New("build runtime pairing completion failed")
	}
	request.Header.Set("Content-Type", "application/json")
	responseBody, err := doPairingCompletion(client, request)
	if err != nil {
		return Result{}, err
	}
	return decodePairingCompletion(responseBody, event.RuntimeID)
}

func doPairingCompletion(client *http.Client, request *http.Request) ([]byte, error) {
	response, err := client.Do(request)
	if err != nil {
		return nil, errors.New("runtime pairing completion transport failed")
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, maximumPairingPayload+1))
	if err != nil || len(responseBody) > maximumPairingPayload {
		return nil, errors.New("runtime pairing completion response is invalid")
	}
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("runtime pairing completion returned HTTP %d", response.StatusCode)
	}
	return responseBody, nil
}

func decodePairingCompletion(responseBody []byte, wantRuntimeID string) (Result, error) {
	var paired httpapi.CompletePairingResponse
	if err := jsonio.DecodeSingle(bytes.NewReader(responseBody), &paired); err != nil {
		return Result{}, errors.New("decode runtime pairing completion failed")
	}
	if paired.RuntimeID != wantRuntimeID || paired.ProtocolVersion != httpapi.ProtocolVersion ||
		!validVisible(paired.DeviceID, 200) || !validVisible(paired.DeviceToken, 512) {
		return Result{}, errors.New("runtime pairing completion differs from the requested runtime contract")
	}
	return Result{
		DeviceID: paired.DeviceID, DeviceToken: paired.DeviceToken,
		RuntimeID: paired.RuntimeID, ProtocolVersion: paired.ProtocolVersion,
	}, nil
}

func validateRequest(request Request) error {
	if err := runtimeprovider.ValidateManagedName(request.RuntimeName); err != nil {
		return err
	}
	if !validRemotePath(request.RuntimeBinaryPath) || !validRemotePath(request.RuntimeStateDir) {
		return errors.New("runtime pairer requires clean absolute runtime paths")
	}
	if !validDisplayName(request.ClientDisplayName) {
		return errors.New("runtime pairer client display name must be bounded visible text")
	}
	return nil
}

func validDisplayName(value string) bool {
	if value == "" || len(value) > 200 || value != strings.TrimSpace(value) {
		return false
	}
	for _, character := range value {
		if character < 0x20 || character > 0x7e {
			return false
		}
	}
	return true
}

func validRemotePath(value string) bool {
	return strings.HasPrefix(value, "/") && path.Clean(value) == value && !strings.ContainsAny(value, "\x00\r\n\t ")
}

func validVisible(value string, maximum int) bool {
	if value == "" || len(value) > maximum {
		return false
	}
	for _, character := range value {
		if character < 0x21 || character > 0x7e {
			return false
		}
	}
	return true
}
