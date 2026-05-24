package terminals

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"strings"
	"sync"
	"time"
)

const (
	TerminalIDSeparator      = "::"
	defaultHistoryLimitBytes = 64 * 1024
	defaultSubscriberBuffer  = 32
	defaultReadBufferSize    = 4096
	defaultColumns           = 80
	defaultRows              = 24
	defaultPromptReadyWait   = 5 * time.Second
	runCommandEchoColumns    = 512
)

var (
	ErrUnknownSession       = errors.New("terminals: unknown session")
	ErrSessionConflict      = errors.New("terminals: session already exists with different scope or command")
	ErrInputDisabled        = errors.New("terminals: input is disabled for this session")
	ErrServiceClosed        = errors.New("terminals: service is closed")
	ErrInterruptUnsupported = errors.New("terminals: interrupt is unsupported on this platform")
)

type Options struct {
	Logger            *slog.Logger
	HistoryLimitBytes int
	SubscriberBuffer  int
	ReadBufferSize    int
	Shell             []string
	EnvLookup         func(string) (string, bool)
}

type OpenOptions struct {
	ID             string
	ProjectID      string
	ShareSessionID string
	AllowInput     bool
	Command        []string
	Dir            string
	Env            []string
	Columns        int
	Rows           int
}

type SessionInfo struct {
	ID             string    `json:"id"`
	ProjectID      string    `json:"projectId"`
	ShareSessionID string    `json:"shareSessionId,omitempty"`
	AllowInput     bool      `json:"allowInput"`
	Columns        int       `json:"columns"`
	Rows           int       `json:"rows"`
	CreatedAt      time.Time `json:"createdAt"`
}

type Attachment struct {
	History []byte
	Output  <-chan []byte

	closeOnce sync.Once
	closeFn   func()
}

func (a *Attachment) Close() {
	if a == nil {
		return
	}
	a.closeOnce.Do(func() {
		if a.closeFn != nil {
			a.closeFn()
		}
	})
}

type ptySession interface {
	Read([]byte) (int, error)
	Write([]byte) (int, error)
	Resize(columns int, rows int) error
	Close() error
	Wait() error
	ProcessPID() int
	Control(fn func(fd uintptr)) error
}

type Service struct {
	logger           *slog.Logger
	historyLimit     int
	subscriberBuffer int
	readBufferSize   int
	defaultCommand   []string

	mu               sync.RWMutex
	sessions         map[string]*session
	nextAttachmentID uint64
	closed           bool
}

type session struct {
	id             string
	projectID      string
	shareSessionID string
	allowInput     bool
	command        []string
	dir            string
	env            []string
	createdAt      time.Time

	cancel context.CancelFunc
	pty    ptySession

	waitDone    chan struct{}
	cleanupOnce sync.Once

	mu          sync.RWMutex
	columns     int
	rows        int
	exited      bool
	history     historyBuffer
	attachments map[string]chan []byte

	managedDefaultShell           bool
	attachedOnce                  bool
	preAttachBackendRunNormalized bool
	initialSizeSynced             bool
	pendingRunCommands            [][]byte

	promptReadyOnce                  sync.Once
	promptReadyStart                 sync.Once
	promptReady                      chan struct{}
	promptReadyMarker                string
	promptReadyBuffer                []byte
	promptReadyActive                bool
	promptReadyAwaitingVisibleOutput bool
	pendingPromptInput               bool
}

type historyBuffer struct {
	limit  int
	size   int
	chunks [][]byte
}

func New(options Options) (*Service, error) {
	logger := options.Logger
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}

	historyLimit := options.HistoryLimitBytes
	if historyLimit == 0 {
		historyLimit = defaultHistoryLimitBytes
	}
	if historyLimit < 0 {
		return nil, fmt.Errorf("history limit must be non-negative")
	}

	subscriberBuffer := options.SubscriberBuffer
	if subscriberBuffer == 0 {
		subscriberBuffer = defaultSubscriberBuffer
	}
	if subscriberBuffer < 0 {
		return nil, fmt.Errorf("subscriber buffer must be non-negative")
	}

	readBufferSize := options.ReadBufferSize
	if readBufferSize == 0 {
		readBufferSize = defaultReadBufferSize
	}
	if readBufferSize < 1 {
		return nil, fmt.Errorf("read buffer size must be positive")
	}

	envLookup := options.EnvLookup
	if envLookup == nil {
		envLookup = os.LookupEnv
	}

	defaultCommand := append([]string(nil), options.Shell...)
	var err error
	if len(defaultCommand) == 0 {
		defaultCommand, err = resolveDefaultCommand(envLookup)
		if err != nil {
			return nil, err
		}
	}
	return &Service{
		logger:           logger,
		historyLimit:     historyLimit,
		subscriberBuffer: subscriberBuffer,
		readBufferSize:   readBufferSize,
		defaultCommand:   defaultCommand,
		sessions:         make(map[string]*session),
	}, nil
}

func BuildTerminalID(sectionID string, shareSessionID string) string {
	sectionID = strings.TrimSpace(sectionID)
	shareSessionID = strings.TrimSpace(shareSessionID)
	if shareSessionID == "" {
		return sectionID
	}
	return shareSessionID + TerminalIDSeparator + sectionID
}
