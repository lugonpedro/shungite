import { uuidv7, type DeviceInfo } from "@taskmanager/core";
import { isIOS } from "./platform";

const DEVICE_ID_KEY = "taskmanager.device.id";
const DEVICE_KIND_KEY = "taskmanager.device.kind";

function deviceName(): string {
  const agent = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(agent)) {
    return "iPhone";
  }
  if (/Macintosh/.test(agent)) {
    return "Mac";
  }
  return "Device";
}

/**
 * The device identity for Sync. The id is a stable UUID persisted in
 * localStorage so this install is always the same device. In v1 the kind
 * defaults to "satellite" and flips to "home" once this device chooses a
 * Vault (see `setDeviceHome`); the Home is fixed after that. iOS is always a
 * Satellite: its Vault copy is provisioned by the app and fed only by Sync,
 * so the iPhone never becomes the Home by accident.
 */
export function loadDeviceIdentity(): DeviceInfo {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (id === null) {
    id = uuidv7(new Date());
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  const stored = localStorage.getItem(DEVICE_KIND_KEY);
  const kind: DeviceInfo["kind"] =
    isIOS() || stored !== "home" ? "satellite" : "home";
  return { id, name: deviceName(), kind };
}

/** Marks this device as the Home; call once the user chooses a Vault here. */
export function setDeviceHome(): void {
  if (isIOS()) {
    return;
  }
  localStorage.setItem(DEVICE_KIND_KEY, "home");
}
