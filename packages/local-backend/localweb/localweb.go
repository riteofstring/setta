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

const (
	shutdownTimeout = 5 * time.Second
	stopWaitTimeout = time.Second
)

type Assets struct {
	root     string
	rootInfo fs.FileInfo
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
	info, err := os.Lstat(resolved)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return nil, errors.New("localweb: web root is not a directory")
	}
	if err := preflightAssets(resolved); err != nil {
		return nil, err
	}
	if err := requireRegular(filepath.Join(resolved, "index.html")); err != nil {
		return nil, fmt.Errorf("localweb: production index: %w", err)
	}
	return &Assets{root: resolved, rootInfo: info}, nil
}

func (assets *Assets) Handler(api http.Handler) (http.Handler, error) {
	if assets == nil || assets.root == "" || assets.rootInfo == nil {
		return nil, errors.New("localweb: assets are required")
	}
	if api == nil {
		return nil, errors.New("localweb: API handler is required")
	}
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request != nil && isAPIPath(request.URL.Path) {
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
		return nil, fmt.Errorf("localweb: listener authority: %w", err)
	}
	allowed := map[string]struct{}{
		strings.ToLower(authority):                           {},
		strings.ToLower(net.JoinHostPort("localhost", port)): {},
	}
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		setSecurityHeaders(response.Header())
		if request == nil {
			http.Error(response, "Forbidden", http.StatusForbidden)
			return
		}
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
	return serve(ctx, listener, handler, nil)
}

func ServeReady(ctx context.Context, listener net.Listener, handler http.Handler, ready func() error) error {
	return serve(ctx, listener, handler, ready)
}

func serve(ctx context.Context, listener net.Listener, handler http.Handler, ready func() error) error {
	if ctx == nil || listener == nil || handler == nil {
		return errors.New("localweb: context, listener, and handler are required")
	}
	server := &http.Server{Handler: handler, ReadHeaderTimeout: 5 * time.Second}
	done := make(chan error, 1)
	go func() { done <- server.Serve(listener) }()
	select {
	case err := <-done:
		return normalizeServeError(err)
	default:
	}
	if ready != nil {
		if err := ready(); err != nil {
			return errors.Join(err, stopServer(server, done))
		}
	}
	select {
	case err := <-done:
		return normalizeServeError(err)
	case <-ctx.Done():
		return stopServer(server, done)
	}
}

func stopServer(server *http.Server, done <-chan error) error {
	shutdownContext, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	shutdownErr := server.Shutdown(shutdownContext)
	cancel()
	var closeErr error
	if shutdownErr != nil {
		closeErr = server.Close()
	}
	timer := time.NewTimer(stopWaitTimeout)
	defer timer.Stop()
	select {
	case serveErr := <-done:
		return errors.Join(shutdownErr, closeErr, normalizeServeError(serveErr))
	case <-timer.C:
		return errors.Join(shutdownErr, closeErr, errors.New("localweb: server did not stop"))
	}
}

func normalizeServeError(err error) error {
	if err == nil || errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}

func setSecurityHeaders(header http.Header) {
	header.Set("Cache-Control", "no-store")
	header.Set("Referrer-Policy", "no-referrer")
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("X-Frame-Options", "DENY")
}

func isAPIPath(requestPath string) bool {
	return requestPath == "/api" || strings.HasPrefix(requestPath, "/api/")
}

func (assets *Assets) serve(response http.ResponseWriter, request *http.Request) {
	if request == nil || request.URL == nil {
		http.NotFound(response, request)
		return
	}
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
		assets.serveFile(response, request, "index.html")
		return
	}
	file, info, exists := assets.openFile(relative)
	if file != nil {
		assets.serveOpenedFile(response, request, relative, file, info)
		return
	}
	if exists || path.Ext(relative) != "" {
		http.NotFound(response, request)
		return
	}
	assets.serveFile(response, request, "index.html")
}

func (assets *Assets) serveFile(response http.ResponseWriter, request *http.Request, relative string) {
	file, info, _ := assets.openFile(relative)
	if file == nil {
		http.NotFound(response, request)
		return
	}
	assets.serveOpenedFile(response, request, relative, file, info)
}

func (assets *Assets) serveOpenedFile(response http.ResponseWriter, request *http.Request, relative string, file *os.File, info fs.FileInfo) {
	defer file.Close()
	if contentType := mime.TypeByExtension(filepath.Ext(relative)); contentType != "" {
		response.Header().Set("Content-Type", contentType)
	}
	response.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(response, request, path.Base(relative), info.ModTime(), file)
}

func (assets *Assets) openFile(relative string) (*os.File, fs.FileInfo, bool) {
	if !assets.hasAdmittedRoot() {
		return nil, nil, true
	}
	root, err := os.OpenRoot(assets.root)
	if err != nil {
		return nil, nil, true
	}
	defer root.Close()
	return openRegularFile(root, filepath.FromSlash(relative))
}

func (assets *Assets) hasAdmittedRoot() bool {
	rootInfo, err := os.Lstat(assets.root)
	return err == nil && rootInfo.IsDir() && rootInfo.Mode()&os.ModeSymlink == 0 && os.SameFile(assets.rootInfo, rootInfo)
}

func openRegularFile(root *os.Root, assetPath string) (*os.File, fs.FileInfo, bool) {
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
	if listener == nil {
		return "", errors.New("localweb: listener is required")
	}
	address, ok := listener.Addr().(*net.TCPAddr)
	if !ok || address == nil || address.IP == nil || !address.IP.Equal(net.ParseIP("127.0.0.1")) || address.Port < 1 || address.Port > 65535 {
		return "", errors.New("localweb: listener is not IPv4 loopback")
	}
	return net.JoinHostPort("127.0.0.1", strconv.Itoa(address.Port)), nil
}

func originAuthority(value string) (string, string, string, error) {
	if value == "" {
		return "", "", "", errors.New("localweb: origin is required")
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.Path != "" || parsed.RawPath != "" || parsed.ForceQuery {
		return "", "", "", errors.New("localweb: origin is invalid")
	}
	host, port, err := net.SplitHostPort(parsed.Host)
	if err != nil {
		return "", "", "", err
	}
	return strings.ToLower(parsed.Scheme), strings.ToLower(host), port, nil
}

func preflightAssets(root string) error {
	return filepath.WalkDir(root, func(candidate string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return fmt.Errorf("localweb: inspect assets: %w", walkErr)
		}
		if candidate == root {
			return nil
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("localweb: asset %q is a symlink", candidate)
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
	decoded, err := decodedAssetPath(requestURL)
	if err != nil {
		return "", err
	}
	return validatedAssetPath(decoded)
}

func decodedAssetPath(requestURL *url.URL) (string, error) {
	escaped := requestURL.EscapedPath()
	if escaped == "" {
		escaped = requestURL.Path
	}
	decoded, err := url.PathUnescape(escaped)
	if err != nil || decoded == "" || !strings.HasPrefix(decoded, "/") || strings.ContainsRune(decoded, '\x00') || strings.Contains(decoded, "\\") {
		return "", errors.New("localweb: asset path is invalid")
	}
	return decoded, nil
}

func validatedAssetPath(decoded string) (string, error) {
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
