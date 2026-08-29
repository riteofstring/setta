package webapp

import (
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"
)

const shutdownTimeout = 5 * time.Second

var (
	ErrAPIHandlerRequired = errors.New("webapp: API handler is required")
	ErrWebRootRequired    = errors.New("webapp: web root is required")
	ErrListenerRequired   = errors.New("webapp: listener is required")
)

type Assets struct {
	root      string
	indexPath string
}

func Open(webRoot string) (*Assets, error) {
	if strings.TrimSpace(webRoot) == "" {
		return nil, ErrWebRootRequired
	}
	if webRoot != strings.TrimSpace(webRoot) {
		return nil, fmt.Errorf("%w: path has surrounding whitespace", ErrWebRootRequired)
	}
	absRoot, err := filepath.Abs(webRoot)
	if err != nil {
		return nil, fmt.Errorf("webapp: resolve web root: %w", err)
	}
	resolvedRoot, err := filepath.EvalSymlinks(absRoot)
	if err != nil {
		return nil, fmt.Errorf("webapp: resolve web root symlinks: %w", err)
	}
	rootInfo, err := os.Stat(resolvedRoot)
	if err != nil {
		return nil, fmt.Errorf("webapp: stat web root: %w", err)
	}
	if !rootInfo.IsDir() {
		return nil, fmt.Errorf("webapp: web root %q is not a directory", resolvedRoot)
	}
	indexPath := filepath.Join(resolvedRoot, "index.html")
	if err := requireRegularNonSymlinkFile(indexPath); err != nil {
		return nil, fmt.Errorf("webapp: production index: %w", err)
	}
	return &Assets{root: resolvedRoot, indexPath: indexPath}, nil
}

func (assets *Assets) Root() string {
	if assets == nil {
		return ""
	}
	return assets.root
}

func (assets *Assets) Handler(api http.Handler) (http.Handler, error) {
	if assets == nil || assets.root == "" || assets.indexPath == "" {
		return nil, ErrWebRootRequired
	}
	if api == nil {
		return nil, ErrAPIHandlerRequired
	}
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if isAPIPath(request.URL.Path) {
			api.ServeHTTP(response, request)
			return
		}
		assets.serve(response, request)
	}), nil
}

func isAPIPath(requestPath string) bool {
	return requestPath == "/api" || strings.HasPrefix(requestPath, "/api/")
}

func (assets *Assets) serve(response http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet && request.Method != http.MethodHead {
		response.Header().Set("Allow", "GET, HEAD")
		http.Error(response, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}
	relativePath, err := staticRelativePath(request.URL)
	if err != nil {
		http.NotFound(response, request)
		return
	}
	if relativePath == "" {
		assets.serveFile(response, request, assets.indexPath)
		return
	}

	assetPath, exists, regular := assets.assetPath(relativePath)
	if exists && regular {
		assets.serveFile(response, request, assetPath)
		return
	}
	if exists || path.Ext(relativePath) != "" {
		http.NotFound(response, request)
		return
	}

	assets.serveFile(response, request, assets.indexPath)
}

func staticRelativePath(requestURL *url.URL) (string, error) {
	if requestURL == nil {
		return "", errors.New("request URL is required")
	}
	decoded, err := decodeStaticPath(requestURL)
	if err != nil {
		return "", err
	}
	return validateStaticPathSegments(decoded)
}

func decodeStaticPath(requestURL *url.URL) (string, error) {
	escaped := escapedStaticPath(requestURL)
	decoded, err := url.PathUnescape(escaped)
	if err != nil || decoded == "" || !strings.HasPrefix(decoded, "/") {
		return "", errors.New("path is invalid")
	}
	if strings.ContainsRune(decoded, '\x00') || strings.Contains(decoded, "\\") {
		return "", errors.New("path contains an unsafe separator")
	}
	return decoded, nil
}

func escapedStaticPath(requestURL *url.URL) string {
	escaped := requestURL.EscapedPath()
	if escaped == "" {
		return requestURL.Path
	}
	return escaped
}

func validateStaticPathSegments(decoded string) (string, error) {
	parts := strings.Split(strings.TrimPrefix(decoded, "/"), "/")
	if len(parts) == 1 && parts[0] == "" {
		return "", nil
	}
	for _, part := range parts {
		if part == "" || part == "." || part == ".." {
			return "", errors.New("path contains an unsafe segment")
		}
	}
	relative := strings.Join(parts, "/")
	if !fs.ValidPath(relative) {
		return "", errors.New("path is not a valid asset path")
	}
	return relative, nil
}

func (assets *Assets) assetPath(relative string) (string, bool, bool) {
	if assets == nil || assets.root == "" || relative == "" {
		return "", false, false
	}
	return assets.resolveAssetPath(strings.Split(relative, "/"))
}

func (assets *Assets) resolveAssetPath(parts []string) (string, bool, bool) {
	current := assets.root
	for index, part := range parts {
		next, info, exists, safe := assets.inspectAssetPart(current, part)
		if !exists || !safe {
			return "", exists, false
		}
		if index < len(parts)-1 {
			if !info.IsDir() {
				return "", true, false
			}
			current = next
			continue
		}
		return next, true, info.Mode().IsRegular()
	}
	return "", false, false
}

func (assets *Assets) inspectAssetPart(current string, part string) (string, fs.FileInfo, bool, bool) {
	next := filepath.Join(current, filepath.FromSlash(part))
	if !assets.contains(next) {
		return "", nil, true, false
	}
	info, err := os.Lstat(next)
	if errors.Is(err, os.ErrNotExist) {
		return "", nil, false, false
	}
	if err != nil || info.Mode()&os.ModeSymlink != 0 {
		return "", nil, true, false
	}
	return next, info, true, true
}

func (assets *Assets) contains(candidate string) bool {
	relative, err := filepath.Rel(assets.root, candidate)
	if err != nil {
		return false
	}
	if relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return false
	}
	return !filepath.IsAbs(relative)
}

func (assets *Assets) serveFile(response http.ResponseWriter, request *http.Request, assetPath string) {
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

func requireRegularNonSymlinkFile(filePath string) error {
	info, err := os.Lstat(filePath)
	if err != nil {
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
		return errors.New("must be a regular non-symlink file")
	}
	return nil
}

func LoopbackURL(listener net.Listener) (string, error) {
	authority, err := loopbackAuthority(listener)
	if err != nil {
		return "", err
	}
	return "http://" + authority, nil
}

func loopbackAuthority(listener net.Listener) (string, error) {
	if listener == nil {
		return "", ErrListenerRequired
	}
	address, ok := listener.Addr().(*net.TCPAddr)
	if !ok || address == nil || !address.IP.Equal(net.ParseIP("127.0.0.1")) || address.Port < 1 || address.Port > 65535 {
		return "", fmt.Errorf("webapp: listener is not an IPv4 loopback listener")
	}
	return fmt.Sprintf("127.0.0.1:%d", address.Port), nil
}

func requireLoopbackAuthority(authority string, handler http.Handler) http.Handler {
	allowed := map[string]struct{}{
		authority: {},
	}
	_, port, err := net.SplitHostPort(authority)
	if err == nil {

		allowed[net.JoinHostPort("localhost", port)] = struct{}{}
	}
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {

		if request == nil {
			response.Header().Set("Cache-Control", "no-store")
			http.Error(response, "Misdirected Request", http.StatusMisdirectedRequest)
			return
		}
		if _, ok := allowed[request.Host]; !ok {
			response.Header().Set("Cache-Control", "no-store")
			http.Error(response, "Misdirected Request", http.StatusMisdirectedRequest)
			return
		}
		handler.ServeHTTP(response, request)
	})
}

func Serve(ctx context.Context, listener net.Listener, handler http.Handler, ready func() error) error {
	ctx, authority, err := prepareWebAppServe(ctx, listener, handler)
	if err != nil {
		return err
	}
	server, serveResult := startWebAppServer(authority, listener, handler)
	if serveErr, stopped := initialWebAppServeResult(serveResult); stopped {
		return serveErr
	}
	if err := invokeWebAppReady(ready, server, serveResult); err != nil {
		return err
	}
	return waitForWebAppServer(ctx, server, serveResult)
}

func prepareWebAppServe(ctx context.Context, listener net.Listener, handler http.Handler) (context.Context, string, error) {
	if listener == nil {
		return nil, "", ErrListenerRequired
	}
	if handler == nil {
		_ = listener.Close()
		return nil, "", ErrAPIHandlerRequired
	}
	authority, err := loopbackAuthority(listener)
	if err != nil {
		_ = listener.Close()
		return nil, "", err
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		_ = listener.Close()
		return nil, "", err
	}
	return ctx, authority, nil
}

func startWebAppServer(authority string, listener net.Listener, handler http.Handler) (*http.Server, <-chan error) {
	server := &http.Server{Handler: requireLoopbackAuthority(authority, handler), ReadHeaderTimeout: 5 * time.Second}
	serveResult := make(chan error, 1)
	go func() { serveResult <- server.Serve(listener) }()
	return server, serveResult
}

func initialWebAppServeResult(serveResult <-chan error) (error, bool) {
	select {
	case err := <-serveResult:
		return normalizeServeError(err), true
	default:
		return nil, false
	}
}

func invokeWebAppReady(ready func() error, server *http.Server, serveResult <-chan error) error {
	if ready != nil {
		if err := ready(); err != nil {
			return shutdownAfterReadyFailure(server, serveResult, err)
		}
	}
	return nil
}

func waitForWebAppServer(ctx context.Context, server *http.Server, serveResult <-chan error) error {
	select {
	case err := <-serveResult:
		return normalizeServeError(err)
	case <-ctx.Done():
		return shutdownAfterContextCancellation(server, serveResult)
	}
}

func shutdownAfterContextCancellation(server *http.Server, serveResult <-chan error) error {
	shutdownContext, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	shutdownErr := server.Shutdown(shutdownContext)
	serveErr := <-serveResult
	if shutdownErr != nil {
		return errors.Join(fmt.Errorf("webapp: shutdown server: %w", shutdownErr), normalizeServeError(serveErr))
	}
	return normalizeServeError(serveErr)
}

func shutdownAfterReadyFailure(server *http.Server, serveResult <-chan error, readyErr error) error {
	shutdownContext, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	shutdownErr := server.Shutdown(shutdownContext)
	serveErr := <-serveResult
	return errors.Join(readyErr, errorOrNil(shutdownErr, "webapp: shutdown after readiness failure"), normalizeServeError(serveErr))
}

func normalizeServeError(err error) error {
	if err == nil || errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}

func errorOrNil(err error, prefix string) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("%s: %w", prefix, err)
}

var _ io.ReadSeeker = (*os.File)(nil)
