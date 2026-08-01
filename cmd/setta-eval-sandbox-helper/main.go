package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const (
	probeInputPath  = "/workspace/probe-input.txt"
	probeOutputPath = "/workspace/probe-output.txt"
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
	Bytes  int    `json:"bytes"`
	SHA256 string `json:"sha256"`
}

type workspaceEvidence struct {
	Files []fileEvidence `json:"files"`
}

func main() {
	if len(os.Args) < 2 {
		fatal(errors.New("a helper command is required"))
	}
	var err error
	switch os.Args[1] {
	case "boundary":
		err = runBoundary(os.Args[2:])
	case "environment":
		err = writeJSON(environment())
	case "seed":
		err = runSeed(os.Args[2:])
	case "snapshot":
		err = snapshotWorkspace()
	case "verify-output":
		err = verifyOutput()
	default:
		err = fmt.Errorf("unsupported helper command %q", os.Args[1])
	}
	if err != nil {
		fatal(err)
	}
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

func verifyOutput() error {
	evidence, err := inspectFile(probeOutputPath, probeOutputPath)
	if err != nil {
		return fmt.Errorf("read probe output: %w", err)
	}
	return writeJSON(evidence)
}

func snapshotWorkspace() error {
	evidence := workspaceEvidence{Files: []fileEvidence{}}
	err := filepath.WalkDir("/workspace", func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			return nil
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("workspace snapshot refuses symlink %s", path)
		}
		relative, err := filepath.Rel("/workspace", path)
		if err != nil {
			return err
		}
		file, err := inspectFile(path, filepath.ToSlash(relative))
		if err != nil {
			return err
		}
		evidence.Files = append(evidence.Files, file)
		return nil
	})
	if err != nil {
		return fmt.Errorf("snapshot workspace: %w", err)
	}
	sort.Slice(evidence.Files, func(left int, right int) bool {
		return evidence.Files[left].Path < evidence.Files[right].Path
	})
	return writeJSON(evidence)
}

func inspectFile(path string, reportedPath string) (fileEvidence, error) {
	contents, err := os.ReadFile(path)
	if err != nil {
		return fileEvidence{}, err
	}
	digest := sha256.Sum256(contents)
	return fileEvidence{
		Path:   reportedPath,
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
