package prompttemplates

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"sync"
	"time"
)

const defaultWatchInterval = 100 * time.Millisecond

var ErrWatcherStoreRequired = errors.New("prompt template watcher store is required")

type WatcherOptions struct {
	Store              *Store
	Interval           time.Duration
	OnTemplatesUpdated func(context.Context, []Template) error
	OnParseError       func(context.Context, error) error
}

type Watcher struct {
	store              *Store
	interval           time.Duration
	onTemplatesUpdated func(context.Context, []Template) error
	onParseError       func(context.Context, error) error

	mu       sync.Mutex
	cancel   context.CancelFunc
	wg       sync.WaitGroup
	running  bool
	snapshot map[string]watchedFileState
}

type watchedFileState struct {
	ModTimeNS int64
	Size      int64
}

func NewWatcher(options WatcherOptions) (*Watcher, error) {
	if options.Store == nil {
		return nil, ErrWatcherStoreRequired
	}
	interval := options.Interval
	if interval <= 0 {
		interval = defaultWatchInterval
	}
	return &Watcher{
		store:              options.Store,
		interval:           interval,
		onTemplatesUpdated: options.OnTemplatesUpdated,
		onParseError:       options.OnParseError,
		snapshot:           map[string]watchedFileState{},
	}, nil
}

func (w *Watcher) Start(ctx context.Context) error {
	if w == nil {
		return nil
	}

	w.mu.Lock()
	defer w.mu.Unlock()
	if w.running {
		return nil
	}

	w.snapshot = w.scanFiles()
	watchCtx, cancel := context.WithCancel(ctx)
	w.cancel = cancel
	w.running = true
	w.wg.Add(1)
	go w.loop(watchCtx)
	return nil
}

func (w *Watcher) Close() error {
	if w == nil {
		return nil
	}

	w.mu.Lock()
	if !w.running {
		w.mu.Unlock()
		return nil
	}
	cancel := w.cancel
	w.cancel = nil
	w.running = false
	w.mu.Unlock()

	if cancel != nil {
		cancel()
	}
	w.wg.Wait()
	return nil
}

func (w *Watcher) SyncKnownState() error {
	if w == nil {
		return nil
	}

	w.mu.Lock()
	defer w.mu.Unlock()
	w.snapshot = w.scanFiles()
	return nil
}

func (w *Watcher) loop(ctx context.Context) {
	defer w.wg.Done()

	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			w.poll(ctx)
		}
	}
}

func (w *Watcher) poll(ctx context.Context) {
	nextSnapshot := w.scanFiles()

	w.mu.Lock()
	if reflect.DeepEqual(w.snapshot, nextSnapshot) {
		w.mu.Unlock()
		return
	}
	w.snapshot = nextSnapshot
	w.mu.Unlock()

	templates, err := w.store.List()
	if err != nil {
		if w.onParseError != nil {
			_ = w.onParseError(ctx, err)
		}
		return
	}
	if w.onTemplatesUpdated != nil {
		_ = w.onTemplatesUpdated(ctx, templates)
	}
}

func (w *Watcher) scanFiles() map[string]watchedFileState {
	paths := make(map[string]watchedFileState)
	if w == nil || w.store == nil {
		return paths
	}

	entries, err := os.ReadDir(w.store.dir)
	if err == nil {
		for _, entry := range entries {
			if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
				continue
			}
			path := filepath.Join(w.store.dir, entry.Name())
			if state, ok := scanWatchedFile(path); ok {
				paths[path] = state
			}
		}
	}

	examplePath := filepath.Join(w.store.root, "prompts.example.json")
	if state, ok := scanWatchedFile(examplePath); ok {
		paths[examplePath] = state
	}

	return paths
}

func scanWatchedFile(path string) (watchedFileState, bool) {
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return watchedFileState{}, false
	}
	return watchedFileState{
		ModTimeNS: info.ModTime().UnixNano(),
		Size:      info.Size(),
	}, true
}
