//go:build windows

package terminal

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"sync"
	"unicode/utf16"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	terminalConPTYAttributePseudoConsole uintptr = 0x20016
	terminalConPTYStillActive            uint32  = 259
)

var (
	terminalConPTYKernel32      = windows.NewLazySystemDLL("kernel32.dll")
	terminalCreatePseudoConsole = terminalConPTYKernel32.NewProc("CreatePseudoConsole")
	terminalResizePseudoConsole = terminalConPTYKernel32.NewProc("ResizePseudoConsole")
	terminalClosePseudoConsole  = terminalConPTYKernel32.NewProc("ClosePseudoConsole")
)

type terminalConPTYCoord struct {
	x int16
	y int16
}

func (coord terminalConPTYCoord) packed() uintptr {
	return uintptr((int32(coord.y) << 16) | int32(coord.x))
}

// Portions of this implementation derive from github.com/UserExistsError/conpty
// v0.1.4, Copyright (c) 2020 UserExistsError, under the MIT License. See
// conpty_suspended_windows_NOTICE.txt for the complete notice. CREATE_SUSPENDED
// is deliberate: the configured shell cannot run or create descendants before
// its root is inside the terminal Job Object.
type suspendedWindowsConPTY struct {
	pseudoConsole windows.Handle
	process       windows.ProcessInformation
	// waitProcess is a duplicate of process.Process owned exclusively by the
	// wait monitor. Close never touches it while WaitForSingleObject is active;
	// Win32 only permits CloseHandle after the wait has returned.
	waitProcess   windows.Handle
	ptyInput      windows.Handle
	ptyOutput     windows.Handle
	commandInput  windows.Handle
	commandOutput windows.Handle

	mutex          sync.Mutex
	resumed        bool
	closeOnce      sync.Once
	closeErr       error
	waitDone       chan struct{}
	waitExitCode   uint32
	waitErr        error
	waitOperations terminalConPTYWaitOperations
}

type terminalConPTYWaitOperations struct {
	wait     func(windows.Handle, uint32) (uint32, error)
	exitCode func(windows.Handle, *uint32) error
	close    func(windows.Handle) error
}

type terminalConPTYRollbackOperations struct {
	terminate          func(windows.Handle, uint32) error
	closeHandles       func(...windows.Handle) error
	closePseudoConsole func(windows.Handle)
}

func defaultTerminalConPTYWaitOperations() terminalConPTYWaitOperations {
	return terminalConPTYWaitOperations{
		wait:     windows.WaitForSingleObject,
		exitCode: windows.GetExitCodeProcess,
		close:    windows.CloseHandle,
	}
}

func defaultTerminalConPTYRollbackOperations() terminalConPTYRollbackOperations {
	return terminalConPTYRollbackOperations{
		terminate:          windows.TerminateProcess,
		closeHandles:       closeTerminalWindowsHandles,
		closePseudoConsole: closeTerminalPseudoConsole,
	}
}

func startSuspendedConPTY(
	commandLine string,
	configuration windowsPTYConfiguration,
) (suspendedConPTY, error) {
	if terminalCreatePseudoConsole.Find() != nil ||
		terminalResizePseudoConsole.Find() != nil ||
		terminalClosePseudoConsole.Find() != nil {
		return nil, errors.New("terminal: ConPTY is unavailable on this version of Windows")
	}
	coordinates := terminalConPTYCoord{
		x: int16(configuration.columns),
		y: int16(configuration.rows),
	}
	if coordinates.x == 0 {
		coordinates.x = 80
	}
	if coordinates.y == 0 {
		coordinates.y = 40
	}
	var pseudoInput, commandInput windows.Handle
	if err := windows.CreatePipe(&pseudoInput, &commandInput, nil, 0); err != nil {
		return nil, fmt.Errorf("terminal: create ConPTY input pipe: %w", err)
	}
	var commandOutput, pseudoOutput windows.Handle
	if err := windows.CreatePipe(&commandOutput, &pseudoOutput, nil, 0); err != nil {
		return nil, errors.Join(
			fmt.Errorf("terminal: create ConPTY output pipe: %w", err),
			closeTerminalWindowsHandles(pseudoInput, commandInput),
		)
	}
	pseudoConsole, err := createTerminalPseudoConsole(coordinates, pseudoInput, pseudoOutput)
	if err != nil {
		return nil, errors.Join(
			err,
			closeTerminalWindowsHandles(pseudoInput, pseudoOutput, commandInput, commandOutput),
		)
	}
	process, err := createSuspendedTerminalConPTYProcess(
		pseudoConsole,
		commandLine,
		configuration.directory,
		configuration.environment,
	)
	if err != nil {
		closeTerminalPseudoConsole(pseudoConsole)
		return nil, errors.Join(
			err,
			closeTerminalWindowsHandles(pseudoInput, pseudoOutput, commandInput, commandOutput),
		)
	}
	waitProcess, err := duplicateTerminalConPTYWaitHandle(process.Process)
	if err != nil {
		return nil, errors.Join(
			fmt.Errorf("terminal: duplicate ConPTY root wait handle: %w", err),
			discardUnassignedTerminalConPTY(
				process,
				pseudoConsole,
				[]windows.Handle{pseudoInput, pseudoOutput, commandInput, commandOutput},
				defaultTerminalConPTYRollbackOperations(),
			),
		)
	}
	instance := &suspendedWindowsConPTY{
		pseudoConsole:  pseudoConsole,
		process:        process,
		waitProcess:    waitProcess,
		ptyInput:       pseudoInput,
		ptyOutput:      pseudoOutput,
		commandInput:   commandInput,
		commandOutput:  commandOutput,
		waitDone:       make(chan struct{}),
		waitOperations: defaultTerminalConPTYWaitOperations(),
	}
	go instance.waitForRoot()
	return instance, nil
}

func discardUnassignedTerminalConPTY(
	process windows.ProcessInformation,
	pseudoConsole windows.Handle,
	pipes []windows.Handle,
	operations terminalConPTYRollbackOperations,
) error {
	if operations.terminate == nil || operations.closeHandles == nil || operations.closePseudoConsole == nil {
		return errors.New("terminal: ConPTY rollback operations are unavailable")
	}
	var result error
	if process.Process != 0 && process.Process != windows.InvalidHandle {
		if err := operations.terminate(process.Process, 1); err != nil {
			result = errors.Join(result, fmt.Errorf("terminal: terminate unassigned ConPTY root: %w", err))
		}
	}
	operations.closePseudoConsole(pseudoConsole)
	result = errors.Join(result, operations.closeHandles(process.Process, process.Thread))
	result = errors.Join(result, operations.closeHandles(pipes...))
	return result
}

func duplicateTerminalConPTYWaitHandle(process windows.Handle) (windows.Handle, error) {
	if process == 0 || process == windows.InvalidHandle {
		return 0, errors.New("ConPTY root process handle is invalid")
	}
	var duplicate windows.Handle
	if err := windows.DuplicateHandle(
		windows.CurrentProcess(),
		process,
		windows.CurrentProcess(),
		&duplicate,
		0,
		false,
		windows.DUPLICATE_SAME_ACCESS,
	); err != nil {
		return 0, err
	}
	return duplicate, nil
}

func createTerminalPseudoConsole(
	coordinates terminalConPTYCoord,
	input windows.Handle,
	output windows.Handle,
) (windows.Handle, error) {
	var pseudoConsole windows.Handle
	result, _, _ := terminalCreatePseudoConsole.Call(
		coordinates.packed(),
		uintptr(input),
		uintptr(output),
		0,
		uintptr(unsafe.Pointer(&pseudoConsole)),
	)
	if result != 0 {
		return 0, fmt.Errorf("terminal: create pseudo console failed with status 0x%x", result)
	}
	return pseudoConsole, nil
}

func createSuspendedTerminalConPTYProcess(
	pseudoConsole windows.Handle,
	commandLine string,
	directory string,
	environment []string,
) (windows.ProcessInformation, error) {
	command, err := windows.UTF16PtrFromString(commandLine)
	if err != nil {
		return windows.ProcessInformation{}, fmt.Errorf("terminal: encode ConPTY command: %w", err)
	}
	var workingDirectory *uint16
	if directory != "" {
		workingDirectory, err = windows.UTF16PtrFromString(directory)
		if err != nil {
			return windows.ProcessInformation{}, fmt.Errorf("terminal: encode ConPTY directory: %w", err)
		}
	}
	attributes, err := windows.NewProcThreadAttributeList(1)
	if err != nil {
		return windows.ProcessInformation{}, fmt.Errorf("terminal: create ConPTY process attributes: %w", err)
	}
	defer attributes.Delete()
	if err := attributes.Update(
		terminalConPTYAttributePseudoConsole,
		unsafe.Pointer(&pseudoConsole),
		unsafe.Sizeof(pseudoConsole),
	); err != nil {
		return windows.ProcessInformation{}, fmt.Errorf("terminal: configure ConPTY process attributes: %w", err)
	}
	startup := windows.StartupInfoEx{
		ProcThreadAttributeList: attributes.List(),
	}
	startup.Cb = uint32(unsafe.Sizeof(startup))
	startup.Flags |= windows.STARTF_USESTDHANDLES
	flags := uint32(windows.EXTENDED_STARTUPINFO_PRESENT | windows.CREATE_SUSPENDED)
	var environmentBlock *uint16
	if environment != nil {
		flags |= windows.CREATE_UNICODE_ENVIRONMENT
		block, blockErr := terminalConPTYEnvironmentBlock(environment)
		if blockErr != nil {
			return windows.ProcessInformation{}, fmt.Errorf("terminal: encode ConPTY environment: %w", blockErr)
		}
		environmentBlock = &block[0]
	}
	var process windows.ProcessInformation
	if err := windows.CreateProcess(
		nil,
		command,
		nil,
		nil,
		false,
		flags,
		environmentBlock,
		workingDirectory,
		&startup.StartupInfo,
		&process,
	); err != nil {
		return windows.ProcessInformation{}, fmt.Errorf("terminal: create suspended ConPTY process: %w", err)
	}
	return process, nil
}

func terminalConPTYEnvironmentBlock(environment []string) ([]uint16, error) {
	if len(environment) == 0 {
		return []uint16{0, 0}, nil
	}
	for _, value := range environment {
		if strings.IndexByte(value, '\x00') >= 0 {
			return nil, errors.New("environment entry contains a NUL byte")
		}
	}
	ordered := terminalConPTYSortedEnvironment(environment)
	block := make([]uint16, 0, len(ordered)+1)
	for _, value := range ordered {
		block = append(block, utf16.Encode([]rune(value))...)
		block = append(block, 0)
	}
	return append(block, 0), nil
}

// terminalConPTYSortedEnvironment mirrors the Go Windows CreateProcess
// contract: environment entries are sorted case-insensitively by their name,
// while preserving the caller's slice when it already meets that contract.
func terminalConPTYSortedEnvironment(environment []string) []string {
	compare := func(left string, right string) int {
		return strings.Compare(
			terminalConPTYEnvironmentSortKey(left),
			terminalConPTYEnvironmentSortKey(right),
		)
	}
	if slices.IsSortedFunc(environment, compare) {
		return environment
	}
	ordered := slices.Clone(environment)
	slices.SortFunc(ordered, compare)
	return ordered
}

func terminalConPTYEnvironmentSortKey(value string) string {
	equals := strings.IndexByte(value, '=')
	if equals < 0 {
		return ""
	}
	key := []byte(value[:equals])
	for index, character := range key {
		if character >= 'a' && character <= 'z' {
			key[index] = character - ('a' - 'A')
		}
	}
	return string(key)
}

func (pty *suspendedWindowsConPTY) Resume() error {
	if pty == nil {
		return errors.New("terminal: suspended ConPTY is unavailable")
	}
	pty.mutex.Lock()
	defer pty.mutex.Unlock()
	if pty.resumed {
		return nil
	}
	if _, err := windows.ResumeThread(pty.process.Thread); err != nil {
		return fmt.Errorf("terminal: resume suspended ConPTY root: %w", err)
	}
	pty.resumed = true
	return nil
}

func (pty *suspendedWindowsConPTY) Read(data []byte) (int, error) {
	var read uint32
	err := windows.ReadFile(pty.commandOutput, data, &read, nil)
	return int(read), err
}

func (pty *suspendedWindowsConPTY) Write(data []byte) (int, error) {
	var written uint32
	err := windows.WriteFile(pty.commandInput, data, &written, nil)
	return int(written), err
}

func (pty *suspendedWindowsConPTY) Resize(columns int, rows int) error {
	coordinates := terminalConPTYCoord{x: int16(columns), y: int16(rows)}
	result, _, _ := terminalResizePseudoConsole.Call(uintptr(pty.pseudoConsole), coordinates.packed())
	if result != 0 {
		return fmt.Errorf("terminal: resize pseudo console failed with status 0x%x", result)
	}
	return nil
}

func (pty *suspendedWindowsConPTY) Abort() error {
	if pty == nil || pty.process.Process == 0 || pty.process.Process == windows.InvalidHandle {
		return nil
	}
	if err := windows.TerminateProcess(pty.process.Process, 1); err != nil {
		return fmt.Errorf("terminal: terminate unassigned suspended ConPTY root: %w", err)
	}
	return nil
}

func (pty *suspendedWindowsConPTY) Close() error {
	if pty == nil {
		return nil
	}
	pty.closeOnce.Do(func() {
		closeTerminalPseudoConsole(pty.pseudoConsole)
		pty.closeErr = closeTerminalWindowsHandles(
			pty.process.Process,
			pty.process.Thread,
			pty.ptyInput,
			pty.ptyOutput,
			pty.commandInput,
			pty.commandOutput,
		)
	})
	return pty.closeErr
}

func (pty *suspendedWindowsConPTY) Wait(context context.Context) (uint32, error) {
	if pty == nil || pty.waitDone == nil {
		return terminalConPTYStillActive, errors.New("terminal: ConPTY wait handle is unavailable")
	}
	select {
	case <-pty.waitDone:
		return pty.waitExitCode, pty.waitErr
	case <-context.Done():
		return terminalConPTYStillActive, fmt.Errorf("terminal: ConPTY wait canceled: %w", context.Err())
	}
}

func (pty *suspendedWindowsConPTY) Pid() int { return int(pty.process.ProcessId) }

func (pty *suspendedWindowsConPTY) waitForRoot() {
	operations := pty.waitOperations
	var exitCode uint32
	var result error
	if operations.wait == nil || operations.exitCode == nil || operations.close == nil {
		result = errors.New("terminal: ConPTY wait operations are unavailable")
	} else {
		waitResult, waitErr := operations.wait(pty.waitProcess, windows.INFINITE)
		if waitErr != nil {
			result = fmt.Errorf("terminal: wait for ConPTY root: %w", waitErr)
		} else if waitResult != uint32(windows.WAIT_OBJECT_0) {
			result = fmt.Errorf("terminal: wait for ConPTY root returned status %#x", waitResult)
		} else if exitErr := operations.exitCode(pty.waitProcess, &exitCode); exitErr != nil {
			result = fmt.Errorf("terminal: read ConPTY root exit status: %w", exitErr)
		}
		if closeErr := operations.close(pty.waitProcess); closeErr != nil {
			result = errors.Join(result, fmt.Errorf("terminal: release ConPTY wait handle: %w", closeErr))
		}
	}
	pty.waitExitCode = exitCode
	pty.waitErr = result
	close(pty.waitDone)
}

func closeTerminalPseudoConsole(pseudoConsole windows.Handle) {
	if pseudoConsole == 0 || pseudoConsole == windows.InvalidHandle || terminalClosePseudoConsole.Find() != nil {
		return
	}
	terminalClosePseudoConsole.Call(uintptr(pseudoConsole))
}

func closeTerminalWindowsHandles(handles ...windows.Handle) error {
	var result error
	for _, handle := range handles {
		if handle == 0 || handle == windows.InvalidHandle {
			continue
		}
		result = errors.Join(result, windows.CloseHandle(handle))
	}
	return result
}
