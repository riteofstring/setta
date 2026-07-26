package webapp

import (
	"embed"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strings"

	"setta/internal/httpapi"
)

//go:embed static
var staticFiles embed.FS

type Handler struct {
	api    http.Handler
	static http.FileSystem
}

func NewHandler(api http.Handler) http.Handler {
	static, err := fs.Sub(staticFiles, "static")
	if err != nil {
		panic(err)
	}
	return Handler{
		api:    api,
		static: http.FS(static),
	}
}

func (handler Handler) ServeHTTP(response http.ResponseWriter, request *http.Request) {
	if httpapi.IsAPINamespace(request.URL.Path) {
		handler.api.ServeHTTP(response, request)
		return
	}
	if request.Method != http.MethodGet && request.Method != http.MethodHead {
		http.NotFound(response, request)
		return
	}
	if handler.serveStaticPath(response, request, request.URL.Path) {
		return
	}
	if path.Ext(request.URL.Path) != "" {
		http.NotFound(response, request)
		return
	}
	handler.serveStaticPath(response, request, "/index.html")
}

func (handler Handler) serveStaticPath(
	response http.ResponseWriter,
	request *http.Request,
	rawPath string,
) bool {
	name := strings.TrimPrefix(path.Clean("/"+rawPath), "/")
	if name == "." || name == "" {
		name = "index.html"
	}
	file, err := handler.static.Open(name)
	if err != nil {
		return false
	}
	defer file.Close()
	stat, err := file.Stat()
	if err != nil || stat.IsDir() {
		return false
	}
	if contentType := staticContentType(name); contentType != "" {
		response.Header().Set("Content-Type", contentType)
	}
	http.ServeContent(response, request, name, stat.ModTime(), file)
	return true
}

func staticContentType(name string) string {
	if path.Ext(name) == ".webmanifest" {
		return "application/manifest+json"
	}
	return mime.TypeByExtension(path.Ext(name))
}
