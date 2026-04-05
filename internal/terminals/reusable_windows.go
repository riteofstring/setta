//go:build windows

package terminals

func sessionIsReusable(session *session) (bool, error) {
	return false, nil
}
