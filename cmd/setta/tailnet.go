package main

import (
	"context"
	"errors"
	"fmt"
	"net/netip"
	"os/exec"
	"strings"
)

type commandRunner func(context.Context, string, ...string) ([]byte, error)

func resolveTailnetIPv4(ctx context.Context, runner commandRunner) (string, error) {
	output, err := runner(ctx, "tailscale", "ip", "-4")
	if err != nil {
		var execError *exec.Error
		if errors.As(err, &execError) && errors.Is(execError.Err, exec.ErrNotFound) {
			return "", errors.New("tailscale CLI not found in PATH; install Tailscale and run `tailscale up` before using --tailnet")
		}
		trimmed := strings.TrimSpace(string(output))
		if trimmed != "" {
			return "", fmt.Errorf("tailscale ip -4 failed: %w: %s", err, trimmed)
		}
		return "", fmt.Errorf("tailscale ip -4 failed: %w", err)
	}
	lines := nonEmptyLines(string(output))
	if len(lines) == 0 {
		return "", errors.New("tailscale ip -4 returned no address; confirm Tailscale is running and this machine is joined to a tailnet")
	}
	if len(lines) != 1 {
		return "", fmt.Errorf("tailscale ip -4 returned %d addresses, expected exactly one", len(lines))
	}
	addr, err := netip.ParseAddr(lines[0])
	if err != nil || !addr.Is4() {
		return "", fmt.Errorf("tailscale ip -4 returned %q, expected a numeric IPv4 address", lines[0])
	}
	return addr.String(), nil
}

func nonEmptyLines(output string) []string {
	rawLines := strings.Split(output, "\n")
	lines := make([]string, 0, len(rawLines))
	for _, rawLine := range rawLines {
		line := strings.TrimSpace(rawLine)
		if line == "" {
			continue
		}
		lines = append(lines, line)
	}
	return lines
}

func runExternalCommand(ctx context.Context, name string, args ...string) ([]byte, error) {
	command := exec.CommandContext(ctx, name, args...)
	return command.CombinedOutput()
}

func tailscaleServeCommand(addr string) string {
	return "tailscale serve --bg --tls-terminated-tcp=443 tcp://" + addr
}
