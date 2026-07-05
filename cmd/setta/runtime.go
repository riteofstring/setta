package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"strings"

	"setta/internal/httpapi"
	"setta/internal/runtimeauth"
)

type runtimeOptions struct {
	AppDataDir string
}

func runRuntime(args []string, deps cliDeps) error {
	if len(args) == 0 {
		return usageError{err: errors.New("setta runtime requires a subcommand: rename")}
	}
	switch args[0] {
	case "rename":
		return runRuntimeRename(args[1:], deps)
	default:
		return usageError{err: fmt.Errorf("unknown runtime subcommand %q", args[0])}
	}
}

func runRuntimeRename(args []string, deps cliDeps) error {
	options, displayName, err := runtimeRenameOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	info, err := renameRuntimeDisplayName(context.Background(), options.AppDataDir, displayName, deps)
	if err != nil {
		return err
	}
	fmt.Fprintf(deps.stdout, "Runtime display name: %s\n", info.DisplayName)
	return nil
}

func runtimeRenameOptionsFromArgs(args []string, deps cliDeps) (runtimeOptions, string, error) {
	appDataDir, err := defaultAppDataDir(deps.getenv)
	if err != nil {
		return runtimeOptions{}, "", err
	}
	flagSet := newFlagSet("setta runtime rename", deps.stderr)
	flagSet.StringVar(&appDataDir, "app-data-dir", appDataDir, "directory for persisted Setta app state")
	if err := flagSet.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return runtimeOptions{}, "", usageError{err: err}
		}
		return runtimeOptions{}, "", usageError{err: err}
	}
	if flagSet.NArg() != 1 {
		return runtimeOptions{}, "", usageError{err: errors.New("setta runtime rename requires exactly one display name")}
	}
	displayName := strings.TrimSpace(flagSet.Arg(0))
	if displayName == "" {
		return runtimeOptions{}, "", usageError{err: errors.New("display name is required")}
	}
	return runtimeOptions{AppDataDir: appDataDir}, displayName, nil
}

func renameRuntimeDisplayName(ctx context.Context, appDataDir string, displayName string, deps cliDeps) (httpapi.RuntimeInfoResponse, error) {
	state, err := readServeState(appDataDir)
	if err != nil {
		return httpapi.RuntimeInfoResponse{}, err
	}
	if _, err := verifyServeState(ctx, deps.httpClient, state); err != nil {
		return httpapi.RuntimeInfoResponse{}, err
	}
	token, cleanup, err := createRuntimeCLIAuthSession(ctx, appDataDir, "Setta CLI runtime rename")
	if err != nil {
		return httpapi.RuntimeInfoResponse{}, err
	}
	defer cleanup()

	info, err := postRuntimeDisplayNameUpdate(ctx, deps.httpClient, state.BaseURL, token, displayName)
	if err != nil {
		return httpapi.RuntimeInfoResponse{}, err
	}
	if info.RuntimeID != state.RuntimeID {
		return httpapi.RuntimeInfoResponse{}, fmt.Errorf("runtime update returned id %s, but serve state records %s", info.RuntimeID, state.RuntimeID)
	}
	state.DisplayName = info.DisplayName
	state.ProtocolVersion = info.ProtocolVersion
	if err := writeServeState(appDataDir, state); err != nil {
		return httpapi.RuntimeInfoResponse{}, err
	}
	return info, nil
}

func createRuntimeCLIAuthSession(ctx context.Context, appDataDir string, displayName string) (string, func(), error) {
	store, err := runtimeauth.NewStore(appDataDir)
	if err != nil {
		return "", nil, fmt.Errorf("open runtime auth store: %w", err)
	}
	session, token, err := store.CreateDeviceSession(ctx, displayName)
	if err != nil {
		_ = store.Close()
		return "", nil, fmt.Errorf("create CLI device session: %w", err)
	}
	cleanup := func() {
		_, _, _ = store.RevokeDeviceSession(context.Background(), session.ID)
		_ = store.Close()
	}
	return token, cleanup, nil
}

func postRuntimeDisplayNameUpdate(ctx context.Context, client *http.Client, baseURL string, token string, displayName string) (httpapi.RuntimeInfoResponse, error) {
	var body bytes.Buffer
	if err := json.NewEncoder(&body).Encode(httpapi.UpdateRuntimeDisplayNameRequest{DisplayName: displayName}); err != nil {
		return httpapi.RuntimeInfoResponse{}, fmt.Errorf("encode runtime display-name update request: %w", err)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(baseURL, "/")+"/runtime/display-name/update", &body)
	if err != nil {
		return httpapi.RuntimeInfoResponse{}, fmt.Errorf("create runtime display-name update request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", "application/json")
	response, err := client.Do(request)
	if err != nil {
		return httpapi.RuntimeInfoResponse{}, fmt.Errorf("request runtime display-name update: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(response.Body)
		var apiError httpapi.ErrorResponse
		if err := json.Unmarshal(payload, &apiError); err == nil && apiError.Error.Message != "" {
			return httpapi.RuntimeInfoResponse{}, fmt.Errorf("runtime display-name update status %d: %s", response.StatusCode, apiError.Error.Message)
		}
		return httpapi.RuntimeInfoResponse{}, fmt.Errorf("runtime display-name update status %d: %s", response.StatusCode, strings.TrimSpace(string(payload)))
	}
	var info httpapi.RuntimeInfoResponse
	if err := json.NewDecoder(response.Body).Decode(&info); err != nil {
		return httpapi.RuntimeInfoResponse{}, fmt.Errorf("decode runtime display-name update response: %w", err)
	}
	if err := validateRuntimeID(info.RuntimeID); err != nil {
		return httpapi.RuntimeInfoResponse{}, fmt.Errorf("runtime display-name update returned invalid runtime id: %w", err)
	}
	if strings.TrimSpace(info.DisplayName) == "" {
		return httpapi.RuntimeInfoResponse{}, errors.New("runtime display-name update returned empty display name")
	}
	if info.ProtocolVersion <= 0 {
		return httpapi.RuntimeInfoResponse{}, fmt.Errorf("runtime display-name update returned invalid protocol version %d", info.ProtocolVersion)
	}
	return info, nil
}
