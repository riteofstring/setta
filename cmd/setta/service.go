package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"strings"
	"time"
)

const (
	defaultServiceTailnetTimeout = 90 * time.Second
	defaultServiceReadyTimeout   = 90 * time.Second
	defaultServicePollInterval   = time.Second
)

var errServeStateNotTailnet = errors.New("serve state is not tailnet-bound")

type serviceWaitTailnetOptions struct {
	Timeout      time.Duration
	PollInterval time.Duration
}

type serviceConfigureTailscaleServeOptions struct {
	AppDataDir   string
	Timeout      time.Duration
	PollInterval time.Duration
}

func runService(args []string, deps cliDeps) error {
	if len(args) == 0 {
		return usageError{err: errors.New("setta service requires a subcommand")}
	}
	switch args[0] {
	case "wait-tailnet":
		return runServiceWaitTailnet(args[1:], deps)
	case "configure-tailscale-serve":
		return runServiceConfigureTailscaleServe(args[1:], deps)
	default:
		return usageError{err: fmt.Errorf("unknown setta service subcommand %q", args[0])}
	}
}

func runServiceWaitTailnet(args []string, deps cliDeps) error {
	options, err := serviceWaitTailnetOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	ctx, stop := signalContext()
	defer stop()
	addr, err := waitForTailnetIPv4(ctx, options.Timeout, options.PollInterval, deps)
	if err != nil {
		return err
	}
	fmt.Fprintln(deps.stdout, addr)
	return nil
}

func serviceWaitTailnetOptionsFromArgs(args []string, deps cliDeps) (serviceWaitTailnetOptions, error) {
	options := serviceWaitTailnetOptions{
		Timeout:      defaultServiceTailnetTimeout,
		PollInterval: defaultServicePollInterval,
	}
	flagSet := newFlagSet("setta service wait-tailnet", deps.stderr)
	flagSet.DurationVar(&options.Timeout, "timeout", options.Timeout, "maximum time to wait for a Tailscale IPv4 address")
	flagSet.DurationVar(&options.PollInterval, "poll-interval", options.PollInterval, "time between Tailscale availability checks")
	if err := flagSet.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return serviceWaitTailnetOptions{}, usageError{err: err}
		}
		return serviceWaitTailnetOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 0 {
		return serviceWaitTailnetOptions{}, usageError{err: errors.New("setta service wait-tailnet does not accept positional arguments")}
	}
	if err := validateServiceWaitOptions(options.Timeout, options.PollInterval); err != nil {
		return serviceWaitTailnetOptions{}, err
	}
	return options, nil
}

func runServiceConfigureTailscaleServe(args []string, deps cliDeps) error {
	options, err := serviceConfigureTailscaleServeOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	ctx, stop := signalContext()
	defer stop()
	state, err := waitForTailnetServeState(ctx, options.AppDataDir, options.Timeout, options.PollInterval, deps)
	if err != nil {
		return err
	}
	commandArgs := tailscaleServeArgs(state.Addr)
	output, err := deps.commandRunner(ctx, "tailscale", commandArgs...)
	if err != nil {
		return fmt.Errorf("configure Tailscale HTTPS with %q: %w: %s", tailscaleServeCommand(state.Addr), err, trimCommandOutput(output))
	}
	fmt.Fprintf(deps.stdout, "Configured Tailscale HTTPS for %s\n", state.BaseURL)
	return nil
}

func serviceConfigureTailscaleServeOptionsFromArgs(args []string, deps cliDeps) (serviceConfigureTailscaleServeOptions, error) {
	appDataDir, err := defaultAppDataDir(deps.getenv)
	if err != nil {
		return serviceConfigureTailscaleServeOptions{}, err
	}
	options := serviceConfigureTailscaleServeOptions{
		AppDataDir:   appDataDir,
		Timeout:      defaultServiceReadyTimeout,
		PollInterval: defaultServicePollInterval,
	}
	flagSet := newFlagSet("setta service configure-tailscale-serve", deps.stderr)
	flagSet.StringVar(&options.AppDataDir, "app-data-dir", options.AppDataDir, "directory for persisted Setta app state")
	flagSet.DurationVar(&options.Timeout, "timeout", options.Timeout, "maximum time to wait for setta serve readiness")
	flagSet.DurationVar(&options.PollInterval, "poll-interval", options.PollInterval, "time between readiness checks")
	if err := flagSet.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return serviceConfigureTailscaleServeOptions{}, usageError{err: err}
		}
		return serviceConfigureTailscaleServeOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 0 {
		return serviceConfigureTailscaleServeOptions{}, usageError{err: errors.New("setta service configure-tailscale-serve does not accept positional arguments")}
	}
	if err := validateServeStateAppDataDir(options.AppDataDir); err != nil {
		return serviceConfigureTailscaleServeOptions{}, err
	}
	if err := validateServiceWaitOptions(options.Timeout, options.PollInterval); err != nil {
		return serviceConfigureTailscaleServeOptions{}, err
	}
	return options, nil
}

func validateServiceWaitOptions(timeout time.Duration, pollInterval time.Duration) error {
	if timeout <= 0 {
		return fmt.Errorf("timeout must be positive: %s", timeout)
	}
	if pollInterval <= 0 {
		return fmt.Errorf("poll interval must be positive: %s", pollInterval)
	}
	return nil
}

func waitForTailnetIPv4(ctx context.Context, timeout time.Duration, pollInterval time.Duration, deps cliDeps) (string, error) {
	waitCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	var lastErr error
	for {
		addr, err := resolveTailnetIPv4(waitCtx, deps.commandRunner)
		if err == nil {
			return addr, nil
		}
		lastErr = err
		if waitCtx.Err() != nil {
			return "", fmt.Errorf("tailscale IPv4 address did not become available within %s: %w", timeout, lastErr)
		}
		if err := deps.sleep(waitCtx, pollInterval); err != nil {
			return "", fmt.Errorf("tailscale IPv4 address did not become available within %s: %w", timeout, lastErr)
		}
	}
}

func waitForTailnetServeState(
	ctx context.Context,
	appDataDir string,
	timeout time.Duration,
	pollInterval time.Duration,
	deps cliDeps,
) (serveState, error) {
	waitCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	var lastErr error
	for {
		state, err := readServeState(appDataDir)
		if err == nil {
			err = validateTailnetServeState(waitCtx, appDataDir, state, deps)
		}
		if err == nil {
			return state, nil
		}
		if errors.Is(err, errServeStateNotTailnet) {
			return serveState{}, err
		}
		lastErr = err
		if waitCtx.Err() != nil {
			return serveState{}, fmt.Errorf("setta serve did not become ready for Tailscale HTTPS within %s: %w", timeout, lastErr)
		}
		if err := deps.sleep(waitCtx, pollInterval); err != nil {
			return serveState{}, fmt.Errorf("setta serve did not become ready for Tailscale HTTPS within %s: %w", timeout, lastErr)
		}
	}
}

func validateTailnetServeState(ctx context.Context, appDataDir string, state serveState, deps cliDeps) error {
	if !serveStateAddrIsTailscale(state.Addr) {
		return fmt.Errorf("%w: setta serve at %s is not bound to a Tailscale IPv4 address; start it with --tailnet", errServeStateNotTailnet, state.BaseURL)
	}
	if _, err := verifyServeState(ctx, deps.httpClient, state); err != nil {
		return err
	}
	return validateServeState(appDataDir, state)
}

func trimCommandOutput(output []byte) string {
	return strings.TrimSpace(string(output))
}
