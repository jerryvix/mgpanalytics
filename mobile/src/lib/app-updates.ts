/**
 * New app updates show on the first open (D-108). Left alone, expo-updates downloads an update
 * at launch and applies it only on the launch after that, so a change took two restarts to
 * appear. Here an update that finishes downloading in the first seconds after you open the app
 * reloads it right away, before there's anything on screen to lose. Coming back after a minute
 * or more away counts as opening again: the app checks, and a quick update applies the same way.
 * One that lands later, while you're using the app, waits for your next return.
 */
import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

const FRESH_MS = 10_000; // this soon after opening, a reload costs nothing
const AWAY_MS = 60_000; // back after this long counts as opening again

const ON = !__DEV__ && Platform.OS !== 'web' && Updates.isEnabled;

// One root layout uses this, so plain module state is enough (a reload starts it over)
let openedAt = Date.now();
let awaySince: number | null = null;
let pending = false;
let busy = false;
let reloadedFor: string | null = null;

function reloadOnce(id: string) {
  if (reloadedFor === id) return;
  reloadedFor = id;
  Updates.reloadAsync().catch(() => undefined);
}

export function useAppUpdates() {
  const { isUpdatePending, downloadedUpdate, isChecking, isDownloading } = Updates.useUpdates();
  const pendingId = downloadedUpdate?.updateId ?? 'rollback';

  // An update finished downloading: apply it if you've only just opened the app
  useEffect(() => {
    pending = isUpdatePending;
    if (!ON || !isUpdatePending) return;
    if (AppState.currentState === 'active' && Date.now() - openedAt < FRESH_MS) reloadOnce(pendingId);
  }, [isUpdatePending, pendingId]);

  useEffect(() => {
    busy = isChecking || isDownloading;
  }, [isChecking, isDownloading]);

  // Back after a minute away: apply a waiting update, or check for a new one
  useEffect(() => {
    if (!ON) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        awaySince ??= Date.now();
        return;
      }
      if (state !== 'active' || awaySince === null) return;
      const away = Date.now() - awaySince;
      awaySince = null;
      if (away < AWAY_MS) return;
      openedAt = Date.now();
      if (pending) {
        reloadOnce(pendingId);
        return;
      }
      if (busy) return;
      Updates.checkForUpdateAsync()
        .then((r) => (r.isAvailable ? Updates.fetchUpdateAsync() : null))
        .catch(() => null);
    });
    return () => sub.remove();
  }, [pendingId]);
}
