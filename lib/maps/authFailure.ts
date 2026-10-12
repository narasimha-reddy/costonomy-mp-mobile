/**
 * Google's one global hook for "this key was refused" (`window.gm_authFailure`), shared by every map on the page.
 *
 * <p>A refused key (wrong referrer, API not enabled, billing off) draws Google's own "Something went wrong" panel and
 * calls this hook, and nothing else tells the page. Several maps can be mounted, each wanting to know, so this keeps
 * one hook that calls whatever was installed before it and then every subscriber. It re-checks on each subscribe,
 * so another file replacing the hook later does not silently drop it.
 */
type Hook = () => void;

const listeners = new Set<Hook>();
let failed = false;
let previous: Hook | undefined;

function hook(): void {
  failed = true;
  try { previous?.(); } catch { /* an older hook must not stop ours */ }
  listeners.forEach((listener) => listener());
}

function install(): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { gm_authFailure?: Hook };
  if (w.gm_authFailure === hook) return;
  previous = w.gm_authFailure;
  w.gm_authFailure = hook;
}

/** True once Google has refused the key on this page. */
export function mapsAuthFailed(): boolean {
  return failed;
}

/** Calls `listener` when Google refuses the key. Returns the unsubscribe. */
export function onMapsAuthFailure(listener: Hook): () => void {
  install();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Test seam: forget the failure and the hook. */
export function resetMapsAuthFailure(): void {
  failed = false;
  previous = undefined;
  listeners.clear();
}
