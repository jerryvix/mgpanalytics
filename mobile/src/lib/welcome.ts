/**
 * First-launch welcome (O6): shown once, before anything else, until you confirm you're 18 or
 * older. The root layout reads the flag before the splash screen hides, so the tabs never
 * flash first; the welcome screen calls `accept` to move on.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext } from 'react';

const WELCOME_KEY = 'welcome-v1';

/** Whether this phone has passed the welcome. If storage can't be read, show it again. */
export async function hasSeenWelcome(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(WELCOME_KEY)) === 'yes';
  } catch {
    return false;
  }
}

export function rememberWelcome(): void {
  AsyncStorage.setItem(WELCOME_KEY, 'yes').catch(() => undefined);
}

export const WelcomeContext = createContext<{ accept: () => void }>({ accept: () => undefined });

export const useWelcome = () => useContext(WelcomeContext);
