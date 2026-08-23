// Package terminal owns the one transient interactive shell attached to
// Generated Python. It deliberately knows neither HTTP nor the project
// aggregate: callers provide only canonical generated code to Run.
package terminal

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	defaultColumns          = 80
	defaultRows             = 24
	defaultHistoryLimit     = 64 * 1024
	defaultAttachmentBuffer = 64
	defaultTicketTTL        = time.Minute
)

var (
	ErrClosed            = errors.New("terminal: service is closed")
	ErrSessionNotFound   = errors.New("terminal: session is not open")
	ErrSessionExited     = errors.New("terminal: session has exited")
	ErrAttachmentActive  = errors.New("terminal: browser attachment is already active")
	ErrInvalidTicket     = errors.New("terminal: attachment ticket is invalid")
	ErrInvalidSize       = errors.New("terminal: size must be positive")
	ErrPythonUnavailable = errors.New("terminal: Python interpreter is unavailable")
)

// Runtime is the narrow process boundary used by the HTTP adapter. There is
// intentionally no caller-selected command, directory, or environment.
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
	ProjectDirectory string
	Shell            []string
	HistoryLimit     int
	TicketTTL        time.Duration
	Random           io.Reader
}

type Session struct {
	Columns int
	Rows    int
}

// Attachment captures a history-plus-live handoff. History is copied and the
// live channel is registered while holding the same session lock, so a stream
// cannot miss output between the retained bytes and live forwarding.
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
	shell            []string
	historyLimit     int
	ticketTTL        time.Duration
	random           io.Reader

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
		shell:            shell,
		historyLimit:     historyLimit,
		ticketTTL:        ticketTTL,
		random:           random,
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

// Run creates or reuses the shell and writes a backend-owned Python command
// into its PTY. Each immutable artifact retains its exact generated revision
// until the session's Delete or Close cleanup. The command is never supplied
// by a caller.
func (service *Service) Run(ctx context.Context, code string, columns int, rows int) (Session, bool, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return Session{}, false, err
	}
	session, created, err := service.ensureSession(columns, rows)
	if err != nil {
		return Session{}, false, err
	}
	interpreter, err := resolvePython()
	if err != nil {
		return Session{}, created, err
	}
	artifact, err := createRunArtifact(service.projectDirectory, code)
	if err != nil {
		return Session{}, created, err
	}
	if err := ctx.Err(); err != nil {
		_ = artifact.remove()
		return Session{}, created, err
	}
	if !session.trackArtifact(artifact.path) {
		_ = artifact.remove()
		return Session{}, created, ErrSessionExited
	}
	command := managedRunCommand(interpreter, artifact.relativePath)
	if err := session.write([]byte(command)); err != nil {
		session.untrackArtifact(artifact.path)
		_ = artifact.remove()
		return Session{}, created, err
	}
	return session.info(), created, nil
}

// IssueTicket returns one opaque single-use ticket for the current live
// session. It contains no project identity and is never accepted by REST.
func (service *Service) IssueTicket() (string, error) {
	service.mu.Lock()
	defer service.mu.Unlock()
	if service.closed {
		return "", ErrClosed
	}
	if service.session == nil {
		return "", ErrSessionNotFound
	}
	if service.session.isExited() {
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

// Attach consumes a ticket and permits exactly one active browser stream. A
// later hide/show detaches and obtains a new ticket without killing the PTY.
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
	if entry.session.exited {
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
	if !session.exited {
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
	service.session = nil
	service.discardTicketsLocked(session)
	service.mu.Unlock()
	return service.stopAndWait(ctx, session)
}

// Close terminates the shell and reaps it before returning. It is safe to call
// from launcher shutdown more than once.
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
	if service.session != nil && !service.session.isExited() {
		existing := service.session
		if err := existing.resize(columns, rows); err != nil {
			return nil, false, err
		}
		return existing, false, nil
	}
	if service.session != nil {
		service.discardTicketsLocked(service.session)
		service.session = nil
	}
	pty, err := openPTY(service.shell, service.projectDirectory, columns, rows)
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
	if service.session.isExited() {
		return nil, ErrSessionExited
	}
	return service.session, nil
}

func (service *Service) stopAndWait(ctx context.Context, session *session) error {
	session.stop()
	select {
	case <-session.done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
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
	_ = session.pty.Wait()
	session.finish()
}

func (service *Service) appendOutput(session *session, data []byte) {
	if len(data) == 0 {
		return
	}
	var stale *liveAttachment
	session.mu.Lock()
	if session.exited {
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

func (session *session) resize(columns int, rows int) error {
	if err := session.pty.Resize(columns, rows); err != nil {
		return fmt.Errorf("resize terminal PTY: %w", err)
	}
	session.mu.Lock()
	if session.exited {
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
	exited := session.exited
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
	if session.exited {
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

func (session *session) stop() {
	session.cleanupOnce.Do(func() {
		_ = session.pty.Close()
	})
}

func (session *session) finish() {
	var output chan []byte
	var artifacts []string
	session.mu.Lock()
	if session.exited {
		session.mu.Unlock()
		return
	}
	session.exited = true
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
	for _, path := range artifacts {
		_ = removeRunArtifact(path)
	}
	_ = session.pty.Close()
	// Close only after owned artifacts are gone so Delete and launcher
	// shutdown return with their process-boundary cleanup complete.
	close(session.done)
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

func createRunArtifact(directory string, code string) (runArtifact, error) {
	file, err := os.CreateTemp(directory, ".setta-run-*.py")
	if err != nil {
		return runArtifact{}, fmt.Errorf("create generated Python run artifact: %w", err)
	}
	path := file.Name()
	committed := false
	defer func() {
		if !committed {
			_ = file.Close()
			_ = os.Remove(path)
		}
	}()
	if err := file.Chmod(0o600); err != nil {
		return runArtifact{}, fmt.Errorf("protect generated Python run artifact: %w", err)
	}
	if _, err := io.WriteString(file, code); err != nil {
		return runArtifact{}, fmt.Errorf("write generated Python run artifact: %w", err)
	}
	if err := file.Sync(); err != nil {
		return runArtifact{}, fmt.Errorf("sync generated Python run artifact: %w", err)
	}
	if err := file.Close(); err != nil {
		return runArtifact{}, fmt.Errorf("close generated Python run artifact: %w", err)
	}
	if err := os.Chmod(path, 0o400); err != nil {
		return runArtifact{}, fmt.Errorf("make generated Python run artifact immutable: %w", err)
	}
	committed = true
	// The PTY starts in the project directory. Keep the absolute path only for
	// backend cleanup; the terminal sees a concise relative artifact name.
	return runArtifact{path: path, relativePath: filepath.Base(path)}, nil
}

func (artifact runArtifact) remove() error {
	return removeRunArtifact(artifact.path)
}

func removeRunArtifact(path string) error {
	if path == "" {
		return nil
	}
	// Clearing the read-only bit keeps backend cleanup portable: Windows does
	// not delete a read-only file until its attribute is removed.
	if err := os.Chmod(path, 0o600); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func resolvePython() (string, error) {
	for _, name := range []string{"python3", "python"} {
		path, err := exec.LookPath(name)
		if err == nil {
			return path, nil
		}
	}
	return "", ErrPythonUnavailable
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
	if columns < 1 || rows < 1 {
		return ErrInvalidSize
	}
	return nil
}
