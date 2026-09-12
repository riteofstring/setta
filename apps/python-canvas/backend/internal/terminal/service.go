package terminal

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/setta/python-canvas/backend/internal/pythonenv"
	"github.com/setta/python-canvas/backend/internal/terminalbounds"
)

const (
	defaultColumns          = 80
	defaultRows             = 24
	defaultHistoryLimit     = 64 * 1024
	defaultAttachmentBuffer = 64
	defaultTicketTTL        = time.Minute

	terminalMaximumDimension = terminalbounds.MaximumDimension
)

var (
	ErrClosed                    = errors.New("terminal: service is closed")
	ErrSessionNotFound           = errors.New("terminal: session is not open")
	ErrSessionExited             = errors.New("terminal: session has exited")
	ErrAttachmentActive          = errors.New("terminal: browser attachment is already active")
	ErrInvalidTicket             = errors.New("terminal: attachment ticket is invalid")
	ErrInvalidSize               = errors.New("terminal: size must be between 1 and 32767")
	ErrPythonEnvironmentRequired = errors.New("terminal: resolved Python environment is required")
	ErrPythonUnavailable         = errors.New("terminal: Python interpreter is unavailable")
)

type Runtime interface {
	Open(columns int, rows int) (Session, bool, error)
	Run(context.Context, string, int, int) (Session, bool, error)
	IssueTicket() (string, error)
	Attach(ticket string) (*Attachment, error)
	Write([]byte) error
	Resize(columns int, rows int) error
	Delete(context.Context) error
	Close(context.Context) error
}

type Options struct {
	ProjectDirectory  string
	PythonEnvironment pythonenv.ResolvedPythonEnvironment
	Shell             []string
	HistoryLimit      int
	TicketTTL         time.Duration
	Random            io.Reader
}

type Session struct {
	Columns int
	Rows    int
}

type Attachment struct {
	History []byte
	Output  <-chan []byte

	closeOnce sync.Once
	closeFn   func()
}

func (attachment *Attachment) Close() {
	if attachment == nil {
		return
	}
	attachment.closeOnce.Do(func() {
		if attachment.closeFn != nil {
			attachment.closeFn()
		}
	})
}

type Service struct {
	projectDirectory string
	interpreter      string
	childEnvironment []string
	shell            []string
	historyLimit     int
	ticketTTL        time.Duration
	random           io.Reader
	openTerminal     func([]string, string, []string, int, int) (ptySession, error)
	createArtifact   func(string, string) (runArtifact, error)
	removeArtifact   func(string) error

	mu      sync.Mutex
	closed  bool
	session *session
	tickets map[string]ticket
}

type ticket struct {
	session   *session
	expiresAt time.Time
}

type session struct {
	pty ptySession

	mu          sync.Mutex
	writeMu     sync.Mutex
	columns     int
	rows        int
	exited      bool
	done        chan struct{}
	history     historyBuffer
	attachment  *liveAttachment
	artifacts   map[string]struct{}
	cleanupOnce sync.Once
	waitErr     error
	closing     bool
	stopErr     error
	remove      func(string) error
}

type liveAttachment struct {
	id     uint64
	output chan []byte
}

type historyBuffer struct {
	limit int
	bytes []byte
}

func New(options Options) (*Service, error) {
	directory, err := validateProjectDirectory(options.ProjectDirectory)
	if err != nil {
		return nil, err
	}
	interpreter := options.PythonEnvironment.InterpreterPath()
	childEnvironment := options.PythonEnvironment.ChildEnvironment()
	if strings.TrimSpace(interpreter) == "" || len(childEnvironment) == 0 {
		return nil, ErrPythonEnvironmentRequired
	}
	if err := validateConfiguredInterpreter(interpreter); err != nil {
		return nil, err
	}
	shell, err := resolveShell(options.Shell)
	if err != nil {
		return nil, err
	}
	historyLimit := options.HistoryLimit
	if historyLimit == 0 {
		historyLimit = defaultHistoryLimit
	}
	if historyLimit < 1 {
		return nil, fmt.Errorf("terminal history limit must be positive")
	}
	ticketTTL := options.TicketTTL
	if ticketTTL == 0 {
		ticketTTL = defaultTicketTTL
	}
	if ticketTTL <= 0 {
		return nil, fmt.Errorf("terminal ticket lifetime must be positive")
	}
	random := options.Random
	if random == nil {
		random = rand.Reader
	}
	return &Service{
		projectDirectory: directory,
		interpreter:      interpreter,
		childEnvironment: childEnvironment,
		shell:            shell,
		historyLimit:     historyLimit,
		ticketTTL:        ticketTTL,
		random:           random,
		openTerminal:     openPTY,
		createArtifact:   createRunArtifact,
		removeArtifact:   removeRunArtifact,
		tickets:          make(map[string]ticket),
	}, nil
}

func (service *Service) Open(columns int, rows int) (Session, bool, error) {
	session, created, err := service.ensureSession(columns, rows)
	if err != nil {
		return Session{}, false, err
	}
	return session.info(), created, nil
}

func (service *Service) Run(ctx context.Context, code string, columns int, rows int) (Session, bool, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return Session{}, false, err
	}
	if err := validateConfiguredInterpreter(service.interpreter); err != nil {
		return Session{}, false, err
	}
	session, created, err := service.ensureSession(columns, rows)
	if err != nil {
		return Session{}, false, err
	}
	createArtifact := service.createArtifact
	if createArtifact == nil {
		createArtifact = createRunArtifact
	}
	artifact, err := createArtifact(service.projectDirectory, code)
	if err != nil {
		return Session{}, created, err
	}
	if err := ctx.Err(); err != nil {
		return Session{}, created, service.removeArtifactAfterFailure(artifact.path, err)
	}
	if !session.trackArtifact(artifact.path) {
		return Session{}, created, service.removeArtifactAfterFailure(artifact.path, ErrSessionExited)
	}
	command := managedRunCommand(service.interpreter, artifact.relativePath)
	if err := session.write([]byte(command)); err != nil {
		session.untrackArtifact(artifact.path)
		return Session{}, created, service.removeArtifactAfterFailure(artifact.path, err)
	}
	return session.info(), created, nil
}

func (service *Service) IssueTicket() (string, error) {
	service.mu.Lock()
	defer service.mu.Unlock()
	if service.closed {
		return "", ErrClosed
	}
	if service.session == nil {
		return "", ErrSessionNotFound
	}
	if service.session.isExited() || service.session.isClosing() {
		return "", ErrSessionExited
	}
	value, err := newTicket(service.random)
	if err != nil {
		return "", err
	}
	service.tickets[value] = ticket{
		session:   service.session,
		expiresAt: time.Now().Add(service.ticketTTL),
	}
	return value, nil
}

func (service *Service) Attach(value string) (*Attachment, error) {
	service.mu.Lock()
	if service.closed {
		service.mu.Unlock()
		return nil, ErrClosed
	}
	entry, found := service.tickets[value]
	delete(service.tickets, value)
	if !found || time.Now().After(entry.expiresAt) || entry.session != service.session {
		service.mu.Unlock()
		return nil, ErrInvalidTicket
	}
	service.mu.Unlock()

	entry.session.mu.Lock()
	if entry.session.exited || entry.session.closing {
		entry.session.mu.Unlock()
		return nil, ErrSessionExited
	}
	if entry.session.attachment != nil {
		entry.session.mu.Unlock()
		return nil, ErrAttachmentActive
	}
	history := entry.session.history.copy()
	live := &liveAttachment{id: uint64(time.Now().UnixNano()), output: make(chan []byte, defaultAttachmentBuffer)}
	entry.session.attachment = live
	entry.session.mu.Unlock()

	return &Attachment{
		History: history,
		Output:  live.output,
		closeFn: func() { service.detach(entry.session, live.id) },
	}, nil
}

func (service *Service) Write(data []byte) error {
	session, err := service.liveSession()
	if err != nil {
		return err
	}
	return session.write(data)
}

func (service *Service) Resize(columns int, rows int) error {
	if err := validateSize(columns, rows); err != nil {
		return err
	}
	session, err := service.liveSession()
	if err != nil {
		return err
	}
	if err := session.pty.Resize(columns, rows); err != nil {
		return fmt.Errorf("resize terminal PTY: %w", err)
	}
	session.mu.Lock()
	if !session.exited && !session.closing {
		session.columns = columns
		session.rows = rows
	}
	session.mu.Unlock()
	return nil
}

func (service *Service) Delete(ctx context.Context) error {
	if ctx == nil {
		ctx = context.Background()
	}
	service.mu.Lock()
	if service.session == nil {
		service.mu.Unlock()
		return ErrSessionNotFound
	}
	session := service.session
	service.discardTicketsLocked(session)
	service.mu.Unlock()
	return service.stopAndWait(ctx, session)
}

func (service *Service) Close(ctx context.Context) error {
	if ctx == nil {
		ctx = context.Background()
	}
	service.mu.Lock()
	if service.closed {
		service.mu.Unlock()
		return nil
	}
	service.closed = true
	session := service.session
	service.session = nil
	if session != nil {
		service.discardTicketsLocked(session)
	}
	service.mu.Unlock()
	if session == nil {
		return nil
	}
	return service.stopAndWait(ctx, session)
}

func (service *Service) ensureSession(columns int, rows int) (*session, bool, error) {
	if err := validateSize(columns, rows); err != nil {
		return nil, false, err
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	if service.closed {
		return nil, false, ErrClosed
	}
	existing, handled, err := service.resolveExistingSessionLocked(columns, rows)
	if handled || err != nil {
		return existing, false, err
	}
	return service.startSessionLocked(columns, rows)
}

func (service *Service) resolveExistingSessionLocked(columns int, rows int) (*session, bool, error) {
	existing := service.session
	if existing == nil {
		return nil, false, nil
	}
	if !existing.isExited() && !existing.isClosing() {
		if err := existing.resize(columns, rows); err != nil {
			return nil, true, err
		}
		return existing, true, nil
	}
	return service.clearFinishedSessionLocked(existing)
}

func (service *Service) clearFinishedSessionLocked(existing *session) (*session, bool, error) {
	select {
	case <-existing.done:
		service.discardTicketsLocked(existing)
		service.session = nil
		if err := existing.waitError(); err != nil {
			return nil, true, fmt.Errorf("terminal session cleanup: %w", err)
		}
		return nil, false, nil
	default:
		return nil, true, ErrSessionExited
	}
}

func (service *Service) startSessionLocked(columns int, rows int) (*session, bool, error) {
	openTerminal := service.openTerminal
	if openTerminal == nil {
		openTerminal = openPTY
	}
	pty, err := openTerminal(service.shell, service.projectDirectory, service.childEnvironment, columns, rows)
	if err != nil {
		return nil, false, err
	}
	created := &session{
		pty:       pty,
		columns:   columns,
		rows:      rows,
		done:      make(chan struct{}),
		history:   historyBuffer{limit: service.historyLimit},
		artifacts: make(map[string]struct{}),
		remove:    service.removeArtifact,
	}
	service.session = created
	go service.readLoop(created)
	go service.waitLoop(created)
	return created, true, nil
}

func (service *Service) liveSession() (*session, error) {
	service.mu.Lock()
	defer service.mu.Unlock()
	if service.closed {
		return nil, ErrClosed
	}
	if service.session == nil {
		return nil, ErrSessionNotFound
	}
	if service.session.isExited() || service.session.isClosing() {
		return nil, ErrSessionExited
	}
	return service.session, nil
}

func (service *Service) stopAndWait(ctx context.Context, session *session) error {
	stopErr := session.stop()
	select {
	case <-session.done:
		return errors.Join(stopErr, session.waitError())
	case <-ctx.Done():
		return errors.Join(ctx.Err(), stopErr)
	}
}

func (service *Service) readLoop(session *session) {
	buffer := make([]byte, 4096)
	for {
		count, err := session.pty.Read(buffer)
		if count > 0 {
			service.appendOutput(session, buffer[:count])
		}
		if err != nil {
			return
		}
	}
}

func (service *Service) waitLoop(session *session) {
	session.finish(session.pty.Wait())
}

func (service *Service) appendOutput(session *session, data []byte) {
	if len(data) == 0 {
		return
	}
	var stale *liveAttachment
	session.mu.Lock()
	if session.exited || session.closing {
		session.mu.Unlock()
		return
	}
	session.history.append(data)
	if live := session.attachment; live != nil {
		chunk := append([]byte(nil), data...)
		select {
		case live.output <- chunk:
		default:
			session.attachment = nil
			stale = live
		}
	}
	session.mu.Unlock()
	if stale != nil {
		close(stale.output)
	}
}

func (service *Service) detach(session *session, attachmentID uint64) {
	if session == nil {
		return
	}
	var output chan []byte
	session.mu.Lock()
	if session.attachment != nil && session.attachment.id == attachmentID {
		output = session.attachment.output
		session.attachment = nil
	}
	session.mu.Unlock()
	if output != nil {
		close(output)
	}
}

func (service *Service) discardTicketsLocked(session *session) {
	for value, entry := range service.tickets {
		if entry.session == session {
			delete(service.tickets, value)
		}
	}
}

func (session *session) info() Session {
	session.mu.Lock()
	defer session.mu.Unlock()
	return Session{Columns: session.columns, Rows: session.rows}
}

func (session *session) isExited() bool {
	session.mu.Lock()
	defer session.mu.Unlock()
	return session.exited
}

func (session *session) isClosing() bool {
	session.mu.Lock()
	defer session.mu.Unlock()
	return session.closing
}

func (session *session) resize(columns int, rows int) error {
	if err := session.pty.Resize(columns, rows); err != nil {
		return fmt.Errorf("resize terminal PTY: %w", err)
	}
	session.mu.Lock()
	if session.exited || session.closing {
		session.mu.Unlock()
		return ErrSessionExited
	}
	session.columns = columns
	session.rows = rows
	session.mu.Unlock()
	return nil
}

func (session *session) write(data []byte) error {
	if len(data) == 0 {
		return nil
	}
	session.mu.Lock()
	exited := session.exited || session.closing
	session.mu.Unlock()
	if exited {
		return ErrSessionExited
	}
	session.writeMu.Lock()
	defer session.writeMu.Unlock()
	if _, err := session.pty.Write(data); err != nil {
		return fmt.Errorf("write terminal input: %w", err)
	}
	return nil
}

func (session *session) trackArtifact(path string) bool {
	session.mu.Lock()
	defer session.mu.Unlock()
	if session.exited || session.closing {
		return false
	}
	session.artifacts[path] = struct{}{}
	return true
}

func (session *session) untrackArtifact(path string) {
	session.mu.Lock()
	delete(session.artifacts, path)
	session.mu.Unlock()
}

func (session *session) stop() error {
	session.mu.Lock()
	session.closing = true
	session.mu.Unlock()
	session.cleanupOnce.Do(func() {
		err := session.pty.Close()
		session.mu.Lock()
		session.stopErr = err
		session.mu.Unlock()
	})
	session.mu.Lock()
	defer session.mu.Unlock()
	return session.stopErr
}

func (session *session) finish(waitErr error) {
	var output chan []byte
	var artifacts []string
	session.mu.Lock()
	if session.exited {
		session.mu.Unlock()
		return
	}
	session.exited = true
	session.waitErr = waitErr
	if session.attachment != nil {
		output = session.attachment.output
		session.attachment = nil
	}
	for path := range session.artifacts {
		artifacts = append(artifacts, path)
	}
	clear(session.artifacts)
	session.mu.Unlock()
	if output != nil {
		close(output)
	}
	var cleanupErr error
	for _, path := range artifacts {
		if err := session.removeArtifact(path); err != nil {
			cleanupErr = errors.Join(cleanupErr, fmt.Errorf("remove generated Python run artifact %q: %w", path, err))
		}
	}
	stopErr := session.stop()
	session.mu.Lock()
	session.waitErr = errors.Join(session.waitErr, cleanupErr, stopErr)
	session.mu.Unlock()

	close(session.done)
}

func (session *session) removeArtifact(path string) error {
	if session.remove != nil {
		return session.remove(path)
	}
	return removeRunArtifact(path)
}

func (service *Service) removeArtifactAfterFailure(path string, cause error) error {
	remove := service.removeArtifact
	if remove == nil {
		remove = removeRunArtifact
	}
	if err := remove(path); err != nil {
		return errors.Join(cause, fmt.Errorf("remove generated Python run artifact %q: %w", path, err))
	}
	return cause
}

func (session *session) waitError() error {
	if session == nil {
		return nil
	}
	session.mu.Lock()
	defer session.mu.Unlock()
	return session.waitErr
}

func (history *historyBuffer) append(data []byte) {
	if history.limit < 1 || len(data) == 0 {
		return
	}
	if len(data) >= history.limit {
		history.bytes = append(history.bytes[:0], data[len(data)-history.limit:]...)
		return
	}
	history.bytes = append(history.bytes, data...)
	if over := len(history.bytes) - history.limit; over > 0 {
		copy(history.bytes, history.bytes[over:])
		history.bytes = history.bytes[:len(history.bytes)-over]
	}
}

func (history *historyBuffer) copy() []byte {
	return append([]byte(nil), history.bytes...)
}

type runArtifact struct {
	path         string
	relativePath string
}

type runArtifactWriter struct {
	file      *os.File
	path      string
	fileOpen  bool
	committed bool
}

func createRunArtifact(directory string, code string) (created runArtifact, resultErr error) {
	file, err := os.CreateTemp(directory, ".setta-run-*.py")
	if err != nil {
		return runArtifact{}, fmt.Errorf("create generated Python run artifact: %w", err)
	}
	writer := &runArtifactWriter{file: file, path: file.Name(), fileOpen: true}
	defer writer.cleanupOnFailure(&resultErr)
	if err := writer.protect(); err != nil {
		return runArtifact{}, err
	}
	if err := writer.write(code); err != nil {
		return runArtifact{}, err
	}
	if err := writer.sync(); err != nil {
		return runArtifact{}, err
	}
	if err := writer.close(); err != nil {
		return runArtifact{}, err
	}
	if err := writer.makeImmutable(); err != nil {
		return runArtifact{}, err
	}
	writer.committed = true

	return runArtifact{path: writer.path, relativePath: filepath.Base(writer.path)}, nil
}

func (writer *runArtifactWriter) protect() error {
	if err := writer.file.Chmod(0o600); err != nil {
		return fmt.Errorf("protect generated Python run artifact: %w", err)
	}
	return nil
}

func (writer *runArtifactWriter) write(code string) error {
	if _, err := io.WriteString(writer.file, code); err != nil {
		return fmt.Errorf("write generated Python run artifact: %w", err)
	}
	return nil
}

func (writer *runArtifactWriter) sync() error {
	if err := writer.file.Sync(); err != nil {
		return fmt.Errorf("sync generated Python run artifact: %w", err)
	}
	return nil
}

func (writer *runArtifactWriter) close() error {
	err := writer.file.Close()
	writer.fileOpen = false
	if err != nil {
		return fmt.Errorf("close generated Python run artifact: %w", err)
	}
	return nil
}

func (writer *runArtifactWriter) makeImmutable() error {
	if err := os.Chmod(writer.path, 0o400); err != nil {
		return fmt.Errorf("make generated Python run artifact immutable: %w", err)
	}
	return nil
}

func (writer *runArtifactWriter) cleanupOnFailure(resultErr *error) {
	if writer.committed {
		return
	}
	if cleanupErr := writer.cleanup(); cleanupErr != nil {
		*resultErr = errors.Join(
			*resultErr,
			fmt.Errorf("clean up incomplete generated Python run artifact: %w", cleanupErr),
		)
	}
}

func (writer *runArtifactWriter) cleanup() error {
	var result error
	if writer.fileOpen {
		result = writer.file.Close()
	}
	if err := os.Remove(writer.path); err != nil && !errors.Is(err, os.ErrNotExist) {
		result = errors.Join(result, err)
	}
	return result
}

func (artifact runArtifact) remove() error {
	return removeRunArtifact(artifact.path)
}

func removeRunArtifact(path string) error {
	if path == "" {
		return nil
	}

	if err := os.Chmod(path, 0o600); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func validateConfiguredInterpreter(interpreter string) error {
	interpreter = strings.TrimSpace(interpreter)
	if interpreter == "" || !filepath.IsAbs(interpreter) {
		return ErrPythonUnavailable
	}
	info, err := os.Stat(interpreter)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrPythonUnavailable, err)
	}
	if !info.Mode().IsRegular() {
		return fmt.Errorf("%w: %q is not a regular file", ErrPythonUnavailable, interpreter)
	}
	if runtime.GOOS != "windows" && info.Mode().Perm()&0o111 == 0 {
		return fmt.Errorf("%w: %q is not executable", ErrPythonUnavailable, interpreter)
	}
	return nil
}

func newTicket(random io.Reader) (string, error) {
	bytes := make([]byte, 32)
	if _, err := io.ReadFull(random, bytes); err != nil {
		return "", fmt.Errorf("generate terminal attachment ticket: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}

func validateProjectDirectory(path string) (string, error) {
	if strings.TrimSpace(path) == "" {
		return "", errors.New("terminal project directory is required")
	}
	resolved, err := filepath.Abs(path)
	if err != nil {
		return "", fmt.Errorf("resolve terminal project directory: %w", err)
	}
	info, err := os.Stat(resolved)
	if err != nil {
		return "", fmt.Errorf("stat terminal project directory: %w", err)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("terminal project directory %q is not a directory", resolved)
	}
	return resolved, nil
}

func validateSize(columns int, rows int) error {
	if columns < 1 || rows < 1 || columns > terminalMaximumDimension || rows > terminalMaximumDimension {
		return ErrInvalidSize
	}
	return nil
}
