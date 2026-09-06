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
	indexPath := filepath.Join(resolved, "index.html")
	if err := requireRegular(indexPath); err != nil {
		return nil, fmt.Errorf("localweb: production index: %w", err)
	}
	return &Assets{root: resolved, indexPath: indexPath}, nil
}

func (assets *Assets) Handler(api http.Handler) (http.Handler, error) {
	if assets == nil || assets.root == "" || assets.indexPath == "" {
		return nil, errors.New("localweb: assets are required")
	}
	if api == nil {
		return nil, errors.New("localweb: API handler is required")
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
	address, err := authority(listener)
	if err != nil {
		return "", err
	}
	return "http://" + address, nil
}

func SecureHandler(listener net.Listener, next http.Handler) (http.Handler, error) {
	if next == nil {
		return nil, errors.New("localweb: handler is required")
	}
	listenerAuthority, err := authority(listener)
	if err != nil {
		return nil, err
	}
	_, port, err := net.SplitHostPort(listenerAuthority)
	if err != nil {
		return nil, fmt.Errorf("localweb: listener authority: %w", err)
	}
	allowed := map[string]struct{}{
		strings.ToLower(listenerAuthority):                   {},
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
	origin := request.Header.Get("Origin")
	if origin == "" {
		return false
	}
	parsedOrigin, err := url.Parse(origin)
	if err != nil || parsedOrigin.User != nil || parsedOrigin.RawQuery != "" || parsedOrigin.Fragment != "" || parsedOrigin.Path != "" {
		return false
	}
	parsedServer, err := url.Parse(serverURL)
	if err != nil {
		return false
	}
	if parsedOrigin.Scheme != parsedServer.Scheme {
		return false
	}
	originHost, originPort, err := net.SplitHostPort(parsedOrigin.Host)
	if err != nil {
		return false
	}
	serverHost, serverPort, err := net.SplitHostPort(parsedServer.Host)
	if err != nil || originPort != serverPort {
		return false
	}
	originHost = strings.ToLower(originHost)
	serverHost = strings.ToLower(serverHost)
	return originHost == serverHost || serverHost == "127.0.0.1" && originHost == "localhost"
}

func Serve(ctx context.Context, listener net.Listener, handler http.Handler) error {
	if listener == nil || handler == nil {
		return errors.New("localweb: listener and handler are required")
	}
	server := &http.Server{Handler: handler, ReadHeaderTimeout: 5 * time.Second}
	done := make(chan error, 1)
	go func() {
		done <- server.Serve(listener)
	}()
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
		assets.serveFile(response, request, assets.indexPath)
		return
	}
	assetPath := filepath.Join(assets.root, filepath.FromSlash(relative))
	info, err := os.Lstat(assetPath)
	if err == nil && info.Mode().IsRegular() && info.Mode()&os.ModeSymlink == 0 && assets.contains(assetPath) {
		assets.serveFile(response, request, assetPath)
		return
	}
	if err == nil || path.Ext(relative) != "" {
		http.NotFound(response, request)
		return
	}
	assets.serveFile(response, request, assets.indexPath)
}

func (assets *Assets) serveFile(response http.ResponseWriter, request *http.Request, assetPath string) {
	if !assets.contains(assetPath) || requireRegular(assetPath) != nil {
		http.NotFound(response, request)
		return
	}
	file, err := os.Open(assetPath)
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
	if contentType := mime.TypeByExtension(filepath.Ext(assetPath)); contentType != "" {
		response.Header().Set("Content-Type", contentType)
	}
	response.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(response, request, filepath.Base(assetPath), info.ModTime(), file)
}

func (assets *Assets) contains(candidate string) bool {
	relative, err := filepath.Rel(assets.root, candidate)
	return err == nil && !filepath.IsAbs(relative) && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator))
}

func authority(listener net.Listener) (string, error) {
	if listener == nil {
		return "", errors.New("localweb: listener is required")
	}
	address, ok := listener.Addr().(*net.TCPAddr)
	if !ok || address.IP == nil || !address.IP.Equal(net.ParseIP("127.0.0.1")) || address.Port < 1 || address.Port > 65535 {
		return "", errors.New("localweb: listener is not IPv4 loopback")
	}
	return net.JoinHostPort("127.0.0.1", strconv.Itoa(address.Port)), nil
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
