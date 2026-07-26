package hostedmeasurement

import (
	"context"
	"encoding/base64"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestExecFlyCommandRunnerPreservesSymlinkInvocationName(t *testing.T) {
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	invocation := filepath.Join(t.TempDir(), "docker")
	if err := os.Symlink(executable, invocation); err != nil {
		t.Fatal(err)
	}
	runner, err := NewExecFlyCommandRunner(invocation)
	if err != nil {
		t.Fatal(err)
	}
	output, err := runner.Run(context.Background(), FlyCommand{
		Arguments:   []string{"-test.run=^TestExecFlyCommandRunnerArgv0Helper$"},
		Environment: map[string]string{"SETTA_TEST_PRINT_ARGV0": "1"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if string(output) != invocation {
		t.Fatalf("invocation name = %q, want %q", output, invocation)
	}
}

func TestExecFlyCommandRunnerArgv0Helper(t *testing.T) {
	if os.Getenv("SETTA_TEST_PRINT_ARGV0") != "1" {
		return
	}
	_, _ = os.Stdout.WriteString(os.Args[0])
	os.Exit(0)
}

func TestFlySecretStagerUsesStdinAndDoesNotExposeInnerCredentialToProcessEnvironment(t *testing.T) {
	runner := &recordingFlyCommandRunner{}
	stager, err := NewFlySecretStager(runner, []byte(testMutationToken))
	if err != nil {
		t.Fatal(err)
	}
	secrets := FlyStagedSecrets{
		SpriteToken: []byte("sprite-token-sentinel"), InnerRuntimeCredential: []byte("inner-runtime-sentinel"),
	}
	if err := stager.Stage(context.Background(), "setta-gateway-night", secrets); err != nil {
		t.Fatalf("Stage: %v", err)
	}
	wantArgs := []string{"secrets", "import", "--stage", "--app", "setta-gateway-night"}
	if !reflect.DeepEqual(runner.command.Arguments, wantArgs) {
		t.Fatalf("arguments = %v, want %v", runner.command.Arguments, wantArgs)
	}
	if runner.command.Environment["FLY_API_TOKEN"] != testMutationToken || strings.Contains(strings.Join(runner.command.Arguments, " "), "sentinel") {
		t.Fatal("secret staging did not keep credentials out of process arguments")
	}
	innerEncoded := base64.StdEncoding.EncodeToString(secrets.InnerRuntimeCredential)
	wantStdin := "SPRITE_TOKEN=sprite-token-sentinel\nSETTA_INNER_RUNTIME_CREDENTIAL=" + innerEncoded + "\n"
	if string(runner.command.Stdin) != wantStdin {
		t.Fatalf("secret import stdin differs from the fixed two-secret payload")
	}
}

func TestFlySecretStagerRejectsUnsafeValuesAndRedactsRunnerErrors(t *testing.T) {
	runner := &recordingFlyCommandRunner{err: errors.New("provider printed sprite-token-sentinel")}
	stager, err := NewFlySecretStager(runner, []byte(testMutationToken))
	if err != nil {
		t.Fatal(err)
	}
	err = stager.Stage(context.Background(), "setta-gateway-night", FlyStagedSecrets{
		SpriteToken: []byte("sprite-token-sentinel"), InnerRuntimeCredential: []byte("inner-runtime-sentinel"),
	})
	if err == nil || strings.Contains(err.Error(), "sentinel") || strings.Contains(err.Error(), "provider printed") {
		t.Fatalf("contentful secret staging error = %v", err)
	}
	if err := stager.Stage(context.Background(), "setta-gateway-night", FlyStagedSecrets{
		SpriteToken: []byte("bad\nvalue"), InnerRuntimeCredential: []byte("inner-runtime-sentinel"),
	}); err == nil {
		t.Fatal("Stage accepted a multiline secret")
	}
}

func TestBuildCreateMachineRequestRestrictsAppSecretsAndMapsInnerCredentialFile(t *testing.T) {
	request := buildCreateMachineRequest(testMachineSpec())
	if _, exists := request.Config.Env["SPRITE_TOKEN"]; exists {
		t.Fatal("machine config copied SPRITE_TOKEN into non-secret environment")
	}
	if _, exists := request.Config.Env["SETTA_INNER_RUNTIME_CREDENTIAL"]; exists {
		t.Fatal("machine config copied inner credential into non-secret environment")
	}
	if len(request.Config.Files) != 1 || request.Config.Files[0].GuestPath != "/run/setta/inner-runtime-credential" ||
		request.Config.Files[0].SecretName != "SETTA_INNER_RUNTIME_CREDENTIAL" {
		t.Fatalf("machine secret file mapping = %+v", request.Config.Files)
	}
	if len(request.Config.Processes) != 1 || !request.Config.Processes[0].IgnoreAppSecrets ||
		!reflect.DeepEqual(request.Config.Processes[0].Secrets, []flyMachineProcessSecret{{EnvironmentVariable: "SPRITE_TOKEN"}}) {
		t.Fatalf("machine process secret allowlist = %+v", request.Config.Processes)
	}
}

func TestFlyCommandEnvironmentRemovesInheritedProviderCredentials(t *testing.T) {
	t.Setenv("FLY_API_TOKEN", "old-fly-token")
	t.Setenv("FLY_ACCESS_TOKEN", "old-access-token")
	t.Setenv("SPRITE_TOKEN", "old-sprite-token")
	environment := flyCommandEnvironment(map[string]string{"FLY_API_TOKEN": "new-token"})
	joined := strings.Join(environment, "\n")
	for _, forbidden := range []string{"old-fly-token", "old-access-token", "old-sprite-token"} {
		if strings.Contains(joined, forbidden) {
			t.Fatalf("flyctl environment retained inherited credential %q", forbidden)
		}
	}
	if strings.Count(joined, "FLY_API_TOKEN=new-token") != 1 {
		t.Fatalf("flyctl environment did not contain exactly one mutation token override")
	}
}

type recordingFlyCommandRunner struct {
	command FlyCommand
	err     error
}

func (runner *recordingFlyCommandRunner) Run(_ context.Context, command FlyCommand) ([]byte, error) {
	runner.command = FlyCommand{
		Arguments: append([]string(nil), command.Arguments...),
		Environment: func() map[string]string {
			cloned := make(map[string]string, len(command.Environment))
			for name, value := range command.Environment {
				cloned[name] = value
			}
			return cloned
		}(),
		Stdin: append([]byte(nil), command.Stdin...),
	}
	return nil, runner.err
}

var _ FlyCommandRunner = (*recordingFlyCommandRunner)(nil)
