package runtimeinstall

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"

	"setta/internal/runtimeprovider"
)

const maximumVerifierBytes = 64 * 1024 * 1024

type RuntimeExecutor interface {
	Exec(context.Context, runtimeprovider.ExecRequest) (runtimeprovider.ExecResult, error)
}

type VerifierInstaller struct {
	Executor RuntimeExecutor
}

type VerifierInstallRequest struct {
	RuntimeName string
	LocalPath   string
	RemotePath  string
	SHA256      string
	Layout      Layout
}

// Ensure installs one digest-pinned release verifier into a protected runtime
// path. Existing content is adopted only when it is a regular non-symlink file
// with the exact requested digest; drift is never overwritten silently.
func (installer VerifierInstaller) Ensure(ctx context.Context, request VerifierInstallRequest) error {
	if installer.Executor == nil {
		return fmt.Errorf("%w: runtime executor is required", runtimeprovider.ErrInvalidContract)
	}
	if err := runtimeprovider.ValidateManagedName(request.RuntimeName); err != nil {
		return err
	}
	layout, err := normalizeLayout(request.Layout)
	if err != nil {
		return err
	}
	if err := validateRemoteVerifierPath(request.RemotePath, layout); err != nil {
		return err
	}
	verifier, err := readPinnedVerifier(request.LocalPath, request.SHA256)
	if err != nil {
		return err
	}
	found, err := installer.inspectRemoteVerifier(ctx, request)
	if err != nil {
		return err
	}
	if found {
		return installer.protectAndVerify(ctx, request, request.RemotePath)
	}
	return installer.install(ctx, request, layout, verifier)
}

func (installer VerifierInstaller) inspectRemoteVerifier(ctx context.Context, request VerifierInstallRequest) (bool, error) {
	symlink, err := installer.remoteTest(ctx, request.RuntimeName, "-L", request.RemotePath)
	if err != nil {
		return false, err
	}
	if symlink {
		return false, errors.New("remote runtime release verifier must not be a symlink")
	}
	found, err := installer.remoteTest(ctx, request.RuntimeName, "-f", request.RemotePath)
	if err != nil || !found {
		return found, err
	}
	if err := installer.requireRemoteSHA256(ctx, request.RuntimeName, request.RemotePath, request.SHA256); err != nil {
		return false, errors.New("existing runtime release verifier differs from the pinned digest")
	}
	return true, nil
}

func (installer VerifierInstaller) install(
	ctx context.Context,
	request VerifierInstallRequest,
	layout Layout,
	verifier []byte,
) error {
	if err := installer.execRequired(ctx, request.RuntimeName, "/usr/bin/install", []string{
		"-d", "-m", "0755", "-o", "root", "-g", "root", layout.ReleaseRoot,
	}, nil, "create protected verifier directory"); err != nil {
		return err
	}
	temporaryPath := path.Join(layout.ReleaseRoot, ".incoming-setta-release-verify-"+request.SHA256[:16])
	if err := installer.execRequired(ctx, request.RuntimeName, "/usr/bin/dd", []string{
		"of=" + temporaryPath, "status=none",
	}, verifier, "upload runtime release verifier"); err != nil {
		return err
	}
	if err := installer.execRequired(ctx, request.RuntimeName, "/bin/chmod", []string{"0600", temporaryPath}, nil, "protect staged runtime release verifier"); err != nil {
		return err
	}
	if err := installer.requireRemoteSHA256(ctx, request.RuntimeName, temporaryPath, request.SHA256); err != nil {
		return err
	}
	if err := installer.protect(ctx, request.RuntimeName, temporaryPath); err != nil {
		return err
	}
	if err := installer.execRequired(ctx, request.RuntimeName, "/bin/mv", []string{
		temporaryPath, request.RemotePath,
	}, nil, "publish runtime release verifier"); err != nil {
		return err
	}
	return installer.requireRemoteSHA256(ctx, request.RuntimeName, request.RemotePath, request.SHA256)
}

func (installer VerifierInstaller) protectAndVerify(ctx context.Context, request VerifierInstallRequest, remotePath string) error {
	if err := installer.protect(ctx, request.RuntimeName, remotePath); err != nil {
		return err
	}
	return installer.requireRemoteSHA256(ctx, request.RuntimeName, remotePath, request.SHA256)
}

func (installer VerifierInstaller) protect(ctx context.Context, runtimeName string, remotePath string) error {
	if err := installer.execRequired(ctx, runtimeName, "/bin/chown", []string{"root:root", remotePath}, nil, "own runtime release verifier"); err != nil {
		return err
	}
	return installer.execRequired(ctx, runtimeName, "/bin/chmod", []string{"0755", remotePath}, nil, "make runtime release verifier executable")
}

func (installer VerifierInstaller) remoteTest(ctx context.Context, runtimeName string, flag string, remotePath string) (bool, error) {
	result, err := installer.Executor.Exec(ctx, runtimeprovider.ExecRequest{
		RuntimeName: runtimeName, Path: "/usr/bin/test", Arguments: []string{flag, remotePath},
	})
	if err != nil {
		return false, err
	}
	switch result.ExitCode {
	case 0:
		return true, nil
	case 1:
		return false, nil
	default:
		return false, fmt.Errorf("inspect remote runtime release verifier exit=%d stderr=%q", result.ExitCode, strings.TrimSpace(string(result.Stderr)))
	}
}

func (installer VerifierInstaller) requireRemoteSHA256(ctx context.Context, runtimeName string, remotePath string, want string) error {
	result, err := installer.Executor.Exec(ctx, runtimeprovider.ExecRequest{
		RuntimeName: runtimeName, Path: "/usr/bin/sha256sum", Arguments: []string{remotePath},
	})
	if err != nil {
		return err
	}
	fields := strings.Fields(string(result.Stdout))
	if result.ExitCode != 0 || len(fields) != 2 || fields[0] != want {
		return fmt.Errorf("verify remote runtime release verifier SHA-256 exit=%d output=%q stderr=%q", result.ExitCode, strings.TrimSpace(string(result.Stdout)), strings.TrimSpace(string(result.Stderr)))
	}
	return nil
}

func (installer VerifierInstaller) execRequired(
	ctx context.Context,
	runtimeName string,
	commandPath string,
	arguments []string,
	stdin []byte,
	operation string,
) error {
	result, err := installer.Executor.Exec(ctx, runtimeprovider.ExecRequest{
		RuntimeName: runtimeName, Path: commandPath, Arguments: arguments, Stdin: stdin,
	})
	if err != nil {
		return fmt.Errorf("%s: %w", operation, err)
	}
	if result.ExitCode != 0 {
		return fmt.Errorf("%s exit=%d stderr=%q", operation, result.ExitCode, strings.TrimSpace(string(result.Stderr)))
	}
	return nil
}

func readPinnedVerifier(localPath string, wantSHA256 string) ([]byte, error) {
	if !filepath.IsAbs(localPath) || !sha256HexPattern.MatchString(wantSHA256) {
		return nil, fmt.Errorf("%w: verifier path and lowercase SHA-256 are required", ErrInvalidRelease)
	}
	file, err := openPrivateVerifier(localPath)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	data, err := readVerifierBytes(file)
	if err != nil {
		return nil, err
	}
	digest := sha256.Sum256(data)
	if hex.EncodeToString(digest[:]) != wantSHA256 {
		return nil, fmt.Errorf("%w: verifier SHA-256 mismatch", ErrInvalidRelease)
	}
	return data, nil
}

func openPrivateVerifier(localPath string) (*os.File, error) {
	pathInfo, err := os.Lstat(localPath)
	if err != nil {
		return nil, fmt.Errorf("%w: inspect verifier: %v", ErrInvalidRelease, err)
	}
	if !pathInfo.Mode().IsRegular() || pathInfo.Mode().Perm()&0o077 != 0 {
		return nil, fmt.Errorf("%w: verifier must be a private regular file", ErrInvalidRelease)
	}
	file, err := os.Open(localPath)
	if err != nil {
		return nil, fmt.Errorf("%w: open verifier: %v", ErrInvalidRelease, err)
	}
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Mode().Perm()&0o077 != 0 || !os.SameFile(pathInfo, info) {
		file.Close()
		return nil, fmt.Errorf("%w: verifier changed while opening", ErrInvalidRelease)
	}
	return file, nil
}

func readVerifierBytes(file *os.File) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(file, maximumVerifierBytes+1))
	if err != nil || len(data) > maximumVerifierBytes {
		return nil, fmt.Errorf("%w: read verifier failed or exceeded %d bytes", ErrInvalidRelease, maximumVerifierBytes)
	}
	return data, nil
}
