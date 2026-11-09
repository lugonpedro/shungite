const IOS_USER_AGENT = /iPhone|iPad|iPod/;

/**
 * True when the app is running inside the iOS WebView. iOS builds run in the
 * simulator or on a device where the Vault lives in the app sandbox and the
 * device can only ever be a Satellite (see #5 and the v1 Sync spec).
 */
export function isIOS(): boolean {
  return IOS_USER_AGENT.test(navigator.userAgent);
}
