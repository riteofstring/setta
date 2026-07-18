package chat

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestResolveWorkspaceTrashTargetAcceptsWorkspaceItem(t *testing.T) {
	root := t.TempDir()
	target := filepath.Join(root, "nested", "delete me.txt")
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		t.Fatalf("create nested directory: %v", err)
	}
	if err := os.WriteFile(target, []byte("recoverable"), 0o644); err != nil {
		t.Fatalf("write target: %v", err)
	}

	resolved, err := resolveWorkspaceTrashTarget(root, filepath.Join("nested", "delete me.txt"))
	if err != nil {
		t.Fatalf("resolve workspace trash target: %v", err)
	}
	resolvedRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		t.Fatalf("resolve test root: %v", err)
	}
	want := filepath.Join(resolvedRoot, "nested", "delete me.txt")
	if resolved != want {
		t.Fatalf("resolved target = %q, want %q", resolved, want)
	}
}

func TestResolveWorkspaceTrashTargetRejectsWorkspaceRootAndOutsidePaths(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	outFile := filepath.Join(outside, "keep.txt")
	if err := os.WriteFile(outFile, []byte("keep"), 0o644); err != nil {
		t.Fatalf("write outside target: %v", err)
	}

	for _, test := range []struct {
		name string
		path string
		want string
	}{
		{name: "workspace root", path: ".", want: "cannot move the workspace root"},
		{name: "parent traversal", path: filepath.Join("..", filepath.Base(outside), "keep.txt"), want: "outside the workspace"},
		{name: "absolute outside", path: outFile, want: "outside the workspace"},
	} {
		t.Run(test.name, func(t *testing.T) {
			_, err := resolveWorkspaceTrashTarget(root, test.path)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("resolve error = %v, want %q", err, test.want)
			}
		})
	}
}

func TestResolveWorkspaceTrashTargetRejectsParentSymlinkEscape(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	outsideFile := filepath.Join(outside, "keep.txt")
	if err := os.WriteFile(outsideFile, []byte("keep"), 0o644); err != nil {
		t.Fatalf("write outside target: %v", err)
	}
	link := filepath.Join(root, "outside-link")
	if err := os.Symlink(outside, link); err != nil {
		t.Fatalf("create outside symlink: %v", err)
	}

	_, err := resolveWorkspaceTrashTarget(root, filepath.Join("outside-link", "keep.txt"))
	if err == nil || !strings.Contains(err.Error(), "outside the workspace") {
		t.Fatalf("resolve error = %v, want symlink escape rejection", err)
	}
}

func TestResolveWorkspaceTrashTargetCanTrashSymlinkWithoutFollowingIt(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	link := filepath.Join(root, "outside-link")
	if err := os.Symlink(outside, link); err != nil {
		t.Fatalf("create outside symlink: %v", err)
	}

	resolved, err := resolveWorkspaceTrashTarget(root, "outside-link")
	if err != nil {
		t.Fatalf("resolve symlink itself: %v", err)
	}
	resolvedRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		t.Fatalf("resolve test root: %v", err)
	}
	want := filepath.Join(resolvedRoot, "outside-link")
	if resolved != want {
		t.Fatalf("resolved symlink = %q, want %q", resolved, want)
	}
}

func TestDecodeSettaMoveToTrashArgumentsIsStrict(t *testing.T) {
	arguments, err := decodeSettaMoveToTrashArguments([]byte(`{"path":"old.log"}`))
	if err != nil || arguments.Path != "old.log" {
		t.Fatalf("arguments = %+v error = %v, want old.log", arguments, err)
	}
	for _, payload := range []string{`{}`, `{"path":""}`, `{"path":"old.log","force":true}`, `{"path":"old.log"} {}`} {
		if _, err := decodeSettaMoveToTrashArguments([]byte(payload)); err == nil {
			t.Fatalf("payload %s was accepted", payload)
		}
	}
}

func TestTrashCommandForOperatingSystem(t *testing.T) {
	lookup := func(command string) (string, error) {
		paths := map[string]string{
			"gio":            "/usr/bin/gio",
			"powershell.exe": `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`,
			"trash":          "/usr/bin/trash",
		}
		path, ok := paths[command]
		if !ok {
			return "", errors.New("not found")
		}
		return path, nil
	}
	tests := []struct {
		goos        string
		wantCommand string
		wantArgs    []string
	}{
		{goos: "darwin", wantCommand: "/usr/bin/trash", wantArgs: []string{"--", "/workspace/old.txt"}},
		{goos: "linux", wantCommand: "/usr/bin/gio", wantArgs: []string{"trash", "--", "/workspace/old.txt"}},
		{goos: "windows", wantCommand: `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`},
	}
	for _, test := range tests {
		t.Run(test.goos, func(t *testing.T) {
			command, args, err := trashCommandForOperatingSystem(test.goos, "/workspace/old.txt", lookup)
			if err != nil {
				t.Fatalf("trash command: %v", err)
			}
			if command != test.wantCommand {
				t.Fatalf("command = %q, want %q", command, test.wantCommand)
			}
			if test.wantArgs != nil {
				if len(args) != len(test.wantArgs) {
					t.Fatalf("args = %+v, want %+v", args, test.wantArgs)
				}
				for index := range args {
					if args[index] != test.wantArgs[index] {
						t.Fatalf("args = %+v, want %+v", args, test.wantArgs)
					}
				}
				return
			}
			if len(args) < 2 || args[len(args)-1] != "/workspace/old.txt" || args[0] != "-NoProfile" {
				t.Fatalf("Windows args = %+v, want non-interactive PowerShell with literal path argument", args)
			}
		})
	}
}

func TestTrashCommandForLinuxFailsWithoutTrashProvider(t *testing.T) {
	_, _, err := trashCommandForOperatingSystem("linux", "/workspace/old.txt", func(string) (string, error) {
		return "", errors.New("not found")
	})
	if err == nil || !strings.Contains(err.Error(), "requires gio or trash-put") {
		t.Fatalf("error = %v, want missing Linux trash provider", err)
	}
}
