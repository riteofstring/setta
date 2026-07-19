package hostedmeasurement

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"strings"
)

type ImageCommandRunner interface {
	Run(context.Context, FlyCommand) ([]byte, error)
}

type FlyImagePublisher struct {
	Docker        ImageCommandRunner
	Fly           ImageCommandRunner
	MutationToken string
}

type FlyImagePublishRequest struct {
	Authorization Authorization
	BuildContext  string
	BuildxPlugin  string
	DockerConfig  string
	Dockerfile    string
	MetadataPath  string
}

func (publisher FlyImagePublisher) Publish(ctx context.Context, request FlyImagePublishRequest) (string, error) {
	if publisher.Docker == nil || publisher.Fly == nil || !validFlyToken([]byte(publisher.MutationToken)) {
		return "", errors.New("Fly image publisher requires command runners and a mutation credential")
	}
	if reference, ok, err := existingPublishedImage(request); ok || err != nil {
		return reference, err
	}
	if err := prepareImagePublishPaths(request); err != nil {
		return "", err
	}
	environment := map[string]string{
		"DOCKER_CONFIG": request.DockerConfig,
		"NO_COLOR":      "1",
	}
	if _, err := publisher.Fly.Run(ctx, FlyCommand{
		Arguments: []string{"auth", "docker"},
		Environment: map[string]string{
			"DOCKER_CONFIG": request.DockerConfig,
			"FLY_API_TOKEN": publisher.MutationToken,
			"NO_COLOR":      "1",
		},
	}); err != nil {
		return "", errors.New("authenticate isolated Fly registry client failed")
	}
	tag := "registry.fly.io/" + request.Authorization.Manifest.FlyAppName + ":" + request.Authorization.Manifest.RunID
	if _, err := publisher.Docker.Run(ctx, FlyCommand{
		Arguments: []string{
			"buildx", "build", "--platform", "linux/amd64", "--push", "--no-cache",
			"--provenance=false", "--metadata-file", request.MetadataPath, "--tag", tag,
			"--file", request.Dockerfile, request.BuildContext,
		},
		Environment: environment,
	}); err != nil {
		return "", errors.New("build and publish Fly control-plane image failed")
	}
	return ResolvePublishedImageReference(request.MetadataPath, request.Authorization)
}

func existingPublishedImage(request FlyImagePublishRequest) (string, bool, error) {
	_, err := os.Lstat(request.MetadataPath)
	if errors.Is(err, os.ErrNotExist) {
		return "", false, nil
	}
	if err != nil {
		return "", false, errors.New("inspect published image metadata failed")
	}
	reference, resolveErr := ResolvePublishedImageReference(request.MetadataPath, request.Authorization)
	return reference, true, resolveErr
}

func prepareImagePublishPaths(request FlyImagePublishRequest) error {
	if err := ValidateImagePublishInputs(request); err != nil {
		return err
	}
	return prepareImagePublishOutputs(request)
}

func ValidateImagePublishInputs(request FlyImagePublishRequest) error {
	if err := validateImagePublishLocations(request); err != nil {
		return err
	}
	return validateImageBuildInputs(request)
}

func validateImagePublishLocations(request FlyImagePublishRequest) error {
	if filepath.Clean(filepath.Dir(request.MetadataPath)) != request.Authorization.StateDirectory ||
		filepath.Clean(filepath.Dir(request.DockerConfig)) != request.Authorization.StateDirectory {
		return errors.New("image publisher outputs must stay in the private run directory")
	}
	if !filepath.IsAbs(request.BuildContext) || !filepath.IsAbs(request.BuildxPlugin) || !filepath.IsAbs(request.Dockerfile) {
		return errors.New("image publisher inputs must be absolute paths")
	}
	if filepath.Clean(filepath.Dir(request.Dockerfile)) != filepath.Clean(request.BuildContext) ||
		filepath.Base(request.Dockerfile) != "Dockerfile" {
		return errors.New("image publisher Dockerfile must be the checked build-context Dockerfile")
	}
	return nil
}

func validateImageBuildInputs(request FlyImagePublishRequest) error {
	if err := validatePrivateDirectory(request.BuildContext); err != nil {
		return err
	}
	for _, path := range []string{
		request.Dockerfile,
		filepath.Join(request.BuildContext, "setta-control-plane-linux-amd64"),
		filepath.Join(request.BuildContext, "SHA256SUMS"),
	} {
		info, err := os.Lstat(path)
		if err != nil || !info.Mode().IsRegular() {
			return errors.New("image publisher build context is incomplete")
		}
	}
	if err := verifyImageBuildContext(request.BuildContext); err != nil {
		return err
	}
	return nil
}

func prepareImagePublishOutputs(request FlyImagePublishRequest) error {
	if err := os.Mkdir(request.DockerConfig, 0o700); err != nil && !errors.Is(err, os.ErrExist) {
		return errors.New("create isolated Docker configuration failed")
	}
	if err := validatePrivateDirectory(request.DockerConfig); err != nil {
		return err
	}
	if err := prepareBuildxPlugin(request); err != nil {
		return err
	}
	file, err := os.OpenFile(request.MetadataPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return errors.New("create private image metadata file failed")
	}
	return file.Close()
}

func prepareBuildxPlugin(request FlyImagePublishRequest) error {
	resolved, err := resolveBuildxPlugin(request.BuildxPlugin)
	if err != nil {
		return err
	}
	pluginDirectory := filepath.Join(request.DockerConfig, "cli-plugins")
	if err := os.Mkdir(pluginDirectory, 0o700); err != nil && !errors.Is(err, os.ErrExist) {
		return errors.New("create isolated Docker plugin directory failed")
	}
	if err := validatePrivateDirectory(pluginDirectory); err != nil {
		return err
	}
	return installBuildxPluginLink(filepath.Join(pluginDirectory, "docker-buildx"), resolved)
}

func resolveBuildxPlugin(path string) (string, error) {
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		return "", errors.New("resolve Docker Buildx plugin failed")
	}
	info, err := os.Stat(resolved)
	if err != nil || !info.Mode().IsRegular() || info.Mode().Perm()&0o111 == 0 {
		return "", errors.New("Docker Buildx plugin must be an executable regular file")
	}
	return resolved, nil
}

func installBuildxPluginLink(pluginPath string, resolved string) error {
	if err := os.Symlink(resolved, pluginPath); err == nil {
		return nil
	} else if !errors.Is(err, os.ErrExist) {
		return errors.New("install isolated Docker Buildx plugin failed")
	}
	target, err := os.Readlink(pluginPath)
	if err != nil || target != resolved {
		return errors.New("isolated Docker Buildx plugin differs from the guarded input")
	}
	return nil
}

func verifyImageBuildContext(directory string) error {
	binary, err := readPrivateRegularFile(
		filepath.Join(directory, "setta-control-plane-linux-amd64"),
		64*1024*1024,
		"control-plane release binary",
	)
	if err != nil {
		return err
	}
	checksums, err := readPrivateRegularFile(filepath.Join(directory, "SHA256SUMS"), 1024, "control-plane release checksums")
	if err != nil {
		return err
	}
	digest := sha256.Sum256(binary)
	want := hex.EncodeToString(digest[:]) + "  setta-control-plane-linux-amd64"
	if strings.TrimSuffix(string(checksums), "\n") != want {
		return errors.New("control-plane release checksum verification failed")
	}
	return nil
}
