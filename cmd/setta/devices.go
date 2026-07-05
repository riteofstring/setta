package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"strings"
	"text/tabwriter"

	"setta/internal/runtimeauth"
)

type devicesOptions struct {
	AppDataDir string
}

func runDevices(args []string, deps cliDeps) error {
	if len(args) == 0 {
		return usageError{err: errors.New("setta devices requires a subcommand: list or revoke")}
	}
	switch args[0] {
	case "list":
		options, err := devicesOptionsFromArgs("setta devices list", args[1:], deps)
		if err != nil {
			return err
		}
		return listDevices(context.Background(), options.AppDataDir, deps.stdout)
	case "revoke":
		return runDevicesRevoke(args[1:], deps)
	default:
		return usageError{err: fmt.Errorf("unknown devices subcommand %q", args[0])}
	}
}

func runDevicesRevoke(args []string, deps cliDeps) error {
	options, deviceID, err := revokeOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	device, err := revokeDevice(context.Background(), options.AppDataDir, deviceID)
	if err != nil {
		return err
	}
	fmt.Fprintf(deps.stdout, "Revoked device %s (%s)\n", device.ID, device.DisplayName)
	return nil
}

func devicesOptionsFromArgs(name string, args []string, deps cliDeps) (devicesOptions, error) {
	appDataDir, err := defaultAppDataDir(deps.getenv)
	if err != nil {
		return devicesOptions{}, err
	}
	flagSet := newFlagSet(name, deps.stderr)
	flagSet.StringVar(&appDataDir, "app-data-dir", appDataDir, "directory for persisted Setta app state")
	if err := flagSet.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return devicesOptions{}, usageError{err: err}
		}
		return devicesOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 0 {
		return devicesOptions{}, usageError{err: fmt.Errorf("%s does not accept positional arguments", name)}
	}
	return devicesOptions{AppDataDir: appDataDir}, nil
}

func revokeOptionsFromArgs(args []string, deps cliDeps) (devicesOptions, string, error) {
	appDataDir, err := defaultAppDataDir(deps.getenv)
	if err != nil {
		return devicesOptions{}, "", err
	}
	flagSet := newFlagSet("setta devices revoke", deps.stderr)
	flagSet.StringVar(&appDataDir, "app-data-dir", appDataDir, "directory for persisted Setta app state")
	if err := flagSet.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return devicesOptions{}, "", usageError{err: err}
		}
		return devicesOptions{}, "", usageError{err: err}
	}
	if flagSet.NArg() != 1 {
		return devicesOptions{}, "", usageError{err: errors.New("setta devices revoke requires exactly one device id")}
	}
	deviceID := strings.TrimSpace(flagSet.Arg(0))
	if deviceID == "" {
		return devicesOptions{}, "", usageError{err: errors.New("device id is required")}
	}
	return devicesOptions{AppDataDir: appDataDir}, deviceID, nil
}

func listDevices(ctx context.Context, appDataDir string, output io.Writer) error {
	store, err := runtimeauth.NewStore(appDataDir)
	if err != nil {
		return fmt.Errorf("open runtime auth store: %w", err)
	}
	defer store.Close()
	devices, err := store.ListDeviceSessions(ctx)
	if err != nil {
		return fmt.Errorf("list device sessions: %w", err)
	}
	printDevices(output, devices)
	return nil
}

func revokeDevice(ctx context.Context, appDataDir string, deviceID string) (runtimeauth.DeviceSession, error) {
	store, err := runtimeauth.NewStore(appDataDir)
	if err != nil {
		return runtimeauth.DeviceSession{}, fmt.Errorf("open runtime auth store: %w", err)
	}
	defer store.Close()
	device, ok, err := store.RevokeDeviceSession(ctx, deviceID)
	if err != nil {
		return runtimeauth.DeviceSession{}, fmt.Errorf("revoke device session: %w", err)
	}
	if !ok {
		return runtimeauth.DeviceSession{}, fmt.Errorf("device %s was not found", deviceID)
	}
	return device, nil
}

func printDevices(output io.Writer, devices []runtimeauth.DeviceSession) {
	writer := tabwriter.NewWriter(output, 0, 0, 2, ' ', 0)
	fmt.Fprintln(writer, "ID\tNAME\tSCOPE\tCREATED\tLAST SEEN\tREVOKED")
	for _, device := range devices {
		fmt.Fprintf(
			writer,
			"%s\t%s\t%s\t%s\t%s\t%s\n",
			device.ID,
			device.DisplayName,
			device.Scope,
			device.CreatedAt,
			device.LastSeenAt,
			revokedDisplay(device),
		)
	}
	_ = writer.Flush()
}

func revokedDisplay(device runtimeauth.DeviceSession) string {
	if device.RevokedAt == nil {
		return "-"
	}
	return *device.RevokedAt
}
