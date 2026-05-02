package settacmd

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"strconv"
	"strings"

	"setta/internal/launcher"
)

func launcherStatusPayloadFromSnapshot(status launcher.LauncherStatusSnapshot) launcherStatusPayload {
	return launcherStatusPayload{
		Ok:                       true,
		Installed:                status.Installed,
		SettaHome:                status.SettaHome,
		LauncherDir:              status.LauncherDir,
		MetadataPath:             status.MetadataPath,
		TargetCommand:            cloneStrings(status.TargetCommand),
		TargetValid:              cloneBoolPointer(status.TargetValid),
		TargetError:              cloneStringPointer(status.TargetError),
		Channel:                  cloneStringPointer(status.Channel),
		SettaVersion:             cloneStringPointer(status.SettaVersion),
		OpenMode:                 launcherOpenModePointer(status.OpenMode),
		WorkspaceBehavior:        launcherWorkspaceBehaviorPointer(status.WorkspaceBehavior),
		LastUsedWorkspace:        cloneStringPointer(status.LastUsedWorkspace),
		ArtifactOptions:          cloneStringMap(status.ArtifactOptions),
		ManagedArtifacts:         cloneStringMap(status.ManagedArtifacts),
		ExistingManagedArtifacts: cloneStrings(status.ExistingManagedArtifacts),
		MissingManagedArtifacts:  cloneStrings(status.MissingManagedArtifacts),
		UpdateCapability:         string(status.UpdateCapability),
		UpdateGuidance:           cloneStringPointer(status.UpdateGuidance),
	}
}

func emitLauncherSetupError(stdout io.Writer, stderr io.Writer, jsonOutput bool, err error) error {
	var setupErr *launcher.LauncherSetupError
	if errors.As(err, &setupErr) {
		return emitLauncherCommandError(stdout, stderr, jsonOutput, setupErr.Code, setupErr.Message, 2)
	}
	return emitLauncherCommandError(stdout, stderr, jsonOutput, "InternalError", err.Error(), 1)
}

func emitLauncherCommandError(stdout io.Writer, stderr io.Writer, jsonOutput bool, code string, message string, exitCode int) error {
	if jsonOutput {
		if err := writeJSONPayload(stdout, map[string]any{
			"ok": false,
			"error": launcherErrorPayload{
				Code:    code,
				Message: message,
			},
		}); err != nil {
			return err
		}
		return &ExitError{Code: exitCode, Silent: true}
	}

	fmt.Fprintf(stderr, "Error: %s\n", message)
	switch code {
	case "LauncherTargetMissing":
		fmt.Fprintln(stderr, "Remediation: reinstall launcher metadata with `setta launcher setup`.")
	case "LauncherMetadata":
		fmt.Fprintln(stderr, "Remediation: fix or remove launcher metadata, then re-run `setta launcher setup`.")
	}
	return &ExitError{Code: exitCode, Silent: true}
}

func emitLauncherFlagParseError(stderr io.Writer, flags *flag.FlagSet, err error) error {
	if errors.Is(err, flag.ErrHelp) {
		if writeErr := writeLauncherFlagSetUsage(stderr, flags); writeErr != nil {
			return writeErr
		}
		return &ExitError{Code: 0, Silent: true}
	}
	if writeErr := writeLauncherFlagSetUsageError(stderr, flags, normalizeLauncherFlagParseError(err.Error())); writeErr != nil {
		return writeErr
	}
	return &ExitError{Code: 2, Err: err, Silent: true}
}

func writeLauncherFlagSetUsageError(writer io.Writer, flags *flag.FlagSet, message string) error {
	if _, err := fmt.Fprintln(writer, message); err != nil {
		return err
	}
	return writeLauncherFlagSetUsage(writer, flags)
}

func writeLauncherFlagSetUsage(writer io.Writer, flags *flag.FlagSet) error {
	if _, err := fmt.Fprintf(writer, "Usage of %s:\n", flags.Name()); err != nil {
		return err
	}
	flags.SetOutput(writer)
	flags.PrintDefaults()
	flags.SetOutput(io.Discard)
	return nil
}

func normalizeLauncherFlagParseError(message string) string {
	const unknownFlagPrefix = "flag provided but not defined: "
	if !strings.HasPrefix(message, unknownFlagPrefix) {
		return message
	}
	flagName := strings.TrimSpace(strings.TrimPrefix(message, unknownFlagPrefix))
	if strings.HasPrefix(flagName, "--") {
		return fmt.Sprintf("No such option: %s", flagName)
	}
	if strings.HasPrefix(flagName, "-") {
		trimmed := strings.TrimPrefix(flagName, "-")
		if len(trimmed) > 1 {
			return fmt.Sprintf("No such option: --%s", trimmed)
		}
		return fmt.Sprintf("No such option: -%s", trimmed)
	}
	return fmt.Sprintf("No such option: %s", flagName)
}

func writeJSONPayload(writer io.Writer, payload any) error {
	encoder := json.NewEncoder(writer)
	encoder.SetEscapeHTML(false)
	return encoder.Encode(payload)
}

func shellJoin(parts []string) string {
	if len(parts) == 0 {
		return ""
	}
	quoted := make([]string, 0, len(parts))
	for _, part := range parts {
		if part == "" || strings.ContainsAny(part, " \t\n\"'\\") {
			quoted = append(quoted, strconv.Quote(part))
			continue
		}
		quoted = append(quoted, part)
	}
	return strings.Join(quoted, " ")
}

func launcherOpenModePointer(mode *launcher.LauncherOpenMode) *string {
	if mode == nil {
		return nil
	}
	value := string(*mode)
	return &value
}

func launcherWorkspaceBehaviorPointer(mode *launcher.LauncherWorkspaceBehavior) *string {
	if mode == nil {
		return nil
	}
	value := string(*mode)
	return &value
}

func cloneStringPointer(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneBoolPointer(value *bool) *bool {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneStrings(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}
	return append([]string(nil), values...)
}

func cloneStringMap(values map[string]string) map[string]string {
	if values == nil {
		return map[string]string{}
	}
	cloned := make(map[string]string, len(values))
	for key, value := range values {
		cloned[key] = value
	}
	return cloned
}

func pointerToStatusPayload(payload launcherStatusPayload) *launcherStatusPayload {
	return &payload
}

func stringPointer(value string) *string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	trimmed := strings.TrimSpace(value)
	return &trimmed
}

func stringPointerValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
