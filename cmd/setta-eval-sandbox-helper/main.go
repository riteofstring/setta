package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"sort"
	"strings"
	"syscall"
	"time"

	"setta/internal/evalharness/volumecopy"
)

const (
	probeInputPath              = "/workspace/probe-input.txt"
	probeOutputPath             = "/workspace/probe-output.txt"
	phase1MaximumCopyEntries    = 1024
	phase1MaximumCopyFiles      = 512
	phase1MaximumCopyFileBytes  = 2 * 1024 * 1024
	phase1MaximumCopyTotalBytes = 16 * 1024 * 1024
	phase1ToolVersionTimeout    = 10 * time.Second
)

type environmentEvidence struct {
	UID              int      `json:"uid"`
	GID              int      `json:"gid"`
	EnvironmentNames []string `json:"environmentNames"`
}

type boundaryEvidence struct {
	EnvironmentEvidence environmentEvidence `json:"environment"`
	WorkspaceWrite      bool                `json:"workspaceWrite"`
	RootWriteDenied     bool                `json:"rootWriteDenied"`
	HostCanaryVisible   bool                `json:"hostCanaryVisible"`
	FakeEndpointBlocked bool                `json:"fakeEndpointBlocked"`
}

type fileEvidence struct {
	Path   string `json:"path"`
	Mode   uint32 `json:"mode"`
	Bytes  int    `json:"bytes"`
	SHA256 string `json:"sha256"`
}

type workspaceEntryEvidence struct {
	Path   string `json:"path"`
	Kind   string `json:"kind"`
	Mode   uint32 `json:"mode"`
	Bytes  int    `json:"bytes,omitempty"`
	SHA256 string `json:"sha256,omitempty"`
}

type workspaceEvidence struct {
	Entries []workspaceEntryEvidence `json:"entries"`
}

type toolchainEvidence struct {
	Node string `json:"node"`
	PNPM string `json:"pnpm"`
	Git  string `json:"git"`
}

func main() {
	if err := runHelperCommand(os.Args[1:]); err != nil {
		fatal(err)
	}
}

func runHelperCommand(args []string) error {
	if len(args) == 0 {
		return errors.New("a helper command is required")
	}
	switch args[0] {
	case "boundary":
		return runBoundary(args[1:])
	case "environment":
		return writeJSON(environment())
	case "phase1-copy-volume", "phase1-hold-volume", "phase1-prepare-volume", "phase1-read-file", "phase1-toolchain":
		return runPhase1HelperCommand(args)
	case "seed":
		return runSeed(args[1:])
	case "snapshot":
		return snapshotWorkspace()
	case "verify-output":
		return verifyOutput()
	default:
		return fmt.Errorf("unsupported helper command %q", args[0])
	}
}

func runPhase1HelperCommand(args []string) error {
	switch args[0] {
	case "phase1-copy-volume":
		return runPhase1CopyVolume(args[1:])
	case "phase1-hold-volume":
		return holdPhase1Volume(args[1:])
	case "phase1-prepare-volume":
		return runPhase1PrepareVolume(args[1:])
	case "phase1-read-file":
		return runPhase1ReadFile(args[1:])
	case "phase1-toolchain":
		if len(args) != 1 {
			return errors.New("phase1-toolchain accepts no arguments")
		}
		return inspectPhase1Toolchain()
	default:
		return fmt.Errorf("unsupported Phase 1 helper command %q", args[0])
	}
}

type phase1ReadFileOptions struct {
	path         string
	maximumBytes int64
}

func runPhase1ReadFile(args []string) error {
	options, err := parsePhase1ReadFileOptions(args)
	if err != nil {
		return err
	}
	info, err := inspectPhase1ReadFile(options)
	if err != nil {
		return err
	}
	file, err := os.Open(options.path)
	if err != nil {
		return fmt.Errorf("open Phase 1 evidence file: %w", err)
	}
	_, copyErr := io.CopyN(os.Stdout, file, info.Size())
	closeErr := file.Close()
	return errors.Join(copyErr, closeErr)
}

func parsePhase1ReadFileOptions(args []string) (phase1ReadFileOptions, error) {
	flags := flag.NewFlagSet("phase1-read-file", flag.ContinueOnError)
	root := flags.String("root", "", "read-only sandbox volume root")
	path := flags.String("path", "", "regular file to emit")
	maximumBytes := flags.Int64("max-bytes", 0, "maximum accepted file size")
	if err := flags.Parse(args); err != nil {
		return phase1ReadFileOptions{}, err
	}
	if flags.NArg() != 0 {
		return phase1ReadFileOptions{}, errors.New("phase1-read-file accepts no positional arguments")
	}
	if err := validatePhase1VolumeRoot(*root); err != nil {
		return phase1ReadFileOptions{}, err
	}
	if err := validatePhase1ReadFilePath(*root, *path); err != nil {
		return phase1ReadFileOptions{}, err
	}
	if *maximumBytes <= 0 || *maximumBytes > phase1MaximumCopyTotalBytes {
		return phase1ReadFileOptions{}, fmt.Errorf("phase1-read-file max-bytes must be between 1 and %d", phase1MaximumCopyTotalBytes)
	}
	return phase1ReadFileOptions{
		path:         *path,
		maximumBytes: *maximumBytes,
	}, nil
}

func validatePhase1ReadFilePath(root string, path string) error {
	if path == "" || !filepath.IsAbs(path) || filepath.Clean(path) != path {
		return errors.New("phase1-read-file path must be absolute and clean")
	}
	relative, err := filepath.Rel(root, path)
	if err != nil || relative == "." || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return errors.New("phase1-read-file path must name a file below its volume root")
	}
	return nil
}

func inspectPhase1ReadFile(options phase1ReadFileOptions) (os.FileInfo, error) {
	info, err := os.Lstat(options.path)
	if err != nil {
		return nil, fmt.Errorf("inspect Phase 1 evidence file: %w", err)
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
		return nil, errors.New("phase1-read-file accepts only a regular file, not a symbolic link")
	}
	if info.Size() > options.maximumBytes {
		return nil, fmt.Errorf("Phase 1 evidence file is %d bytes, maximum is %d", info.Size(), options.maximumBytes)
	}
	return info, nil
}

func holdPhase1Volume(args []string) error {
	if len(args) != 0 {
		return errors.New("phase1-hold-volume accepts no arguments")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	<-ctx.Done()
	return nil
}

func runBoundary(args []string) error {
	flags := flag.NewFlagSet("boundary", flag.ContinueOnError)
	hostCanary := flags.String("host-canary", "", "host-only canary path")
	fakeHost := flags.String("fake-host", "", "host-local fake endpoint name")
	fakePort := flags.String("fake-port", "", "host-local fake endpoint port")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if *hostCanary == "" || *fakeHost == "" || *fakePort == "" {
		return errors.New("boundary probe requires host-canary, fake-host, and fake-port")
	}
	workspacePath := filepath.Join("/workspace", ".setta-phase0-write-probe")
	workspaceErr := os.WriteFile(workspacePath, []byte("workspace write probe\n"), 0o600)
	if workspaceErr == nil {
		workspaceErr = os.Remove(workspacePath)
	}
	rootPath := fmt.Sprintf("/setta-phase0-rootfs-probe-%d", os.Getpid())
	rootErr := os.WriteFile(rootPath, []byte("root write probe\n"), 0o600)
	if rootErr == nil {
		_ = os.Remove(rootPath)
	}
	_, canaryErr := os.Stat(*hostCanary)
	if canaryErr != nil && !errors.Is(canaryErr, os.ErrNotExist) {
		return fmt.Errorf("inspect host canary path: %w", canaryErr)
	}
	connection, networkErr := net.DialTimeout(
		"tcp",
		net.JoinHostPort(*fakeHost, *fakePort),
		time.Second,
	)
	if networkErr == nil {
		_ = connection.Close()
	}
	return writeJSON(boundaryEvidence{
		EnvironmentEvidence: environment(),
		WorkspaceWrite:      workspaceErr == nil,
		RootWriteDenied:     rootErr != nil,
		HostCanaryVisible:   canaryErr == nil,
		FakeEndpointBlocked: networkErr != nil,
	})
}

func runSeed(args []string) error {
	flags := flag.NewFlagSet("seed", flag.ContinueOnError)
	value := flags.String("value", "", "fixture value")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if strings.TrimSpace(*value) == "" {
		return errors.New("seed value is required")
	}
	return os.WriteFile(probeInputPath, []byte(*value+"\n"), 0o600)
}

func runPhase1PrepareVolume(args []string) error {
	flags := flag.NewFlagSet("phase1-prepare-volume", flag.ContinueOnError)
	root := flags.String("root", "", "sandbox volume root")
	uid := flags.Int("uid", -1, "sandbox user id")
	gid := flags.Int("gid", -1, "sandbox group id")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if flags.NArg() != 0 {
		return errors.New("phase1-prepare-volume accepts no positional arguments")
	}
	if os.Geteuid() != 0 {
		return errors.New("phase1-prepare-volume must run as root in the seed container")
	}
	if err := validatePhase1VolumeRoot(*root); err != nil {
		return err
	}
	if *uid <= 0 || *gid <= 0 {
		return errors.New("phase1-prepare-volume requires positive uid and gid")
	}
	return filepath.WalkDir(*root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("phase1 volume contains symbolic link %s", path)
		}
		if err := os.Chown(path, *uid, *gid); err != nil {
			return fmt.Errorf("set Phase 1 volume ownership for %s: %w", path, err)
		}
		return nil
	})
}

func runPhase1CopyVolume(args []string) error {
	config, err := parsePhase1CopyVolumeArgs(args)
	if err != nil {
		return err
	}
	entries, err := os.ReadDir(config.destination)
	if err != nil {
		return fmt.Errorf("read Phase 1 copy destination: %w", err)
	}
	if len(entries) != 0 {
		return errors.New("phase1-copy-volume destination must be empty")
	}
	if err := copyPhase1Tree(
		config.source,
		config.destination,
		config.uid,
		config.gid,
	); err != nil {
		var invalidWorkspace *phase1InvalidWorkspaceError
		if errors.As(err, &invalidWorkspace) {
			return writePhase1CopyResult(volumecopy.InvalidWorkspaceResult(err.Error()))
		}
		return err
	}
	if err := os.Chown(config.destination, config.uid, config.gid); err != nil {
		return err
	}
	return writePhase1CopyResult(volumecopy.CopiedResult())
}

func writePhase1CopyResult(result volumecopy.Result) error {
	if err := result.Validate(); err != nil {
		return err
	}
	return writeJSON(result)
}

type phase1CopyVolumeConfig struct {
	source      string
	destination string
	uid         int
	gid         int
}

func parsePhase1CopyVolumeArgs(args []string) (phase1CopyVolumeConfig, error) {
	flags := flag.NewFlagSet("phase1-copy-volume", flag.ContinueOnError)
	source := flags.String("source", "", "read-only source volume root")
	destination := flags.String("destination", "", "writable destination volume root")
	uid := flags.Int("uid", -1, "sandbox user id")
	gid := flags.Int("gid", -1, "sandbox group id")
	if err := flags.Parse(args); err != nil {
		return phase1CopyVolumeConfig{}, err
	}
	if flags.NArg() != 0 {
		return phase1CopyVolumeConfig{}, errors.New("phase1-copy-volume accepts no positional arguments")
	}
	if os.Geteuid() != 0 {
		return phase1CopyVolumeConfig{}, errors.New("phase1-copy-volume must run as root in the copy container")
	}
	if err := validatePhase1VolumeRoot(*source); err != nil {
		return phase1CopyVolumeConfig{}, err
	}
	if err := validatePhase1VolumeRoot(*destination); err != nil {
		return phase1CopyVolumeConfig{}, err
	}
	if *source == *destination {
		return phase1CopyVolumeConfig{}, errors.New("phase1-copy-volume source and destination must differ")
	}
	if *uid <= 0 || *gid <= 0 {
		return phase1CopyVolumeConfig{}, errors.New("phase1-copy-volume requires positive uid and gid")
	}
	return phase1CopyVolumeConfig{
		source:      *source,
		destination: *destination,
		uid:         *uid,
		gid:         *gid,
	}, nil
}

func copyPhase1Tree(source string, destination string, uid int, gid int) error {
	state := &phase1CopyState{
		source:      source,
		destination: destination,
		uid:         uid,
		gid:         gid,
	}
	return filepath.WalkDir(source, func(path string, entry os.DirEntry, walkErr error) error {
		return state.copyEntry(path, entry, walkErr)
	})
}

type phase1CopyState struct {
	source      string
	destination string
	uid         int
	gid         int
	entries     int
	files       int
	totalBytes  int64
}

type phase1InvalidWorkspaceError struct {
	detail string
}

func (err *phase1InvalidWorkspaceError) Error() string {
	return err.detail
}

func invalidPhase1Workspace(detail string) error {
	return &phase1InvalidWorkspaceError{detail: detail}
}

func (state *phase1CopyState) copyEntry(
	path string,
	entry os.DirEntry,
	walkErr error,
) error {
	if walkErr != nil {
		return walkErr
	}
	if path == state.source {
		return nil
	}
	state.entries++
	if state.entries > phase1MaximumCopyEntries {
		return invalidPhase1Workspace("Final workspace exceeds the entry-count limit.")
	}
	relative, err := filepath.Rel(state.source, path)
	if err != nil {
		return err
	}
	target := filepath.Join(state.destination, relative)
	if entry.Type()&os.ModeSymlink != 0 {
		return state.copySymlink(path, target)
	}
	info, err := entry.Info()
	if err != nil {
		return err
	}
	if entry.IsDir() {
		return state.copyDirectory(target, info.Mode().Perm())
	}
	if !info.Mode().IsRegular() {
		return invalidPhase1Workspace(fmt.Sprintf("Final workspace contains non-regular file %s.", relative))
	}
	return state.copyRegularFile(path, target, relative, info)
}

func (state *phase1CopyState) copySymlink(source string, destination string) error {
	target, err := os.Readlink(source)
	if err != nil {
		return err
	}
	if err := os.Symlink(target, destination); err != nil {
		return err
	}
	return os.Lchown(destination, state.uid, state.gid)
}

func (state *phase1CopyState) copyDirectory(path string, mode os.FileMode) error {
	if err := os.Mkdir(path, mode); err != nil {
		return err
	}
	return os.Chown(path, state.uid, state.gid)
}

func (state *phase1CopyState) copyRegularFile(
	source string,
	destination string,
	relative string,
	info os.FileInfo,
) error {
	state.files++
	if state.files > phase1MaximumCopyFiles {
		return invalidPhase1Workspace(fmt.Sprintf("Final workspace exceeds the file-count limit at %s.", relative))
	}
	if info.Size() > phase1MaximumCopyFileBytes {
		return invalidPhase1Workspace(fmt.Sprintf("Final workspace file %s exceeds the byte limit.", relative))
	}
	state.totalBytes += info.Size()
	if state.totalBytes > phase1MaximumCopyTotalBytes {
		return invalidPhase1Workspace("Final workspace exceeds the total byte limit.")
	}
	if err := copyPhase1File(source, destination, info.Mode().Perm()); err != nil {
		return err
	}
	return os.Chown(destination, state.uid, state.gid)
}

func copyPhase1File(source string, destination string, mode os.FileMode) error {
	input, err := os.Open(source)
	if err != nil {
		return err
	}
	defer input.Close()
	output, err := os.OpenFile(destination, os.O_CREATE|os.O_EXCL|os.O_WRONLY, mode)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(output, input)
	closeErr := output.Close()
	return errors.Join(copyErr, closeErr)
}

func validatePhase1VolumeRoot(root string) error {
	switch root {
	case "/app-data", "/baseline", "/seed", "/verification", "/workspace":
		return nil
	default:
		return fmt.Errorf("unsupported Phase 1 volume root %q", root)
	}
}

func inspectPhase1Toolchain() error {
	node, err := commandVersion("node", "--version")
	if err != nil {
		return err
	}
	pnpm, err := commandVersion("pnpm", "--version")
	if err != nil {
		return err
	}
	git, err := commandVersion("git", "--version")
	if err != nil {
		return err
	}
	return writeJSON(toolchainEvidence{
		Node: strings.TrimPrefix(node, "v"),
		PNPM: pnpm,
		Git:  strings.TrimPrefix(git, "git version "),
	})
}

func commandVersion(name string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), phase1ToolVersionTimeout)
	defer cancel()
	command := exec.CommandContext(ctx, name, args...)
	command.Env = []string{
		"HOME=/tmp",
		"LANG=C.UTF-8",
		"PATH=" + os.Getenv("PATH"),
		"TMPDIR=/tmp",
	}
	var output bytes.Buffer
	command.Stdout = &output
	command.Stderr = &output
	if err := command.Run(); err != nil {
		return "", fmt.Errorf("inspect Phase 1 toolchain command %s: %w", name, err)
	}
	value := strings.TrimSpace(output.String())
	if value == "" || strings.ContainsAny(value, "\r\n") {
		return "", fmt.Errorf("Phase 1 toolchain command %s returned an invalid version", name)
	}
	return value, nil
}

func verifyOutput() error {
	evidence, err := inspectFile(probeOutputPath, probeOutputPath)
	if err != nil {
		return fmt.Errorf("read probe output: %w", err)
	}
	return writeJSON(evidence)
}

func snapshotWorkspace() error {
	evidence, err := inspectWorkspace("/workspace")
	if err != nil {
		return fmt.Errorf("snapshot workspace: %w", err)
	}
	return writeJSON(evidence)
}

func inspectWorkspace(root string) (workspaceEvidence, error) {
	evidence := workspaceEvidence{Entries: []workspaceEntryEvidence{}}
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("workspace snapshot refuses symlink %s", path)
		}
		relative, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		reportedPath := filepath.ToSlash(relative)
		if info.IsDir() {
			evidence.Entries = append(evidence.Entries, workspaceEntryEvidence{
				Path: reportedPath,
				Kind: "directory",
				Mode: uint32(info.Mode().Perm()),
			})
			return nil
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("workspace snapshot refuses non-regular entry %s", path)
		}
		file, err := inspectFile(path, filepath.ToSlash(relative))
		if err != nil {
			return err
		}
		evidence.Entries = append(evidence.Entries, workspaceEntryEvidence{
			Path:   file.Path,
			Kind:   "file",
			Mode:   file.Mode,
			Bytes:  file.Bytes,
			SHA256: file.SHA256,
		})
		return nil
	})
	if err != nil {
		return workspaceEvidence{}, err
	}
	sort.Slice(evidence.Entries, func(left int, right int) bool {
		return evidence.Entries[left].Path < evidence.Entries[right].Path
	})
	return evidence, nil
}

func inspectFile(path string, reportedPath string) (fileEvidence, error) {
	file, err := os.OpenFile(
		path,
		os.O_RDONLY|syscall.O_NONBLOCK|syscall.O_NOFOLLOW,
		0,
	)
	if err != nil {
		return fileEvidence{}, err
	}
	info, statErr := file.Stat()
	if statErr != nil {
		return fileEvidence{}, errors.Join(statErr, file.Close())
	}
	if !info.Mode().IsRegular() {
		_ = file.Close()
		return fileEvidence{}, fmt.Errorf("file evidence requires a regular file, not %s", path)
	}
	contents, readErr := io.ReadAll(file)
	if err := errors.Join(readErr, file.Close()); err != nil {
		return fileEvidence{}, err
	}
	digest := sha256.Sum256(contents)
	return fileEvidence{
		Path:   reportedPath,
		Mode:   uint32(info.Mode().Perm()),
		Bytes:  len(contents),
		SHA256: hex.EncodeToString(digest[:]),
	}, nil
}

func environment() environmentEvidence {
	names := make([]string, 0, len(os.Environ()))
	for _, entry := range os.Environ() {
		name, _, _ := strings.Cut(entry, "=")
		names = append(names, name)
	}
	sort.Strings(names)
	return environmentEvidence{
		UID:              os.Geteuid(),
		GID:              os.Getegid(),
		EnvironmentNames: names,
	}
}

func writeJSON(value any) error {
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetEscapeHTML(false)
	return encoder.Encode(value)
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
