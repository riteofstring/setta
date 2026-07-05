package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"

	"setta/internal/httpapi"
	"setta/internal/jsonio"
	"setta/internal/workspace"
	"setta/internal/workspacesession"
	"setta/internal/workspaceui"
)

const (
	workspaceCurrentCLIAuthDisplayName        = "Setta CLI workspace current"
	workspaceChatsQueueCLIAuthDisplayName     = "Setta CLI workspace chats queue"
	workspaceChatsReadCLIAuthDisplayName      = "Setta CLI workspace chats read"
	workspaceChatsSendCLIAuthDisplayName      = "Setta CLI workspace chats send"
	workspaceChatsSteerCLIAuthDisplayName     = "Setta CLI workspace chats steer"
	workspaceLayoutApplyCLIAuthDisplayName    = "Setta CLI workspace layout apply"
	workspacePanesCloseCLIAuthDisplayName     = "Setta CLI workspace panes close"
	workspacePanesFocusCLIAuthDisplayName     = "Setta CLI workspace panes focus"
	workspacePanesListCLIAuthDisplayName      = "Setta CLI workspace panes list"
	workspacePanesMoveCLIAuthDisplayName      = "Setta CLI workspace panes move"
	workspacePanesOpenCLIAuthDisplayName      = "Setta CLI workspace panes open"
	workspacePanesReadCLIAuthDisplayName      = "Setta CLI workspace panes read"
	workspacePanesReorderCLIAuthDisplayName   = "Setta CLI workspace panes reorder"
	workspacePanesRenameCLIAuthDisplayName    = "Setta CLI workspace panes rename"
	workspacePanesResizeCLIAuthDisplayName    = "Setta CLI workspace panes resize"
	workspaceSchemaCLIAuthDisplayName         = "Setta CLI workspace schema"
	workspaceTerminalsReadCLIAuthDisplayName  = "Setta CLI workspace terminals read"
	workspaceTerminalWritesCLIAuthDisplayName = "Setta CLI workspace terminal writes"
)

type workspaceOptions struct {
	AppDataDir string
}

type workspacePaneReadOptions struct {
	AppDataDir string
	PaneID     string
}

type workspacePaneCloseOptions struct {
	AppDataDir   string
	PaneID       string
	SurfaceClose workspaceui.WorkspaceUISurfaceCloseMode
}

type workspacePaneFocusOptions struct {
	AppDataDir string
	PaneID     string
}

type workspacePaneMoveOptions struct {
	AppDataDir string
	PaneID     string
	Direction  workspaceui.WorkspaceUIPaneMoveDirection
}

type workspacePaneOpenOptions struct {
	AppDataDir string
	InputPath  string
}

type workspacePaneRenameOptions struct {
	AppDataDir string
	PaneID     string
	Title      string
}

type workspacePaneResizeOptions struct {
	AppDataDir string
	PaneID     string
	Resize     workspaceui.WorkspaceUIPaneResizeOperation
}

func runWorkspace(args []string, deps cliDeps) error {
	return workspaceCommandError(runWorkspaceCommand(args, deps))
}

func runWorkspaceCommand(args []string, deps cliDeps) error {
	if len(args) == 0 {
		return usageError{err: errors.New("setta workspace requires a subcommand: chats, current, layout, panes, schema, or terminals")}
	}
	switch args[0] {
	case "chats":
		return runWorkspaceChats(args[1:], deps)
	case "current":
		return runWorkspaceCurrent(args[1:], deps)
	case "layout":
		return runWorkspaceLayout(args[1:], deps)
	case "panes":
		return runWorkspacePanes(args[1:], deps)
	case "schema":
		return runWorkspaceSchema(args[1:], deps)
	case "terminals":
		return runWorkspaceTerminals(args[1:], deps)
	default:
		return usageError{err: fmt.Errorf("unknown workspace subcommand %q", args[0])}
	}
}

func runWorkspaceCurrent(args []string, deps cliDeps) error {
	options, err := workspaceOptionsFromArgs("setta workspace current", args, deps)
	if err != nil {
		return err
	}
	currentWorkspace, err := readWorkspaceCurrent(context.Background(), options.AppDataDir, deps)
	if err != nil {
		return err
	}
	return encodeWorkspaceCommandOutput(deps.stdout, currentWorkspace, "current workspace")
}

func runWorkspaceSchema(args []string, deps cliDeps) error {
	options, err := workspaceOptionsFromArgs("setta workspace schema", args, deps)
	if err != nil {
		return err
	}
	schema, err := readWorkspaceSchema(context.Background(), options.AppDataDir, deps)
	if err != nil {
		return err
	}
	return encodeWorkspaceCommandOutput(deps.stdout, schema, "workspace schema")
}

func runWorkspacePanes(args []string, deps cliDeps) error {
	if len(args) == 0 {
		return usageError{err: errors.New("setta workspace panes requires a subcommand: close, focus, list, move, open, read, rename, reorder, or resize")}
	}
	switch args[0] {
	case "close":
		return runWorkspacePanesClose(args[1:], deps)
	case "focus":
		return runWorkspacePanesFocus(args[1:], deps)
	case "list":
		return runWorkspacePanesList(args[1:], deps)
	case "move":
		return runWorkspacePanesMove(args[1:], deps)
	case "open":
		return runWorkspacePanesOpen(args[1:], deps)
	case "read":
		return runWorkspacePanesRead(args[1:], deps)
	case "reorder":
		return runWorkspacePanesReorder(args[1:], deps)
	case "rename":
		return runWorkspacePanesRename(args[1:], deps)
	case "resize":
		return runWorkspacePanesResize(args[1:], deps)
	default:
		return usageError{err: fmt.Errorf("unknown workspace panes subcommand %q", args[0])}
	}
}

func runWorkspacePanesClose(args []string, deps cliDeps) error {
	options, err := workspacePaneCloseOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	result, err := closeWorkspacePane(context.Background(), options.AppDataDir, options.PaneID, options.SurfaceClose, deps)
	if err != nil {
		return err
	}
	return encodeWorkspaceCommandOutput(deps.stdout, result, "workspace pane close result")
}

func runWorkspacePanesFocus(args []string, deps cliDeps) error {
	options, err := workspacePaneFocusOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	result, err := focusWorkspacePane(context.Background(), options.AppDataDir, options.PaneID, deps)
	if err != nil {
		return err
	}
	return encodeWorkspaceCommandOutput(deps.stdout, result, "workspace pane focus result")
}

func runWorkspacePanesList(args []string, deps cliDeps) error {
	options, err := workspaceOptionsFromArgs("setta workspace panes list", args, deps)
	if err != nil {
		return err
	}
	panes, err := listWorkspacePanes(context.Background(), options.AppDataDir, deps)
	if err != nil {
		return err
	}
	return encodeWorkspaceCommandOutput(deps.stdout, panes, "workspace panes list")
}

func runWorkspacePanesMove(args []string, deps cliDeps) error {
	options, err := workspacePaneMoveOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	result, err := moveWorkspacePane(context.Background(), options.AppDataDir, options.PaneID, options.Direction, deps)
	if err != nil {
		return err
	}
	return encodeWorkspaceCommandOutput(deps.stdout, result, "workspace pane move result")
}

func runWorkspacePanesOpen(args []string, deps cliDeps) error {
	options, err := workspacePaneOpenOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	input, err := readWorkspacePaneOpenInputFile(options.InputPath)
	if err != nil {
		return err
	}
	result, err := openWorkspacePane(context.Background(), options.AppDataDir, input, deps)
	if err != nil {
		return err
	}
	return encodeWorkspaceCommandOutput(deps.stdout, result, "workspace pane open result")
}

func runWorkspacePanesRead(args []string, deps cliDeps) error {
	options, err := workspacePaneReadOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	pane, err := readWorkspacePane(context.Background(), options.AppDataDir, options.PaneID, deps)
	if err != nil {
		return err
	}
	return encodeWorkspaceCommandOutput(deps.stdout, pane, "workspace pane")
}

func runWorkspacePanesRename(args []string, deps cliDeps) error {
	options, err := workspacePaneRenameOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	result, err := renameWorkspacePane(context.Background(), options.AppDataDir, options.PaneID, options.Title, deps)
	if err != nil {
		return err
	}
	return encodeWorkspaceCommandOutput(deps.stdout, result, "workspace pane rename result")
}

func runWorkspacePanesResize(args []string, deps cliDeps) error {
	options, err := workspacePaneResizeOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	result, err := resizeWorkspacePane(context.Background(), options.AppDataDir, options.PaneID, options.Resize, deps)
	if err != nil {
		return err
	}
	return encodeWorkspaceCommandOutput(deps.stdout, result, "workspace pane resize result")
}

func workspaceOptionsFromArgs(name string, args []string, deps cliDeps) (workspaceOptions, error) {
	appDataDir, err := defaultAppDataDir(deps.getenv)
	if err != nil {
		return workspaceOptions{}, err
	}
	flagSet := newWorkspaceFlagSet(name)
	flagSet.StringVar(&appDataDir, "app-data-dir", appDataDir, "directory for persisted Setta app state")
	if err := flagSet.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return workspaceOptions{}, usageError{err: err}
		}
		return workspaceOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 0 {
		return workspaceOptions{}, usageError{err: fmt.Errorf("%s does not accept positional arguments", name)}
	}
	return workspaceOptions{AppDataDir: appDataDir}, nil
}

func workspacePaneIDOptionsFromArgs(name string, args []string, deps cliDeps) (workspacePaneFocusOptions, error) {
	appDataDir, err := defaultAppDataDir(deps.getenv)
	if err != nil {
		return workspacePaneFocusOptions{}, err
	}
	normalizedArgs, err := normalizeWorkspacePaneFlagArgs(args, "app-data-dir")
	if err != nil {
		return workspacePaneFocusOptions{}, usageError{err: err}
	}
	flagSet := newWorkspaceFlagSet(name)
	flagSet.StringVar(&appDataDir, "app-data-dir", appDataDir, "directory for persisted Setta app state")
	if err := flagSet.Parse(normalizedArgs); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return workspacePaneFocusOptions{}, usageError{err: err}
		}
		return workspacePaneFocusOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 1 {
		return workspacePaneFocusOptions{}, usageError{err: fmt.Errorf("%s requires exactly one pane id", name)}
	}
	paneID := strings.TrimSpace(flagSet.Arg(0))
	if paneID == "" {
		return workspacePaneFocusOptions{}, usageError{err: errors.New("workspace pane id is required")}
	}
	return workspacePaneFocusOptions{AppDataDir: appDataDir, PaneID: paneID}, nil
}

func workspacePaneCloseOptionsFromArgs(args []string, deps cliDeps) (workspacePaneCloseOptions, error) {
	appDataDir, err := defaultAppDataDir(deps.getenv)
	if err != nil {
		return workspacePaneCloseOptions{}, err
	}
	surfaceClose := string(workspaceui.WorkspaceUISurfaceCloseModeNone)
	normalizedArgs, err := normalizeWorkspacePaneFlagArgs(args, "app-data-dir", "surface-close")
	if err != nil {
		return workspacePaneCloseOptions{}, usageError{err: err}
	}
	flagSet := newWorkspaceFlagSet("setta workspace panes close")
	flagSet.StringVar(&appDataDir, "app-data-dir", appDataDir, "directory for persisted Setta app state")
	flagSet.StringVar(&surfaceClose, "surface-close", surfaceClose, "surface close mode: none, safe, or force")
	if err := flagSet.Parse(normalizedArgs); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return workspacePaneCloseOptions{}, usageError{err: err}
		}
		return workspacePaneCloseOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 1 {
		return workspacePaneCloseOptions{}, usageError{err: errors.New("setta workspace panes close requires exactly one pane id")}
	}
	paneID := strings.TrimSpace(flagSet.Arg(0))
	if paneID == "" {
		return workspacePaneCloseOptions{}, usageError{err: errors.New("workspace pane id is required")}
	}
	mode := workspaceui.WorkspaceUISurfaceCloseMode(strings.TrimSpace(surfaceClose))
	if !validWorkspaceSurfaceCloseMode(mode) {
		return workspacePaneCloseOptions{}, usageError{err: fmt.Errorf("workspace pane surface close mode is unsupported: %s", mode)}
	}
	return workspacePaneCloseOptions{
		AppDataDir:   appDataDir,
		PaneID:       paneID,
		SurfaceClose: mode,
	}, nil
}

func workspacePaneFocusOptionsFromArgs(args []string, deps cliDeps) (workspacePaneFocusOptions, error) {
	return workspacePaneIDOptionsFromArgs("setta workspace panes focus", args, deps)
}

func workspacePaneMoveOptionsFromArgs(args []string, deps cliDeps) (workspacePaneMoveOptions, error) {
	appDataDir, err := defaultAppDataDir(deps.getenv)
	if err != nil {
		return workspacePaneMoveOptions{}, err
	}
	var direction string
	normalizedArgs, err := normalizeWorkspacePaneFlagArgs(args, "app-data-dir", "direction")
	if err != nil {
		return workspacePaneMoveOptions{}, usageError{err: err}
	}
	flagSet := newWorkspaceFlagSet("setta workspace panes move")
	flagSet.StringVar(&appDataDir, "app-data-dir", appDataDir, "directory for persisted Setta app state")
	flagSet.StringVar(&direction, "direction", "", "move direction: left, right, up, or down")
	if err := flagSet.Parse(normalizedArgs); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return workspacePaneMoveOptions{}, usageError{err: err}
		}
		return workspacePaneMoveOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 1 {
		return workspacePaneMoveOptions{}, usageError{err: errors.New("setta workspace panes move requires exactly one pane id")}
	}
	paneID := strings.TrimSpace(flagSet.Arg(0))
	if paneID == "" {
		return workspacePaneMoveOptions{}, usageError{err: errors.New("workspace pane id is required")}
	}
	moveDirection := workspaceui.WorkspaceUIPaneMoveDirection(strings.TrimSpace(direction))
	if !validWorkspacePaneMoveDirection(moveDirection) {
		return workspacePaneMoveOptions{}, usageError{err: fmt.Errorf("workspace pane move direction is unsupported: %s", moveDirection)}
	}
	return workspacePaneMoveOptions{
		AppDataDir: appDataDir,
		PaneID:     paneID,
		Direction:  moveDirection,
	}, nil
}

func workspacePaneOpenOptionsFromArgs(args []string, deps cliDeps) (workspacePaneOpenOptions, error) {
	appDataDir, err := defaultAppDataDir(deps.getenv)
	if err != nil {
		return workspacePaneOpenOptions{}, err
	}
	var inputPath string
	flagSet := newWorkspaceFlagSet("setta workspace panes open")
	flagSet.StringVar(&appDataDir, "app-data-dir", appDataDir, "directory for persisted Setta app state")
	flagSet.StringVar(&inputPath, "input", "", "path to a workspace pane open JSON input file")
	if err := flagSet.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return workspacePaneOpenOptions{}, usageError{err: err}
		}
		return workspacePaneOpenOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 0 {
		return workspacePaneOpenOptions{}, usageError{err: errors.New("setta workspace panes open does not accept positional arguments")}
	}
	inputPath = strings.TrimSpace(inputPath)
	if inputPath == "" {
		return workspacePaneOpenOptions{}, usageError{err: errors.New("setta workspace panes open requires --input")}
	}
	return workspacePaneOpenOptions{
		AppDataDir: appDataDir,
		InputPath:  inputPath,
	}, nil
}

func workspacePaneReadOptionsFromArgs(args []string, deps cliDeps) (workspacePaneReadOptions, error) {
	appDataDir, err := defaultAppDataDir(deps.getenv)
	if err != nil {
		return workspacePaneReadOptions{}, err
	}
	normalizedArgs, err := normalizeWorkspacePaneFlagArgs(args, "app-data-dir")
	if err != nil {
		return workspacePaneReadOptions{}, usageError{err: err}
	}
	flagSet := newWorkspaceFlagSet("setta workspace panes read")
	flagSet.StringVar(&appDataDir, "app-data-dir", appDataDir, "directory for persisted Setta app state")
	if err := flagSet.Parse(normalizedArgs); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return workspacePaneReadOptions{}, usageError{err: err}
		}
		return workspacePaneReadOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 1 {
		return workspacePaneReadOptions{}, usageError{err: errors.New("setta workspace panes read requires exactly one pane id")}
	}
	paneID := strings.TrimSpace(flagSet.Arg(0))
	if paneID == "" {
		return workspacePaneReadOptions{}, usageError{err: errors.New("workspace pane id is required")}
	}
	return workspacePaneReadOptions{AppDataDir: appDataDir, PaneID: paneID}, nil
}

func workspacePaneRenameOptionsFromArgs(args []string, deps cliDeps) (workspacePaneRenameOptions, error) {
	appDataDir, err := defaultAppDataDir(deps.getenv)
	if err != nil {
		return workspacePaneRenameOptions{}, err
	}
	var title string
	normalizedArgs, err := normalizeWorkspacePaneFlagArgs(args, "app-data-dir", "title")
	if err != nil {
		return workspacePaneRenameOptions{}, usageError{err: err}
	}
	flagSet := newWorkspaceFlagSet("setta workspace panes rename")
	flagSet.StringVar(&appDataDir, "app-data-dir", appDataDir, "directory for persisted Setta app state")
	flagSet.StringVar(&title, "title", "", "new pane title")
	if err := flagSet.Parse(normalizedArgs); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return workspacePaneRenameOptions{}, usageError{err: err}
		}
		return workspacePaneRenameOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 1 {
		return workspacePaneRenameOptions{}, usageError{err: errors.New("setta workspace panes rename requires exactly one pane id")}
	}
	paneID := strings.TrimSpace(flagSet.Arg(0))
	if paneID == "" {
		return workspacePaneRenameOptions{}, usageError{err: errors.New("workspace pane id is required")}
	}
	if title == "" {
		return workspacePaneRenameOptions{}, usageError{err: errors.New("setta workspace panes rename requires --title")}
	}
	if strings.TrimSpace(title) != title {
		return workspacePaneRenameOptions{}, usageError{err: errors.New("workspace pane title must not have surrounding whitespace")}
	}
	return workspacePaneRenameOptions{
		AppDataDir: appDataDir,
		PaneID:     paneID,
		Title:      title,
	}, nil
}

func workspacePaneResizeOptionsFromArgs(args []string, deps cliDeps) (workspacePaneResizeOptions, error) {
	appDataDir, err := defaultAppDataDir(deps.getenv)
	if err != nil {
		return workspacePaneResizeOptions{}, err
	}
	var widthPX string
	var widthScale string
	var heightPX string
	var heightScale string
	var resetHeight bool
	normalizedArgs, err := normalizeWorkspacePaneFlagArgs(args, "app-data-dir", "width-px", "width-scale", "height-px", "height-scale")
	if err != nil {
		return workspacePaneResizeOptions{}, usageError{err: err}
	}
	flagSet := newWorkspaceFlagSet("setta workspace panes resize")
	flagSet.StringVar(&appDataDir, "app-data-dir", appDataDir, "directory for persisted Setta app state")
	flagSet.StringVar(&widthPX, "width-px", "", "pane column width in pixels")
	flagSet.StringVar(&widthScale, "width-scale", "", "pane column proportional width scale")
	flagSet.StringVar(&heightPX, "height-px", "", "pane row height in pixels")
	flagSet.StringVar(&heightScale, "height-scale", "", "pane row height scale")
	flagSet.BoolVar(&resetHeight, "reset-height", false, "reset explicit pane row height")
	if err := flagSet.Parse(normalizedArgs); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return workspacePaneResizeOptions{}, usageError{err: err}
		}
		return workspacePaneResizeOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 1 {
		return workspacePaneResizeOptions{}, usageError{err: errors.New("setta workspace panes resize requires exactly one pane id")}
	}
	paneID := strings.TrimSpace(flagSet.Arg(0))
	if paneID == "" {
		return workspacePaneResizeOptions{}, usageError{err: errors.New("workspace pane id is required")}
	}
	resize, err := workspacePaneResizeOperationFromFlags(widthPX, widthScale, heightPX, heightScale, resetHeight)
	if err != nil {
		return workspacePaneResizeOptions{}, usageError{err: err}
	}
	return workspacePaneResizeOptions{
		AppDataDir: appDataDir,
		PaneID:     paneID,
		Resize:     resize,
	}, nil
}

func workspacePaneResizeOperationFromFlags(widthPX string, widthScale string, heightPX string, heightScale string, resetHeight bool) (workspaceui.WorkspaceUIPaneResizeOperation, error) {
	if workspacePaneResizeTargetFlagCount(widthPX, widthScale, heightPX, heightScale, resetHeight) != 1 {
		return workspaceui.WorkspaceUIPaneResizeOperation{}, errors.New("setta workspace panes resize requires exactly one of --width-px, --width-scale, --height-px, --height-scale, or --reset-height")
	}
	switch {
	case strings.TrimSpace(widthPX) != "":
		return workspacePaneResizeWidthOperation("width-px", workspaceui.ColumnWidthUnitPX, widthPX)
	case strings.TrimSpace(widthScale) != "":
		return workspacePaneResizeWidthOperation("width-scale", workspaceui.ColumnWidthUnitProportion, widthScale)
	case strings.TrimSpace(heightPX) != "":
		return workspacePaneResizeHeightPXOperation(heightPX)
	case strings.TrimSpace(heightScale) != "":
		return workspacePaneResizeHeightScaleOperation(heightScale)
	default:
		return workspaceui.WorkspaceUIPaneResizeOperation{ResetHeight: true}, nil
	}
}

func workspacePaneResizeTargetFlagCount(widthPX string, widthScale string, heightPX string, heightScale string, resetHeight bool) int {
	targetCount := 0
	for _, value := range []string{widthPX, widthScale, heightPX, heightScale} {
		if strings.TrimSpace(value) != "" {
			targetCount++
		}
	}
	if resetHeight {
		targetCount++
	}
	return targetCount
}

func workspacePaneResizeWidthOperation(name string, unit workspaceui.ColumnWidthUnit, raw string) (workspaceui.WorkspaceUIPaneResizeOperation, error) {
	value, err := parsePositiveFiniteFloatFlag(name, raw)
	if err != nil {
		return workspaceui.WorkspaceUIPaneResizeOperation{}, err
	}
	widthSpec := workspaceui.ColumnWidthSpec{Unit: unit, Value: value}
	return workspaceui.WorkspaceUIPaneResizeOperation{WidthSpec: &widthSpec}, nil
}

func workspacePaneResizeHeightPXOperation(raw string) (workspaceui.WorkspaceUIPaneResizeOperation, error) {
	value, err := parsePositiveIntFlag("height-px", raw)
	if err != nil {
		return workspaceui.WorkspaceUIPaneResizeOperation{}, err
	}
	return workspaceui.WorkspaceUIPaneResizeOperation{HeightPX: &value}, nil
}

func workspacePaneResizeHeightScaleOperation(raw string) (workspaceui.WorkspaceUIPaneResizeOperation, error) {
	value, err := parsePositiveFiniteFloatFlag("height-scale", raw)
	if err != nil {
		return workspaceui.WorkspaceUIPaneResizeOperation{}, err
	}
	return workspaceui.WorkspaceUIPaneResizeOperation{HeightScale: &value}, nil
}

func parsePositiveFiniteFloatFlag(name string, raw string) (float64, error) {
	value, err := strconv.ParseFloat(strings.TrimSpace(raw), 64)
	if err != nil {
		return 0, fmt.Errorf("workspace pane resize --%s must be a number: %w", name, err)
	}
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return 0, fmt.Errorf("workspace pane resize --%s must be finite", name)
	}
	if value <= 0 {
		return 0, fmt.Errorf("workspace pane resize --%s must be positive", name)
	}
	return value, nil
}

func parsePositiveIntFlag(name string, raw string) (int, error) {
	value, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil {
		return 0, fmt.Errorf("workspace pane resize --%s must be an integer: %w", name, err)
	}
	if value <= 0 {
		return 0, fmt.Errorf("workspace pane resize --%s must be positive", name)
	}
	return value, nil
}

func normalizeWorkspacePaneFlagArgs(args []string, valueFlagNames ...string) ([]string, error) {
	valueFlags := make(map[string]struct{}, len(valueFlagNames))
	for _, name := range valueFlagNames {
		valueFlags[name] = struct{}{}
	}
	flags := make([]string, 0, len(args))
	positionals := make([]string, 0, len(args))
	for index := 0; index < len(args); index++ {
		arg := args[index]
		if arg == "--" {
			positionals = append(positionals, args[index+1:]...)
			break
		}
		if !strings.HasPrefix(arg, "-") || arg == "-" {
			positionals = append(positionals, arg)
			continue
		}
		flags = append(flags, arg)
		name := strings.TrimLeft(arg, "-")
		if equalIndex := strings.IndexByte(name, '='); equalIndex >= 0 {
			name = name[:equalIndex]
		}
		if _, ok := valueFlags[name]; !ok || strings.Contains(arg, "=") {
			continue
		}
		if index+1 >= len(args) {
			return nil, fmt.Errorf("flag needs an argument: -%s", name)
		}
		index++
		flags = append(flags, args[index])
	}
	return append(flags, positionals...), nil
}

func closeWorkspacePane(ctx context.Context, appDataDir string, paneID string, surfaceClose workspaceui.WorkspaceUISurfaceCloseMode, deps cliDeps) (workspaceui.WorkspaceUIPaneOperationResult, error) {
	return applyWorkspacePaneOperation(ctx, appDataDir, workspacePanesCloseCLIAuthDisplayName, "workspace panes close", workspaceui.WorkspaceUIPaneOperation{
		Kind:   workspaceui.WorkspaceUIPaneOperationKindClosePane,
		PaneID: paneID,
		Close: &workspaceui.WorkspaceUIPaneCloseOperation{
			SurfaceClose: surfaceClose,
		},
	}, deps)
}

func focusWorkspacePane(ctx context.Context, appDataDir string, paneID string, deps cliDeps) (workspaceui.WorkspaceUIPaneOperationResult, error) {
	return applyWorkspacePaneOperation(ctx, appDataDir, workspacePanesFocusCLIAuthDisplayName, "workspace panes focus", workspaceui.WorkspaceUIPaneOperation{
		Kind:   workspaceui.WorkspaceUIPaneOperationKindFocusPane,
		PaneID: paneID,
	}, deps)
}

func moveWorkspacePane(ctx context.Context, appDataDir string, paneID string, direction workspaceui.WorkspaceUIPaneMoveDirection, deps cliDeps) (workspaceui.WorkspaceUIPaneOperationResult, error) {
	return applyWorkspacePaneOperation(ctx, appDataDir, workspacePanesMoveCLIAuthDisplayName, "workspace panes move", workspaceui.WorkspaceUIPaneOperation{
		Kind:   workspaceui.WorkspaceUIPaneOperationKindMovePane,
		PaneID: paneID,
		Move: &workspaceui.WorkspaceUIPaneMoveOperation{
			Direction: direction,
		},
	}, deps)
}

func openWorkspacePane(ctx context.Context, appDataDir string, input workspaceui.WorkspaceUIPaneOpenOperation, deps cliDeps) (workspaceui.WorkspaceUIPaneOperationResult, error) {
	return applyWorkspacePaneOperation(ctx, appDataDir, workspacePanesOpenCLIAuthDisplayName, "workspace panes open", workspaceui.WorkspaceUIPaneOperation{
		Kind: workspaceui.WorkspaceUIPaneOperationKindOpenPane,
		Open: &input,
	}, deps)
}

func renameWorkspacePane(ctx context.Context, appDataDir string, paneID string, title string, deps cliDeps) (workspaceui.WorkspaceUIPaneOperationResult, error) {
	return applyWorkspacePaneOperation(ctx, appDataDir, workspacePanesRenameCLIAuthDisplayName, "workspace panes rename", workspaceui.WorkspaceUIPaneOperation{
		Kind:   workspaceui.WorkspaceUIPaneOperationKindRenamePane,
		PaneID: paneID,
		Rename: &workspaceui.WorkspaceUIPaneRenameOperation{
			Title: title,
		},
	}, deps)
}

func resizeWorkspacePane(ctx context.Context, appDataDir string, paneID string, resize workspaceui.WorkspaceUIPaneResizeOperation, deps cliDeps) (workspaceui.WorkspaceUIPaneOperationResult, error) {
	return applyWorkspacePaneOperation(ctx, appDataDir, workspacePanesResizeCLIAuthDisplayName, "workspace panes resize", workspaceui.WorkspaceUIPaneOperation{
		Kind:   workspaceui.WorkspaceUIPaneOperationKindResizePane,
		PaneID: paneID,
		Resize: &resize,
	}, deps)
}

func applyWorkspacePaneOperation(
	ctx context.Context,
	appDataDir string,
	displayName string,
	operationName string,
	operation workspaceui.WorkspaceUIPaneOperation,
	deps cliDeps,
) (workspaceui.WorkspaceUIPaneOperationResult, error) {
	state, token, cleanup, err := workspaceCommandAuth(ctx, appDataDir, displayName, deps)
	if err != nil {
		return workspaceui.WorkspaceUIPaneOperationResult{}, err
	}
	defer cleanup()

	currentWorkspace, err := currentWorkspaceForWorkspaceCommand(ctx, deps.httpClient, state.BaseURL, token)
	if err != nil {
		return workspaceui.WorkspaceUIPaneOperationResult{}, err
	}
	result, err := postWorkspaceAPI[workspaceui.WorkspaceUIPaneOperationResult](ctx, deps.httpClient, state.BaseURL, token, operationName, "/workspaces/ui/panes/operation", httpapi.ApplyWorkspaceUIPaneOperationRequest{
		WorkspaceID: currentWorkspace.ID,
		Operation:   operation,
	})
	if err != nil {
		return workspaceui.WorkspaceUIPaneOperationResult{}, err
	}
	if err := validateWorkspacePaneOperationResponse(result, currentWorkspace.ID, operation); err != nil {
		return workspaceui.WorkspaceUIPaneOperationResult{}, err
	}
	return result, nil
}

func readWorkspacePaneOpenInputFile(path string) (workspaceui.WorkspaceUIPaneOpenOperation, error) {
	file, err := os.Open(path)
	if err != nil {
		return workspaceui.WorkspaceUIPaneOpenOperation{}, newWorkspaceCLIError("workspace_pane_open_input_open_failed", fmt.Errorf("open workspace pane open input %s: %w", path, err))
	}
	defer file.Close()

	var input workspaceui.WorkspaceUIPaneOpenOperation
	if err := jsonio.DecodeSingle(file, &input); err != nil {
		return workspaceui.WorkspaceUIPaneOpenOperation{}, newWorkspaceCLIError("workspace_pane_open_input_decode_failed", fmt.Errorf("decode workspace pane open input %s: %w", path, err))
	}
	return input, nil
}

func readWorkspaceCurrent(ctx context.Context, appDataDir string, deps cliDeps) (workspace.WorkspaceSummary, error) {
	state, token, cleanup, err := workspaceCommandAuth(ctx, appDataDir, workspaceCurrentCLIAuthDisplayName, deps)
	if err != nil {
		return workspace.WorkspaceSummary{}, err
	}
	defer cleanup()

	session, err := getWorkspaceSessionForWorkspaceCommand(ctx, deps.httpClient, state.BaseURL, token)
	if err != nil {
		return workspace.WorkspaceSummary{}, err
	}
	return currentWorkspaceFromWorkspaceSession(session)
}

func readWorkspaceSchema(ctx context.Context, appDataDir string, deps cliDeps) (workspaceui.WorkspaceUISchema, error) {
	state, token, cleanup, err := workspaceCommandAuth(ctx, appDataDir, workspaceSchemaCLIAuthDisplayName, deps)
	if err != nil {
		return workspaceui.WorkspaceUISchema{}, err
	}
	defer cleanup()

	schema, err := getWorkspaceSchema(ctx, deps.httpClient, state.BaseURL, token)
	if err != nil {
		return workspaceui.WorkspaceUISchema{}, err
	}
	if err := validateWorkspaceSchemaResponse(schema); err != nil {
		return workspaceui.WorkspaceUISchema{}, err
	}
	return schema, nil
}

func listWorkspacePanes(ctx context.Context, appDataDir string, deps cliDeps) (workspaceui.WorkspaceUIPaneListResult, error) {
	state, token, cleanup, err := workspaceCommandAuth(ctx, appDataDir, workspacePanesListCLIAuthDisplayName, deps)
	if err != nil {
		return workspaceui.WorkspaceUIPaneListResult{}, err
	}
	defer cleanup()

	currentWorkspace, err := currentWorkspaceForWorkspaceCommand(ctx, deps.httpClient, state.BaseURL, token)
	if err != nil {
		return workspaceui.WorkspaceUIPaneListResult{}, err
	}
	panes, err := postWorkspaceAPI[workspaceui.WorkspaceUIPaneListResult](ctx, deps.httpClient, state.BaseURL, token, "workspace panes list", "/workspaces/ui/panes/list", httpapi.ListWorkspaceUIPanesRequest{
		WorkspaceID: currentWorkspace.ID,
	})
	if err != nil {
		return workspaceui.WorkspaceUIPaneListResult{}, err
	}
	if err := validateWorkspacePaneListResponse(panes, currentWorkspace.ID); err != nil {
		return workspaceui.WorkspaceUIPaneListResult{}, err
	}
	return panes, nil
}

func readWorkspacePane(ctx context.Context, appDataDir string, paneID string, deps cliDeps) (workspaceui.WorkspaceUIPaneReadResult, error) {
	state, token, cleanup, err := workspaceCommandAuth(ctx, appDataDir, workspacePanesReadCLIAuthDisplayName, deps)
	if err != nil {
		return workspaceui.WorkspaceUIPaneReadResult{}, err
	}
	defer cleanup()

	currentWorkspace, err := currentWorkspaceForWorkspaceCommand(ctx, deps.httpClient, state.BaseURL, token)
	if err != nil {
		return workspaceui.WorkspaceUIPaneReadResult{}, err
	}
	pane, err := postWorkspaceAPI[workspaceui.WorkspaceUIPaneReadResult](ctx, deps.httpClient, state.BaseURL, token, "workspace panes read", "/workspaces/ui/panes/read", httpapi.ReadWorkspaceUIPaneRequest{
		WorkspaceID: currentWorkspace.ID,
		PaneID:      paneID,
	})
	if err != nil {
		return workspaceui.WorkspaceUIPaneReadResult{}, err
	}
	if err := validateWorkspacePaneReadResponse(pane, currentWorkspace.ID, paneID); err != nil {
		return workspaceui.WorkspaceUIPaneReadResult{}, err
	}
	return pane, nil
}

func currentWorkspaceForWorkspaceCommand(ctx context.Context, client *http.Client, baseURL string, token string) (workspace.WorkspaceSummary, error) {
	session, err := getWorkspaceSessionForWorkspaceCommand(ctx, client, baseURL, token)
	if err != nil {
		return workspace.WorkspaceSummary{}, err
	}
	return currentWorkspaceFromWorkspaceSession(session)
}

func workspaceCommandAuth(ctx context.Context, appDataDir string, displayName string, deps cliDeps) (serveState, string, func(), error) {
	state, err := readServeState(appDataDir)
	if err != nil {
		if errors.Is(err, errServeStateNotFound) {
			return serveState{}, "", nil, newWorkspaceCLIError("setta_serve_state_missing", err)
		}
		return serveState{}, "", nil, newWorkspaceCLIError("setta_serve_state_read_failed", err)
	}
	if _, err := verifyServeState(ctx, deps.httpClient, state); err != nil {
		return serveState{}, "", nil, newWorkspaceCLIError("setta_serve_unreachable", err)
	}
	token, cleanup, err := createRuntimeCLIAuthSession(ctx, appDataDir, displayName)
	if err != nil {
		return serveState{}, "", nil, newWorkspaceCLIError("workspace_cli_auth_session_failed", err)
	}
	return state, token, cleanup, nil
}

func getWorkspaceSessionForWorkspaceCommand(ctx context.Context, client *http.Client, baseURL string, token string) (workspacesession.WorkspaceSession, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(baseURL, "/")+"/workspace-session", nil)
	if err != nil {
		return workspacesession.WorkspaceSession{}, newWorkspaceCLIError("workspace_api_request_create_failed", fmt.Errorf("create workspace session request: %w", err))
	}
	request.Header.Set("Authorization", "Bearer "+token)
	response, err := client.Do(request)
	if err != nil {
		return workspacesession.WorkspaceSession{}, newWorkspaceCLIError("workspace_api_request_failed", fmt.Errorf("request workspace session: %w", err))
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return workspacesession.WorkspaceSession{}, workspaceAPIStatusError("workspace session", response)
	}
	var session workspacesession.WorkspaceSession
	if err := json.NewDecoder(response.Body).Decode(&session); err != nil {
		return workspacesession.WorkspaceSession{}, newWorkspaceCLIError("workspace_api_response_decode_failed", fmt.Errorf("decode workspace session response: %w", err))
	}
	return session, nil
}

func getWorkspaceSchema(ctx context.Context, client *http.Client, baseURL string, token string) (workspaceui.WorkspaceUISchema, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(baseURL, "/")+"/workspaces/ui/schema", nil)
	if err != nil {
		return workspaceui.WorkspaceUISchema{}, newWorkspaceCLIError("workspace_api_request_create_failed", fmt.Errorf("create workspace schema request: %w", err))
	}
	request.Header.Set("Authorization", "Bearer "+token)
	response, err := client.Do(request)
	if err != nil {
		return workspaceui.WorkspaceUISchema{}, newWorkspaceCLIError("workspace_api_request_failed", fmt.Errorf("request workspace schema: %w", err))
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return workspaceui.WorkspaceUISchema{}, workspaceAPIStatusError("workspace schema", response)
	}
	var schema workspaceui.WorkspaceUISchema
	if err := json.NewDecoder(response.Body).Decode(&schema); err != nil {
		return workspaceui.WorkspaceUISchema{}, newWorkspaceCLIError("workspace_api_response_decode_failed", fmt.Errorf("decode workspace schema response: %w", err))
	}
	return schema, nil
}

func postWorkspaceAPI[Response any](ctx context.Context, client *http.Client, baseURL string, token string, operation string, path string, payload any) (Response, error) {
	var body bytes.Buffer
	if err := json.NewEncoder(&body).Encode(payload); err != nil {
		var zero Response
		return zero, newWorkspaceCLIError("workspace_api_request_encode_failed", fmt.Errorf("encode %s request: %w", operation, err))
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(baseURL, "/")+path, &body)
	if err != nil {
		var zero Response
		return zero, newWorkspaceCLIError("workspace_api_request_create_failed", fmt.Errorf("create %s request: %w", operation, err))
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", "application/json")
	response, err := client.Do(request)
	if err != nil {
		var zero Response
		return zero, newWorkspaceCLIError("workspace_api_request_failed", fmt.Errorf("request %s: %w", operation, err))
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		var zero Response
		return zero, workspaceAPIStatusError(operation, response)
	}
	var decoded Response
	if err := json.NewDecoder(response.Body).Decode(&decoded); err != nil {
		var zero Response
		return zero, newWorkspaceCLIError("workspace_api_response_decode_failed", fmt.Errorf("decode %s response: %w", operation, err))
	}
	return decoded, nil
}

func workspaceAPIStatusError(operation string, response *http.Response) error {
	payload, err := io.ReadAll(response.Body)
	if err != nil {
		return newWorkspaceCLIError("workspace_api_error_body_read_failed", fmt.Errorf("read %s error response body: %w", operation, err))
	}
	var apiError httpapi.ErrorResponse
	if err := json.Unmarshal(payload, &apiError); err == nil && apiError.Error.Code != "" && apiError.Error.Message != "" {
		return workspaceHTTPStatusError{
			operation:  operation,
			response:   apiError,
			statusCode: response.StatusCode,
		}
	}
	body := strings.TrimSpace(string(payload))
	if body == "" {
		body = "empty response body"
	}
	return newWorkspaceCLIError("workspace_api_error_response_invalid", fmt.Errorf("%s status %d returned invalid error response: %s", operation, response.StatusCode, body))
}

func currentWorkspaceFromWorkspaceSession(session workspacesession.WorkspaceSession) (workspace.WorkspaceSummary, error) {
	if session.SelectedWorkspaceID == "" {
		return workspace.WorkspaceSummary{}, newWorkspaceCLIError("no_current_workspace", errors.New("no current workspace is selected"))
	}
	for _, activeWorkspace := range session.ActiveWorkspaces {
		if activeWorkspace.ID == session.SelectedWorkspaceID {
			if err := validateWorkspaceSummaryResponse(activeWorkspace); err != nil {
				return workspace.WorkspaceSummary{}, newWorkspaceCLIError("invalid_current_workspace_response", fmt.Errorf("current workspace response is invalid: %w", err))
			}
			return activeWorkspace, nil
		}
	}
	return workspace.WorkspaceSummary{}, newWorkspaceCLIError("current_workspace_not_active", fmt.Errorf("current workspace %s is not active", session.SelectedWorkspaceID))
}

func encodeWorkspaceCommandOutput(output io.Writer, payload any, label string) error {
	encoder := json.NewEncoder(output)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(payload); err != nil {
		return fmt.Errorf("encode %s: %w", label, err)
	}
	return nil
}

func validWorkspacePaneMoveDirection(direction workspaceui.WorkspaceUIPaneMoveDirection) bool {
	switch direction {
	case workspaceui.WorkspaceUIPaneMoveDirectionDown,
		workspaceui.WorkspaceUIPaneMoveDirectionLeft,
		workspaceui.WorkspaceUIPaneMoveDirectionRight,
		workspaceui.WorkspaceUIPaneMoveDirectionUp:
		return true
	default:
		return false
	}
}

func validWorkspaceSurfaceCloseMode(mode workspaceui.WorkspaceUISurfaceCloseMode) bool {
	switch mode {
	case workspaceui.WorkspaceUISurfaceCloseModeForce,
		workspaceui.WorkspaceUISurfaceCloseModeNone,
		workspaceui.WorkspaceUISurfaceCloseModeSafe:
		return true
	default:
		return false
	}
}
