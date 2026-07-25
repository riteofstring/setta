package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/url"
	"strings"

	"setta/internal/runtimeauth"
)

type pairingResult struct {
	RuntimeID string
	Token     string
	URL       string
}

type pairingJSONEvent struct {
	SchemaVersion int    `json:"schema_version"`
	Event         string `json:"event"`
	RuntimeID     string `json:"runtime_id"`
	PairingToken  string `json:"pairing_token"`
}

func runPair(args []string, deps cliDeps) error {
	options, err := pairOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	ctx := context.Background()
	pairing, err := pairFromServeState(ctx, options.AppDataDir, deps)
	if err != nil {
		return err
	}
	return printPairing(deps.stdout, pairing, options.JSON, deps)
}

type pairOptions struct {
	AppDataDir string
	JSON       bool
}

func pairOptionsFromArgs(args []string, deps cliDeps) (pairOptions, error) {
	appDataDir, err := defaultAppDataDir(deps.getenv)
	if err != nil {
		return pairOptions{}, err
	}
	flagSet := newFlagSet("setta pair", deps.stderr)
	flagSet.StringVar(&appDataDir, "app-data-dir", appDataDir, "directory for persisted Setta app state")
	jsonOutput := false
	flagSet.BoolVar(&jsonOutput, "json", false, "print one machine-readable pairing event")
	if err := flagSet.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return pairOptions{}, usageError{err: err}
		}
		return pairOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 0 {
		return pairOptions{}, usageError{err: fmt.Errorf("setta pair does not accept positional arguments")}
	}
	return pairOptions{AppDataDir: appDataDir, JSON: jsonOutput}, nil
}

func pairFromServeState(ctx context.Context, appDataDir string, deps cliDeps) (pairingResult, error) {
	state, err := readServeState(appDataDir)
	if err != nil {
		return pairingResult{}, err
	}
	if _, err := verifyServeState(ctx, deps.httpClient, state); err != nil {
		return pairingResult{}, err
	}
	return mintPairing(ctx, appDataDir, state)
}

func mintPairing(ctx context.Context, appDataDir string, state serveState) (pairingResult, error) {
	store, err := runtimeauth.NewStore(appDataDir)
	if err != nil {
		return pairingResult{}, fmt.Errorf("open runtime auth store: %w", err)
	}
	defer store.Close()
	_, token, err := store.CreatePairingToken(ctx)
	if err != nil {
		return pairingResult{}, fmt.Errorf("create pairing token: %w", err)
	}
	pairingURL, err := buildPairingURL(state.RuntimeID, token, state.BaseURL)
	if err != nil {
		return pairingResult{}, err
	}
	return pairingResult{RuntimeID: state.RuntimeID, Token: token, URL: pairingURL}, nil
}

func buildPairingURL(runtimeID string, token string, baseURL string) (string, error) {
	if err := validateRuntimeID(runtimeID); err != nil {
		return "", fmt.Errorf("runtime id is invalid: %w", err)
	}
	if strings.TrimSpace(token) == "" {
		return "", errors.New("pairing token is required")
	}
	parsedBaseURL, err := url.Parse(baseURL)
	if err != nil {
		return "", fmt.Errorf("runtime URL is invalid: %w", err)
	}
	if parsedBaseURL.Scheme != "http" || parsedBaseURL.Host == "" || parsedBaseURL.Path != "" || parsedBaseURL.RawQuery != "" || parsedBaseURL.Fragment != "" {
		return "", fmt.Errorf("runtime URL must be an http origin without path or query: %s", baseURL)
	}
	pairingURL := url.URL{
		Scheme: "setta",
		Host:   "pair",
	}
	query := pairingURL.Query()
	query.Set("rt", runtimeID)
	query.Set("tok", token)
	query.Set("url", parsedBaseURL.String())
	pairingURL.RawQuery = query.Encode()
	return pairingURL.String(), nil
}

func printPairing(output io.Writer, pairing pairingResult, jsonOutput bool, deps cliDeps) error {
	if jsonOutput {
		if err := json.NewEncoder(output).Encode(pairingJSONEvent{
			SchemaVersion: 1, Event: "runtime_pairing_ready", RuntimeID: pairing.RuntimeID, PairingToken: pairing.Token,
		}); err != nil {
			return fmt.Errorf("write pairing JSON: %w", err)
		}
		return nil
	}
	fmt.Fprintln(output, "Pairing URL:")
	fmt.Fprintf(output, "  %s\n\n", pairing.URL)
	fmt.Fprintln(output, "QR:")
	deps.renderQR(output, pairing.URL)
	fmt.Fprintln(output)
	return nil
}
