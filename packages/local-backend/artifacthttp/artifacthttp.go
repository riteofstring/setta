package artifacthttp

import (
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
)

type Metadata struct {
	Path       string
	MediaType  string
	ByteLength int64
}

func DownloadRequested(rawQuery string) (bool, bool) {
	if rawQuery == "" {
		return false, true
	}
	query, err := url.ParseQuery(rawQuery)
	if err != nil || len(query) != 1 {
		return false, false
	}
	values, ok := query["download"]
	valid := ok && len(values) == 1 && values[0] == "1"
	return valid, valid
}

func InlineMediaType(mediaType string) bool {
	switch mediaType {
	case "audio/aac", "audio/flac", "audio/mpeg", "audio/ogg", "audio/wav", "audio/webm",
		"image/avif", "image/gif", "image/jpeg", "image/png", "image/svg+xml", "image/webp",
		"video/mp4", "video/ogg", "video/webm":
		return true
	default:
		return false
	}
}

func Serve(response http.ResponseWriter, request *http.Request, file *os.File, metadata Metadata, download bool) error {
	info, err := file.Stat()
	if err != nil {
		return err
	}
	disposition := "inline"
	if download {
		disposition = "attachment"
	} else {
		setPreviewHeaders(response.Header())
	}
	name := filepath.Base(metadata.Path)
	response.Header().Set("Content-Type", metadata.MediaType)
	response.Header().Set("Content-Length", strconv.FormatInt(metadata.ByteLength, 10))
	response.Header().Set("Content-Disposition", mime.FormatMediaType(disposition, map[string]string{"filename": name}))
	http.ServeContent(response, request, name, info.ModTime(), file)
	return nil
}

func setPreviewHeaders(header http.Header) {
	header.Set("Content-Security-Policy", "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox")
	header.Set("Cross-Origin-Opener-Policy", "same-origin")
	header.Set("Cross-Origin-Resource-Policy", "same-origin")
	header.Set("Referrer-Policy", "no-referrer")
	header.Set("X-Frame-Options", "SAMEORIGIN")
}
