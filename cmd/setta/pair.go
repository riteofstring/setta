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
	Token string
	URL   string
}

type pairingJSONResult struct {
	OK         bool   `json:"ok"`
	PairingURL string `json:"pairingUrl"`
}

func runPair(args []string, deps cliDeps) error {
	options, err := pairOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	ctx := context.Background()
	pairing, err := pairFromServeState(ctx, options, deps)
	if err != nil {
		return err
	}
	if options.JSON {
		return printPairingJSON(deps.stdout, pairing)
	}
	printPairing(deps.stdout, pairing, deps)
	return nil
}

type pairOptions struct {
	AppDataDir    string
	ExistingToken string
	JSON          bool
}

func pairOptionsFromArgs(args []string, deps cliDeps) (pairOptions, error) {
	appDataDir, err := defaultAppDataDir(deps.getenv)
	if err != nil {
		return pairOptions{}, err
	}
	flagSet := newFlagSet("setta pair", deps.stderr)
	flagSet.StringVar(&appDataDir, "app-data-dir", appDataDir, "directory for persisted Setta app state")
	existingToken := flagSet.String("existing-token", "", "build a pairing URL for an already-seeded pairing token")
	jsonOutput := flagSet.Bool("json", false, "emit structured JSON without a terminal QR code")
	if err := flagSet.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return pairOptions{}, usageError{err: err}
		}
		return pairOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 0 {
		return pairOptions{}, usageError{err: fmt.Errorf("setta pair does not accept positional arguments")}
	}
	if *existingToken != "" {
		var err error
		if *existingToken, err = requireSecretField("existing pairing token", *existingToken, 8); err != nil {
			return pairOptions{}, err
		}
	}
	return pairOptions{AppDataDir: appDataDir, ExistingToken: *existingToken, JSON: *jsonOutput}, nil
}

func pairFromServeState(ctx context.Context, options pairOptions, deps cliDeps) (pairingResult, error) {
	state, err := readServeState(options.AppDataDir)
	if err != nil {
		return pairingResult{}, err
	}
	if _, err := verifyServeState(ctx, deps.httpClient, state); err != nil {
		return pairingResult{}, err
	}
	if options.ExistingToken != "" {
		pairingURL, err := buildPairingURL(state.RuntimeID, options.ExistingToken, state.BaseURL)
		if err != nil {
			return pairingResult{}, err
		}
		return pairingResult{Token: options.ExistingToken, URL: pairingURL}, nil
	}
	return mintPairing(ctx, options.AppDataDir, state)
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
	return pairingResult{Token: token, URL: pairingURL}, nil
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

func printPairing(output io.Writer, pairing pairingResult, deps cliDeps) {
	fmt.Fprintln(output, "Pairing URL:")
	fmt.Fprintf(output, "  %s\n\n", pairing.URL)
	fmt.Fprintln(output, "QR:")
	deps.renderQR(output, pairing.URL)
	fmt.Fprintln(output)
}

func printPairingJSON(output io.Writer, pairing pairingResult) error {
	encoder := json.NewEncoder(output)
	if err := encoder.Encode(pairingJSONResult{OK: true, PairingURL: pairing.URL}); err != nil {
		return fmt.Errorf("encode pairing JSON: %w", err)
	}
	return nil
}
