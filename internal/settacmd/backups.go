package settacmd

import (
	"bufio"
	"flag"
	"fmt"
	"io"
	"path/filepath"
	"strings"
	"time"

	"setta/internal/config"
	"setta/internal/localsessions"
	"setta/internal/projectbackup"
)

type backupsListFlags struct {
	jsonOutput bool
	limit      int
}

type backupsRestoreFlags struct {
	latest     bool
	index      int
	backupPath string
	force      bool
	yes        bool
}

type backupListJSON struct {
	Index     int    `json:"index"`
	Path      string `json:"path"`
	Timestamp string `json:"timestamp"`
}

func runBackups(args []string, global globalFlags, stdin io.Reader, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	if len(args) == 0 {
		return &ExitError{
			Code: 2,
			Err:  fmt.Errorf("missing backups subcommand (supported: list, restore)"),
		}
	}

	switch args[0] {
	case "list":
		return runBackupsList(args[1:], global, stdout, stderr, envLookup, cwd)
	case "restore":
		return runBackupsRestore(args[1:], global, stdin, stdout, stderr, envLookup, cwd)
	default:
		return &ExitError{
			Code: 2,
			Err:  fmt.Errorf("unknown backups subcommand %q", args[0]),
		}
	}
}

func runBackupsList(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	flags := flag.NewFlagSet("backups list", flag.ContinueOnError)
	flags.SetOutput(stderr)

	parsed := backupsListFlags{limit: -1}
	flags.BoolVar(&parsed.jsonOutput, "json", false, "Emit JSON output.")
	flags.IntVar(&parsed.limit, "limit", -1, "Limit number of entries.")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if len(flags.Args()) != 0 {
		return &ExitError{Code: 2, Err: fmt.Errorf("backups list does not accept positional arguments")}
	}
	if parsed.limit == 0 || parsed.limit < -1 {
		return &ExitError{Code: 2, Err: fmt.Errorf("--limit must be >= 1")}
	}

	commandCfg, err := resolveBackupsCommandConfig(global, cwd, envLookup)
	if err != nil {
		return &ExitError{Code: 2, Err: err}
	}
	backupDir := projectbackup.BackupDir(commandCfg.Paths.SettaFilesRoot)
	files, err := projectbackup.ListFiles(backupDir)
	if err != nil {
		return err
	}
	if parsed.limit > 0 && len(files) > parsed.limit {
		files = files[:parsed.limit]
	}

	payload := make([]backupListJSON, 0, len(files))
	for index, file := range files {
		payload = append(payload, backupListJSON{
			Index:     index + 1,
			Path:      file.Path,
			Timestamp: projectbackup.FormatTimestamp(file.Timestamp),
		})
	}

	if parsed.jsonOutput {
		return writeJSONPayload(stdout, payload)
	}
	if len(payload) == 0 {
		_, err := fmt.Fprintf(stdout, "No backups found in %s\n", backupDir)
		return err
	}
	for _, entry := range payload {
		if _, err := fmt.Fprintf(stdout, "%d. %s  %s\n", entry.Index, entry.Timestamp, entry.Path); err != nil {
			return err
		}
	}
	return nil
}

func runBackupsRestore(args []string, global globalFlags, stdin io.Reader, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	flags := flag.NewFlagSet("backups restore", flag.ContinueOnError)
	flags.SetOutput(stderr)

	parsed := backupsRestoreFlags{index: -1}
	flags.BoolVar(&parsed.latest, "latest", false, "Restore the most recent backup.")
	flags.IntVar(&parsed.index, "index", -1, "Restore by list index (1-based).")
	flags.StringVar(&parsed.backupPath, "path", "", "Restore a specific backup file path.")
	flags.BoolVar(&parsed.force, "force", false, "Allow restore even if a Setta session appears to be running.")
	flags.BoolVar(&parsed.yes, "yes", false, "Skip confirmation prompt.")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if len(flags.Args()) != 0 {
		return &ExitError{Code: 2, Err: fmt.Errorf("backups restore does not accept positional arguments")}
	}

	commandCfg, err := resolveBackupsCommandConfig(global, cwd, envLookup)
	if err != nil {
		return &ExitError{Code: 2, Err: err}
	}

	backupDir := projectbackup.BackupDir(commandCfg.Paths.SettaFilesRoot)
	selectedBackupPath, err := projectbackup.ResolveRestorePath(backupDir, projectbackup.RestoreSelection{
		Latest:     parsed.latest,
		Index:      parsed.index,
		BackupPath: resolveBackupPathArg(parsed.backupPath, cwd),
	})
	if err != nil {
		return &ExitError{Code: 2, Err: err}
	}

	registry, err := localsessions.NewRegistry(localsessions.RegistryOptions{
		SessionsRoot: filepath.Join(commandCfg.Paths.RuntimeRoot, "sessions"),
	})
	if err != nil {
		return err
	}
	sessions, err := registry.FindSessionsByWorkspaceAndMode(commandCfg.Paths.WorkspaceRoot, "")
	if err != nil {
		return err
	}
	sessions = localsessions.FilterActiveSessions(sessions)
	if len(sessions) > 0 && !parsed.force {
		sessionIDs := make([]string, 0, len(sessions))
		for _, session := range sessions {
			sessionIDs = append(sessionIDs, session.ID)
		}
		return &ExitError{
			Code: 2,
			Err: fmt.Errorf(
				"Refusing to restore while a Setta session is running for this workspace (%s). Stop it first or pass --force.",
				strings.Join(sessionIDs, ", "),
			),
		}
	}

	projectPath := projectbackup.ProjectPath(commandCfg.Paths.SettaFilesRoot)
	if !parsed.yes {
		confirmed, err := promptForRestoreConfirmation(stdin, stdout, projectPath, selectedBackupPath)
		if err != nil {
			return err
		}
		if !confirmed {
			_, err := fmt.Fprintln(stdout, "Cancelled.")
			return err
		}
	}

	result, err := projectbackup.RestoreProject(selectedBackupPath, projectPath, backupDir, commandNow())
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(stdout, "Restored %s from %s\n", result.ProjectPath, result.BackupPath); err != nil {
		return err
	}
	if strings.TrimSpace(result.StashPath) != "" {
		if _, err := fmt.Fprintf(stdout, "Stashed previous project file at %s\n", result.StashPath); err != nil {
			return err
		}
	}
	_, err = fmt.Fprintln(stdout, "Restart any running Setta backend to load the restored project.")
	return err
}

func resolveBackupsCommandConfig(global globalFlags, cwd string, envLookup func(string) (string, bool)) (config.Config, error) {
	return config.Load(config.LoadOptions{
		CWD:       cwd,
		EnvLookup: envLookup,
		CLI: config.CLIOptions{
			WorkspaceRoot:      strings.TrimSpace(global.workspaceRoot),
			SettaHome:          strings.TrimSpace(global.settaHome),
			ProfileLookupHome:  strings.TrimSpace(global.profileLookupHome),
			SettaFilesRoot:     strings.TrimSpace(global.settaFilesRoot),
			SettaFilesLocation: strings.TrimSpace(global.settaFilesLocation),
			RuntimeRoot:        strings.TrimSpace(global.runtimeRoot),
			Profile:            strings.TrimSpace(global.profile),
		},
	})
}

func resolveBackupPathArg(raw string, cwd string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	if filepath.IsAbs(trimmed) {
		return trimmed
	}
	return filepath.Join(cwd, trimmed)
}

func promptForRestoreConfirmation(stdin io.Reader, stdout io.Writer, projectPath string, selectedBackupPath string) (bool, error) {
	if stdin == nil {
		return false, nil
	}
	if _, err := fmt.Fprintf(stdout, "This will overwrite %s with %s. Continue? [y/N]: ", projectPath, selectedBackupPath); err != nil {
		return false, err
	}
	line, err := bufio.NewReader(stdin).ReadString('\n')
	if err != nil && err != io.EOF {
		return false, err
	}
	response := strings.ToLower(strings.TrimSpace(line))
	return response == "y" || response == "yes", nil
}

func commandNow() time.Time {
	return time.Now().UTC()
}
