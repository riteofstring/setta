package hostedmeasurement

import (
	"context"
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestFlyImagePublisherUsesIsolatedAuthAndTypedPrivateMetadata(t *testing.T) {
	authorization, directory := loadTestAuthorization(t)
	digest := "sha256:" + strings.Repeat("a", 64)
	metadataPath := filepath.Join(directory, "image-metadata.json")
	writeImageBuildContext(t, directory)
	flyRunner := &imageRecordingRunner{}
	dockerRunner := &imageRecordingRunner{run: func(command FlyCommand) error {
		if err := os.Remove(metadataPath); err != nil {
			return err
		}
		data := []byte(`{"containerimage.digest":"` + digest + `"}`)
		return os.WriteFile(metadataPath, data, 0o644)
	}}
	publisher := FlyImagePublisher{Fly: flyRunner, Docker: dockerRunner, MutationToken: testMutationToken}
	request := FlyImagePublishRequest{
		Authorization: authorization, BuildContext: directory, Dockerfile: filepath.Join(directory, "Dockerfile"),
		BuildxPlugin: writeBuildxPlugin(t, directory), DockerConfig: filepath.Join(directory, "docker-config"),
		MetadataPath: metadataPath,
	}
	reference, err := publisher.Publish(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	if reference != "registry.fly.io/"+authorization.Manifest.FlyAppName+"@"+digest {
		t.Fatalf("reference = %q", reference)
	}
	if len(flyRunner.commands) != 1 || strings.Join(flyRunner.commands[0].Arguments, " ") != "auth docker" {
		t.Fatalf("Fly commands = %+v", flyRunner.commands)
	}
	if len(dockerRunner.commands) != 1 || dockerRunner.commands[0].Environment["DOCKER_CONFIG"] != request.DockerConfig {
		t.Fatalf("Docker commands = %+v", dockerRunner.commands)
	}
	if strings.Contains(strings.Join(dockerRunner.commands[0].Arguments, " "), testMutationToken) {
		t.Fatal("image publication exposed the mutation token in arguments")
	}
	info, err := os.Stat(metadataPath)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("published metadata mode = %v", info.Mode().Perm())
	}
}

func writeBuildxPlugin(t *testing.T, directory string) string {
	t.Helper()
	path := filepath.Join(directory, "docker-buildx-fixture")
	if err := os.WriteFile(path, []byte("fixture"), 0o700); err != nil {
		t.Fatal(err)
	}
	return path
}

func writeImageBuildContext(t *testing.T, directory string) {
	t.Helper()
	binary := []byte("binary")
	digest := sha256.Sum256(binary)
	for name, data := range map[string][]byte{
		"Dockerfile":                      []byte("FROM scratch\n"),
		"setta-control-plane-linux-amd64": binary,
		"SHA256SUMS":                      []byte(fmt.Sprintf("%x  setta-control-plane-linux-amd64\n", digest)),
	} {
		if err := os.WriteFile(filepath.Join(directory, name), data, 0o600); err != nil {
			t.Fatal(err)
		}
	}
}

func TestFlyImagePublisherReusesValidMetadataWithoutCommands(t *testing.T) {
	authorization, directory := loadTestAuthorization(t)
	digest := "sha256:" + strings.Repeat("a", 64)
	metadataPath := writePrivateFile(t, directory, "image-metadata.json", []byte(`{"containerimage.digest":"`+digest+`"}`))
	runner := &imageRecordingRunner{}
	publisher := FlyImagePublisher{Fly: runner, Docker: runner, MutationToken: testMutationToken}
	reference, err := publisher.Publish(context.Background(), FlyImagePublishRequest{Authorization: authorization, MetadataPath: metadataPath})
	if err != nil || reference == "" || len(runner.commands) != 0 {
		t.Fatalf("restart publication = %q, %v, commands=%v", reference, err, runner.commands)
	}
}

func TestFlyImagePublisherRejectsUncheckedBuildContextBeforeCommands(t *testing.T) {
	authorization, directory := loadTestAuthorization(t)
	writeImageBuildContext(t, directory)
	if err := os.WriteFile(filepath.Join(directory, "SHA256SUMS"), []byte("wrong\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	runner := &imageRecordingRunner{}
	publisher := FlyImagePublisher{Fly: runner, Docker: runner, MutationToken: testMutationToken}
	_, err := publisher.Publish(context.Background(), FlyImagePublishRequest{
		Authorization: authorization, BuildContext: directory, Dockerfile: filepath.Join(directory, "Dockerfile"),
		BuildxPlugin: writeBuildxPlugin(t, directory), DockerConfig: filepath.Join(directory, "docker-config"),
		MetadataPath: filepath.Join(directory, "image-metadata.json"),
	})
	if err == nil || len(runner.commands) != 0 {
		t.Fatalf("unchecked publication error = %v, commands = %v", err, runner.commands)
	}
}

type imageRecordingRunner struct {
	commands []FlyCommand
	run      func(FlyCommand) error
}

func (runner *imageRecordingRunner) Run(_ context.Context, command FlyCommand) ([]byte, error) {
	runner.commands = append(runner.commands, command)
	if runner.run != nil {
		return nil, runner.run(command)
	}
	return nil, nil
}
