module github.com/setta/realtime/backend

go 1.26.6

require (
	github.com/coder/websocket v1.8.14
	github.com/setta/local-backend v0.0.0
)

replace github.com/setta/local-backend => ../../../packages/local-backend
