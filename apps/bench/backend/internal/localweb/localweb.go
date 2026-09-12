package localweb

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const shutdownTimeout = 5 * time.Second

type Assets struct {
	root      string
	indexPath string
}

func OpenAssets(webRoot string) (*Assets, error) {
	if strings.TrimSpace(webRoot) == "" || webRoot != strings.TrimSpace(webRoot) || strings.ContainsRune(webRoot, '\x00') {
		return nil, errors.New("localweb: web root is invalid")
	}
	absolute, err := filepath.Abs(webRoot)
	if err != nil {
		return nil, err
	}
	resolved, err := filepath.EvalSymlinks(absolute)
	if err != nil {
		return nil, fmt.Errorf("localweb: resolve web root: %w", err)
	}
	if err := preflightAssets(resolved); err != nil {
		return nil, err
	}
	indexPath := filepath.Join(resolved, "index.html")
	if err := requireRegular(indexPath); err != nil {
		return nil, fmt.Errorf("localweb: index is unavailable: %w", err)
	}
	return &Assets{root: resolved, indexPath: indexPath}, nil
}

func (assets *Assets) Handler(api http.Handler) (http.Handler, error) {
	if assets == nil || api == nil {
		return nil, errors.New("localweb: assets and API handler are required")
	}
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path == "/api" || strings.HasPrefix(request.URL.Path, "/api/") {
			api.ServeHTTP(response, request)
			return
		}
		assets.serve(response, request)
	}), nil
}

func Listen(port uint16) (net.Listener, error) {
	listener, err := net.Listen("tcp4", net.JoinHostPort("127.0.0.1", strconv.Itoa(int(port))))
	if err != nil {
		return nil, fmt.Errorf("localweb: listen: %w", err)
	}
	return listener, nil
}

func URL(listener net.Listener) (string, error) {
	authority, err := listenerAuthority(listener)
	if err != nil {
		return "", err
	}
	return "http://" + authority, nil
}

func SecureHandler(listener net.Listener, next http.Handler) (http.Handler, error) {
	if next == nil {
		return nil, errors.New("localweb: handler is required")
	}
	authority, err := listenerAuthority(listener)
	if err != nil {
		return nil, err
	}
	_, port, err := net.SplitHostPort(authority)
	if err != nil {
		return nil, err
	}
	allowed := map[string]struct{}{
		strings.ToLower(authority):                           {},
		strings.ToLower(net.JoinHostPort("localhost", port)): {},
	}
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if _, exists := allowed[strings.ToLower(request.Host)]; !exists {
			http.Error(response, "Forbidden", http.StatusForbidden)
			return
		}
		next.ServeHTTP(response, request)
	}), nil
}

func OriginAllowed(request *http.Request, serverURL string) bool {
	if request == nil {
		return false
	}
	origin, err := parseOrigin(request.Header.Get("Origin"))
	if err != nil {
		return false
	}
	server, err := parseOrigin(serverURL)
	if err != nil {
		return false
	}
	originHost, originPort, err := net.SplitHostPort(origin.Host)
	if err != nil {
		return false
	}
	serverHost, serverPort, err := net.SplitHostPort(server.Host)
	if err != nil {
		return false
	}
	hostAllowed := strings.EqualFold(originHost, serverHost) || strings.EqualFold(serverHost, "127.0.0.1") && strings.EqualFold(originHost, "localhost")
	return origin.Scheme == server.Scheme && originPort == serverPort && hostAllowed
}

func Serve(ctx context.Context, listener net.Listener, handler http.Handler) error {
	server := &http.Server{Handler: handler, ReadHeaderTimeout: 5 * time.Second}
	done := make(chan error, 1)
	go func() { done <- server.Serve(listener) }()
	select {
	case err := <-done:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		shutdownContext, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		shutdownErr := server.Shutdown(shutdownContext)
		serveErr := <-done
		if serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
			return errors.Join(shutdownErr, serveErr)
		}
		return shutdownErr
	}
}

func (assets *Assets) serve(response http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet && request.Method != http.MethodHead {
		response.Header().Set("Allow", "GET, HEAD")
		http.Error(response, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}
	relative, err := staticRelativePath(request.URL)
	if err != nil {
		http.NotFound(response, request)
		return
	}
	if relative == "" {
		assets.serveFile(response, request, assets.indexPath)
		return
	}
	candidate := filepath.Join(assets.root, filepath.FromSlash(relative))
	if requireRegular(candidate) == nil && assets.contains(candidate) {
		assets.serveFile(response, request, candidate)
		return
	}
	if path.Ext(relative) != "" {
		http.NotFound(response, request)
		return
	}
	assets.serveFile(response, request, assets.indexPath)
}

func (assets *Assets) serveFile(response http.ResponseWriter, request *http.Request, candidate string) {
	if !assets.contains(candidate) || requireRegular(candidate) != nil {
		http.NotFound(response, request)
		return
	}
	file, err := os.Open(candidate)
	if err != nil {
		http.NotFound(response, request)
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() {
		http.NotFound(response, request)
		return
	}
	if contentType := mime.TypeByExtension(filepath.Ext(candidate)); contentType != "" {
		response.Header().Set("Content-Type", contentType)
	}
	response.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(response, request, filepath.Base(candidate), info.ModTime(), file)
}

func (assets *Assets) contains(candidate string) bool {
	relative, err := filepath.Rel(assets.root, candidate)
	return err == nil && !filepath.IsAbs(relative) && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator))
}

func staticRelativePath(value *url.URL) (string, error) {
	if value == nil || value.RawQuery != "" || value.Fragment != "" || value.RawPath != "" {
		return "", errors.New("localweb: asset URL is invalid")
	}
	cleaned := path.Clean("/" + value.Path)
	if strings.Contains(value.Path, "\\") || strings.ContainsRune(value.Path, '\x00') {
		return "", errors.New("localweb: asset path is invalid")
	}
	return strings.TrimPrefix(cleaned, "/"), nil
}

func listenerAuthority(listener net.Listener) (string, error) {
	address, ok := listener.Addr().(*net.TCPAddr)
	if !ok || address.IP == nil || !address.IP.Equal(net.ParseIP("127.0.0.1")) || address.Port < 1 || address.Port > 65535 {
		return "", errors.New("localweb: listener is not IPv4 loopback")
	}
	return net.JoinHostPort("127.0.0.1", strconv.Itoa(address.Port)), nil
}

func parseOrigin(value string) (*url.URL, error) {
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme != "http" || parsed.User != nil || parsed.Host == "" || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
		return nil, errors.New("localweb: origin is invalid")
	}
	return parsed, nil
}

func preflightAssets(root string) error {
	return filepath.WalkDir(root, func(candidate string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("localweb: asset %q is a symbolic link", candidate)
		}
		if entry.IsDir() {
			return nil
		}
		info, err := entry.Info()
		if err != nil || !info.Mode().IsRegular() {
			return fmt.Errorf("localweb: asset %q is not a regular file", candidate)
		}
		return nil
	})
}

func requireRegular(candidate string) error {
	entry, err := os.Lstat(candidate)
	if err != nil {
		return err
	}
	if entry.Mode()&os.ModeSymlink != 0 || !entry.Mode().IsRegular() {
		return errors.New("path is not a regular file")
	}
	return nil
}
