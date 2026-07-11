/* global DOMException, isSecureContext, navigator */

(() => {
  const version = "setta-microphone-permissions-driver-v1";

  function installMicrophonePermissionsDriver() {
    const driver = globalThis.__settaE2EDriver;
    if (!driver) {
      throw new Error("base Setta E2E driver is not installed");
    }
    Object.assign(driver, {
      microphonePermissionsProbe,
      microphonePermissionsVersion: version,
    });
  }

  async function microphonePermissionsProbe() {
    return {
      audio: await probeMediaPermission({ audio: true }),
      audioAndVideo: await probeMediaPermission({ audio: true, video: true }),
      isSecureContext,
      mediaDevicesAvailable: Boolean(navigator.mediaDevices?.getUserMedia),
      video: await probeMediaPermission({ video: true }),
    };
  }

  async function probeMediaPermission(constraints) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const result = {
        audioTracks: stream.getAudioTracks().length,
        granted: true,
        videoTracks: stream.getVideoTracks().length,
      };
      for (const track of stream.getTracks()) {
        track.stop();
      }
      return result;
    } catch (error) {
      return {
        errorName: error instanceof DOMException ? error.name : "non_dom_exception",
        granted: false,
      };
    }
  }

  installMicrophonePermissionsDriver();
})();
