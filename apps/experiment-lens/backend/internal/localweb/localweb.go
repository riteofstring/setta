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
	root string
}

func OpenAssets(webRoot string) (*Assets, error) {
	if strings.TrimSpace(webRoot) == "" || webRoot != strings.TrimSpace(webRoot) || strings.ContainsRune(webRoot, '\x00') {
		return nil, errors.New("localweb: web root is invalid")
	}
	absolute, err := filepath.Abs(webRoot)
	if err != nil {
		return nil, fmt.Errorf("localweb: resolve web root: %w", err)
	}
	resolved, err := filepath.EvalSymlinks(absolute)
	if err != nil {
		return nil, fmt.Errorf("localweb: resolve web root links: %w", err)
	}
	info, err := os.Stat(resolved)
	if err != nil || !info.IsDir() {
		return nil, errors.New("localweb: web root is not a directory")
	}
	if err := preflightAssets(resolved); err != nil {
		return nil, err
	}
	if err := requireRegular(filepath.Join(resolved, "index.html")); err != nil {
		return nil, fmt.Errorf("localweb: production index: %w", err)
	}
	return &Assets{root: resolved}, nil
}

func (assets *Assets) Handler(api http.Handler) (http.Handler, error) {
	if assets == nil || assets.root == "" || api == nil {
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
		strings.ToLower(authority): {}, strings.ToLower(net.JoinHostPort("localhost", port)): {},
	}
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		response.Header().Set("Cache-Control", "no-store")
		response.Header().Set("Referrer-Policy", "no-referrer")
		response.Header().Set("X-Content-Type-Options", "nosniff")
		response.Header().Set("X-Frame-Options", "DENY")
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
	originScheme, originHost, originPort, err := originAuthority(request.Header.Get("Origin"))
	if err != nil {
		return false
	}
	serverScheme, serverHost, serverPort, err := originAuthority(serverURL)
	if err != nil || serverScheme != "http" || serverHost != "127.0.0.1" {
		return false
	}
	return originScheme == serverScheme && originPort == serverPort && (originHost == serverHost || originHost == "localhost")
}

func Serve(ctx context.Context, listener net.Listener, handler http.Handler) error {
	if ctx == nil || listener == nil || handler == nil {
		return errors.New("localweb: context, listener, and handler are required")
	}
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
		shutdown, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		shutdownErr := server.Shutdown(shutdown)
		serveErr := <-done
		if serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
			return serveErr
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
		relative = "index.html"
	}
	file, info, exists := assets.openFile(relative)
	if file == nil && !exists && path.Ext(relative) == "" {
		file, info, _ = assets.openFile("index.html")
		relative = "index.html"
	}
	if file == nil {
		http.NotFound(response, request)
		return
	}
	defer file.Close()
	if contentType := mime.TypeByExtension(filepath.Ext(relative)); contentType != "" {
		response.Header().Set("Content-Type", contentType)
	}
	response.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(response, request, path.Base(relative), info.ModTime(), file)
}

func (assets *Assets) openFile(relative string) (*os.File, fs.FileInfo, bool) {
	root, err := os.OpenRoot(assets.root)
	if err != nil {
		return nil, nil, true
	}
	defer root.Close()
	assetPath := filepath.FromSlash(relative)
	linkInfo, err := root.Lstat(assetPath)
	if err != nil {
		return nil, nil, !errors.Is(err, fs.ErrNotExist)
	}
	if linkInfo.Mode()&os.ModeSymlink != 0 || !linkInfo.Mode().IsRegular() {
		return nil, nil, true
	}
	file, err := root.Open(assetPath)
	if err != nil {
		return nil, nil, true
	}
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() || !os.SameFile(linkInfo, info) {
		file.Close()
		return nil, nil, true
	}
	return file, info, true
}

func listenerAuthority(listener net.Listener) (string, error) {
	address, ok := listener.Addr().(*net.TCPAddr)
	if !ok || address.IP == nil || !address.IP.Equal(net.ParseIP("127.0.0.1")) || address.Port < 1 || address.Port > 65535 {
		return "", errors.New("localweb: listener is not IPv4 loopback")
	}
	return net.JoinHostPort("127.0.0.1", strconv.Itoa(address.Port)), nil
}

func originAuthority(value string) (string, string, string, error) {
	parsed, err := url.Parse(value)
	if err != nil || value == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.Path != "" {
		return "", "", "", errors.New("localweb: origin is invalid")
	}
	host, port, err := net.SplitHostPort(parsed.Host)
	return parsed.Scheme, strings.ToLower(host), port, err
}

func preflightAssets(root string) error {
	return filepath.WalkDir(root, func(candidate string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if candidate == root || entry.IsDir() {
			return nil
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("localweb: asset %q is a symlink", candidate)
		}
		info, err := entry.Info()
		if err != nil || !info.Mode().IsRegular() {
			return fmt.Errorf("localweb: asset %q is not a regular file", candidate)
		}
		return nil
	})
}

func requireRegular(filePath string) error {
	info, err := os.Lstat(filePath)
	if err != nil {
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
		return errors.New("file is not regular")
	}
	return nil
}

func staticRelativePath(requestURL *url.URL) (string, error) {
	if requestURL == nil {
		return "", errors.New("localweb: URL is required")
	}
	escaped := requestURL.EscapedPath()
	if escaped == "" {
		escaped = requestURL.Path
	}
	decoded, err := url.PathUnescape(escaped)
	if err != nil || decoded == "" || !strings.HasPrefix(decoded, "/") || strings.ContainsRune(decoded, '\x00') || strings.Contains(decoded, "\\") {
		return "", errors.New("localweb: asset path is invalid")
	}
	parts := strings.Split(strings.TrimPrefix(decoded, "/"), "/")
	if len(parts) == 1 && parts[0] == "" {
		return "", nil
	}
	for _, part := range parts {
		if part == "" || part == "." || part == ".." {
			return "", errors.New("localweb: asset path segment is invalid")
		}
	}
	relative := strings.Join(parts, "/")
	if !fs.ValidPath(relative) {
		return "", errors.New("localweb: asset path is invalid")
	}
	return relative, nil
}
