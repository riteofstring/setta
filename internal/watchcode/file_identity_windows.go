//go:build windows

package watchcode

import (
	"fmt"
	"os"

	"golang.org/x/sys/windows"
)

func fileIdentityKey(path string, _ os.FileInfo) (string, error) {
	utf16Path, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return "", err
	}

	handle, err := windows.CreateFile(
		utf16Path,
		windows.FILE_READ_ATTRIBUTES,
		windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE,
		nil,
		windows.OPEN_EXISTING,
		windows.FILE_ATTRIBUTE_NORMAL,
		0,
	)
	if err != nil {
		return "", err
	}
	defer windows.CloseHandle(handle)

	var info windows.ByHandleFileInformation
	if err := windows.GetFileInformationByHandle(handle, &info); err != nil {
		return "", err
	}
	return fmt.Sprintf("%d:%d:%d", info.VolumeSerialNumber, info.FileIndexHigh, info.FileIndexLow), nil
}
