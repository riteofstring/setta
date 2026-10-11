module github.com/riteofstring/setta/apps/realtime/backend

go 1.26.9

require (
	github.com/coder/websocket v1.8.14
	github.com/riteofstring/setta/packages/local-backend v0.0.0
)

replace github.com/riteofstring/setta/packages/local-backend => ../../../packages/local-backend
