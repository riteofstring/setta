package evalharness

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

const (
	containerSecurityScannerDockerfileRelativePath = "evals/sandbox/container-security-scanner.Dockerfile"
	containerSecurityScannerBinaryMaximumBytes     = 256 * 1024 * 1024
	containerSecurityScannerCAMaximumBytes         = 1024 * 1024
)

type containerSecurityScannerResources struct {
	client          phase0DockerClient
	tag             string
	imageID         string
	buildRoot       string
	sourceContainer string
	sourceCreated   bool
	imageBuilt      bool
}

func prepareContainerSecurityScanner(
	ctx context.Context,
	repoRoot string,
	client phase0DockerClient,
	pin containerSecurityPolicyPin,
) (*containerSecurityScannerResources, error) {
	suffix, err := phase0RandomHex(6)
	if err != nil {
		return nil, err
	}
	base := "setta-container-security-" + suffix
	resources := &containerSecurityScannerResources{
		client:          client,
		tag:             base + ":scanner",
		sourceContainer: base + "-source",
	}
	if err := resources.prepareBuildContext(ctx, repoRoot, pin); err != nil {
		return nil, errors.Join(err, resources.cleanup())
	}
	if err := resources.build(ctx, pin.Platform); err != nil {
		return nil, errors.Join(err, resources.cleanup())
	}
	if err := resources.removeBuildRoot(); err != nil {
		return nil, errors.Join(err, resources.cleanup())
	}
	return resources, nil
}

func (resources *containerSecurityScannerResources) prepareBuildContext(
	ctx context.Context,
	repoRoot string,
	pin containerSecurityPolicyPin,
) error {
	root, err := os.MkdirTemp("", "setta-container-security-scanner-")
	if err != nil {
		return fmt.Errorf("create hardened scanner build context: %w", err)
	}
	resources.buildRoot = root
	if _, err := copyAndHashPhase0File(
		filepath.Join(repoRoot, filepath.FromSlash(containerSecurityScannerDockerfileRelativePath)),
		filepath.Join(root, "Dockerfile"),
	); err != nil {
		return fmt.Errorf("copy hardened scanner Dockerfile: %w", err)
	}
	resources.sourceCreated = true
	if _, err := resources.client.run(
		ctx,
		"container", "create",
		"--name", resources.sourceContainer,
		"--pull", "never",
		"--platform", pin.Platform,
		"--entrypoint", "/usr/local/bin/trivy",
		pin.Scanner.Image,
		"version",
	); err != nil {
		return fmt.Errorf("create pinned Trivy extraction container: %w", err)
	}
	inputs := []struct {
		label        string
		source       string
		destination  string
		wantSHA256   string
		maximumBytes int64
	}{
		{
			label:        "binary",
			source:       "/usr/local/bin/trivy",
			destination:  filepath.Join(root, "trivy"),
			wantSHA256:   pin.Scanner.Runtime.BinarySHA256,
			maximumBytes: containerSecurityScannerBinaryMaximumBytes,
		},
		{
			label:        "CA certificate bundle",
			source:       "/etc/ssl/certs/ca-certificates.crt",
			destination:  filepath.Join(root, "ca-certificates.crt"),
			wantSHA256:   pin.Scanner.Runtime.CACertificatesSHA256,
			maximumBytes: containerSecurityScannerCAMaximumBytes,
		},
	}
	for _, input := range inputs {
		if _, err := resources.client.run(
			ctx,
			"container", "cp",
			resources.sourceContainer+":"+input.source,
			input.destination,
		); err != nil {
			return fmt.Errorf("extract pinned Trivy %s: %w", input.label, err)
		}
		digest, err := hashContainerSecurityFile(input.destination, input.maximumBytes)
		if err != nil {
			return err
		}
		if digest != input.wantSHA256 {
			return fmt.Errorf(
				"pinned Trivy %s SHA-256 is %s, want %s",
				input.label,
				digest,
				input.wantSHA256,
			)
		}
	}
	if err := resources.removeSourceContainer(ctx); err != nil {
		return err
	}
	return nil
}

func (resources *containerSecurityScannerResources) build(
	ctx context.Context,
	platform string,
) error {
	resources.imageBuilt = true
	if _, err := resources.client.run(
		ctx,
		"build",
		"--network", "none",
		"--platform", platform,
		"--pull=false",
		"--provenance=false",
		"--label", "com.setta.security.role=scanner",
		"--tag", resources.tag,
		resources.buildRoot,
	); err != nil {
		return fmt.Errorf("build hardened Trivy runtime image: %w", err)
	}
	imageID, err := inspectPhase1TaggedImage(ctx, resources.client, resources.tag)
	if err != nil {
		return fmt.Errorf("inspect hardened Trivy runtime image: %w", err)
	}
	resources.imageID = imageID
	return nil
}

func (resources *containerSecurityScannerResources) target() containerSecurityImageTarget {
	return containerSecurityImageTarget{
		name:      "scanner",
		reference: resources.tag,
		imageID:   resources.imageID,
	}
}

func (resources *containerSecurityScannerResources) removeSourceContainer(ctx context.Context) error {
	if resources == nil || !resources.sourceCreated {
		return nil
	}
	if _, err := resources.client.run(
		ctx,
		"container", "rm", "--force", resources.sourceContainer,
	); err != nil {
		exists, inspectErr := resources.client.containerExists(ctx, resources.sourceContainer)
		if inspectErr != nil {
			return errors.Join(
				fmt.Errorf("remove Trivy extraction container: %w", err),
				fmt.Errorf("confirm Trivy extraction container removal: %w", inspectErr),
			)
		}
		if exists {
			return fmt.Errorf("remove Trivy extraction container: %w", err)
		}
	}
	resources.sourceCreated = false
	return nil
}

func (resources *containerSecurityScannerResources) removeBuildRoot() error {
	if resources == nil || resources.buildRoot == "" {
		return nil
	}
	root := resources.buildRoot
	if err := os.RemoveAll(root); err != nil {
		return fmt.Errorf("remove hardened scanner build context: %w", err)
	}
	if _, err := os.Stat(root); !errors.Is(err, os.ErrNotExist) {
		return errors.New("hardened scanner build context remains after cleanup")
	}
	resources.buildRoot = ""
	return nil
}

func (resources *containerSecurityScannerResources) cleanup() error {
	if resources == nil {
		return nil
	}
	cleanupContext, cancel := context.WithTimeout(context.Background(), phase1CleanupTimeout)
	defer cancel()
	var cleanupErrors []error
	if err := resources.removeSourceContainer(cleanupContext); err != nil {
		cleanupErrors = append(cleanupErrors, err)
	}
	if resources.imageBuilt {
		if _, err := resources.client.run(cleanupContext, "image", "rm", resources.tag); err != nil {
			exists, inspectErr := resources.client.imageTagExists(cleanupContext, resources.tag)
			if inspectErr != nil {
				cleanupErrors = append(cleanupErrors, errors.Join(
					fmt.Errorf("remove hardened scanner image: %w", err),
					fmt.Errorf("confirm hardened scanner image removal: %w", inspectErr),
				))
			} else if exists {
				cleanupErrors = append(cleanupErrors, fmt.Errorf("remove hardened scanner image: %w", err))
			}
		}
		resources.imageBuilt = false
	}
	if err := resources.removeBuildRoot(); err != nil {
		cleanupErrors = append(cleanupErrors, err)
	}
	return errors.Join(cleanupErrors...)
}
