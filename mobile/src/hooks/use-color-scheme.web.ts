import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

const noopSubscribe = () => () => {};

/**
 * Web only. Static rendering has no color scheme, so render light on the server
 * and switch to the real scheme once hydrated on the client.
 */
export function useColorScheme() {
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const colorScheme = useRNColorScheme();
  return hydrated ? colorScheme : 'light';
}
