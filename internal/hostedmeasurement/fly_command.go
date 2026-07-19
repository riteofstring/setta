package hostedmeasurement

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const maximumFlyCommandOutput = 2 * 1024 * 1024

type FlyCommand struct {
	Arguments   []string
	Environment map[string]string
	Stdin       []byte
}

type FlyCommandRunner interface {
	Run(context.Context, FlyCommand) ([]byte, error)
}

type FlyCommandError struct {
	ExitCode int
}

func (err *FlyCommandError) Error() string {
	return fmt.Sprintf("flyctl command failed with exit code %d", err.ExitCode)
}

type ExecFlyCommandRunner struct {
	binary string
}

func (runner *ExecFlyCommandRunner) BinaryPath() string {
	return runner.binary
}

func NewExecFlyCommandRunner(binary string) (*ExecFlyCommandRunner, error) {
	if binary == "" || !filepath.IsAbs(binary) {
		return nil, errors.New("flyctl binary path must be absolute")
	}
	resolved, err := filepath.EvalSymlinks(binary)
	if err != nil {
		return nil, fmt.Errorf("resolve flyctl binary: %w", err)
	}
	info, err := os.Stat(resolved)
	if err != nil {
		return nil, fmt.Errorf("inspect flyctl binary: %w", err)
	}
	if !info.Mode().IsRegular() || info.Mode().Perm()&0o111 == 0 {
		return nil, errors.New("flyctl binary must be an executable regular file")
	}
	return &ExecFlyCommandRunner{binary: resolved}, nil
}

func (runner *ExecFlyCommandRunner) Run(ctx context.Context, command FlyCommand) ([]byte, error) {
	if err := validateFlyCommand(command); err != nil {
		return nil, err
	}
	process := exec.CommandContext(ctx, runner.binary, command.Arguments...)
	process.Env = flyCommandEnvironment(command.Environment)
	process.Stdin = bytes.NewReader(command.Stdin)
	var stdout limitedBuffer
	var stderr limitedBuffer
	process.Stdout = &stdout
	process.Stderr = &stderr
	err := process.Run()
	if ctxErr := ctx.Err(); ctxErr != nil {
		return nil, ctxErr
	}
	if stdout.exceeded || stderr.exceeded {
		return nil, errors.New("flyctl command output exceeded the size limit")
	}
	if err != nil {
		var exitError *exec.ExitError
		if errors.As(err, &exitError) {
			return nil, &FlyCommandError{ExitCode: exitError.ExitCode()}
		}
		return nil, errors.New("flyctl command failed to start")
	}
	return stdout.bytes(), nil
}

type FlySecretStager struct {
	mutationToken string
	runner        FlyCommandRunner
}

type FlyStagedSecrets struct {
	InnerRuntimeCredential []byte
	SpriteToken            []byte
}

func NewFlySecretStager(runner FlyCommandRunner, mutationToken []byte) (*FlySecretStager, error) {
	if runner == nil {
		return nil, errors.New("Fly secret stager requires a command runner")
	}
	if !validFlyToken(mutationToken) {
		return nil, errors.New("Fly secret stager mutation token is invalid")
	}
	return &FlySecretStager{runner: runner, mutationToken: string(mutationToken)}, nil
}

func (stager *FlySecretStager) Stage(ctx context.Context, appName string, secrets FlyStagedSecrets) error {
	if !organizationPattern.MatchString(appName) {
		return errors.New("Fly secret staging requires a valid app name")
	}
	if !validFlyToken(secrets.SpriteToken) || !validFlyToken(secrets.InnerRuntimeCredential) {
		return errors.New("Fly staged secrets must be non-empty visible ASCII")
	}
	innerEncoded := base64.StdEncoding.EncodeToString(secrets.InnerRuntimeCredential)
	stdin := []byte("SPRITE_TOKEN=" + string(secrets.SpriteToken) + "\n" +
		"SETTA_INNER_RUNTIME_CREDENTIAL=" + innerEncoded + "\n")
	_, err := stager.runner.Run(ctx, FlyCommand{
		Arguments: []string{"secrets", "import", "--stage", "--app", appName},
		Environment: map[string]string{
			"FLY_API_TOKEN": stager.mutationToken,
			"NO_COLOR":      "1",
		},
		Stdin: stdin,
	})
	if err != nil {
		return redactFlyCommandError(err)
	}
	return nil
}

func redactFlyCommandError(commandErr error) error {
	if errors.Is(commandErr, context.Canceled) || errors.Is(commandErr, context.DeadlineExceeded) {
		return commandErr
	}
	var exitError *FlyCommandError
	if errors.As(commandErr, &exitError) {
		return fmt.Errorf("stage Fly app secrets: %w", exitError)
	}
	return errors.New("stage Fly app secrets failed")
}

func validateFlyCommand(command FlyCommand) error {
	if len(command.Arguments) == 0 {
		return errors.New("flyctl command requires arguments")
	}
	for _, argument := range command.Arguments {
		if argument == "" || strings.ContainsAny(argument, "\x00\r\n") {
			return errors.New("flyctl command arguments must be non-empty single-line values")
		}
	}
	for name, value := range command.Environment {
		if name == "" || strings.ContainsAny(name, "=\x00\r\n") || strings.ContainsAny(value, "\x00\r\n") {
			return errors.New("flyctl command environment contains an invalid value")
		}
	}
	return nil
}

func flyCommandEnvironment(overrides map[string]string) []string {
	environment := make([]string, 0, len(os.Environ())+len(overrides))
	for _, entry := range os.Environ() {
		name, _, _ := strings.Cut(entry, "=")
		if _, replaced := overrides[name]; replaced || sensitiveProviderEnvironment(name) {
			continue
		}
		environment = append(environment, entry)
	}
	for name, value := range overrides {
		environment = append(environment, name+"="+value)
	}
	return environment
}

func sensitiveProviderEnvironment(name string) bool {
	switch name {
	case "FLY_API_TOKEN", "FLY_ACCESS_TOKEN", "SPRITE_TOKEN", "SETTA_INNER_RUNTIME_CREDENTIAL":
		return true
	default:
		return false
	}
}

type limitedBuffer struct {
	buffer   bytes.Buffer
	exceeded bool
}

func (buffer *limitedBuffer) Write(data []byte) (int, error) {
	if buffer.exceeded {
		return len(data), nil
	}
	remaining := maximumFlyCommandOutput - buffer.buffer.Len()
	if remaining <= 0 {
		buffer.exceeded = true
		return len(data), nil
	}
	toWrite := data
	if len(toWrite) > remaining {
		toWrite = toWrite[:remaining]
		buffer.exceeded = true
	}
	_, _ = buffer.buffer.Write(toWrite)
	return len(data), nil
}

func (buffer *limitedBuffer) bytes() []byte {
	return append([]byte(nil), buffer.buffer.Bytes()...)
}

var _ io.Writer = (*limitedBuffer)(nil)
var _ FlyCommandRunner = (*ExecFlyCommandRunner)(nil)
