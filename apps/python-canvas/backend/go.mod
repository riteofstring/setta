module github.com/setta/python-canvas/backend

go 1.26.6

require (
	github.com/coder/websocket v1.8.14
	github.com/creack/pty v1.1.21
	github.com/setta/local-backend v0.0.0
	github.com/tree-sitter/go-tree-sitter v0.25.0
	github.com/tree-sitter/tree-sitter-python v0.25.0
	golang.org/x/sys v0.44.0
)

require github.com/mattn/go-pointer v0.0.1 // indirect

replace github.com/setta/local-backend => ../../../packages/local-backend
