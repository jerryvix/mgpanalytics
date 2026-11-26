/**
 * First run, in order (D-124, D-125): the 18+ welcome (welcome.ts), then Get Started for guests
 * (once per phone), then the tour. Today calls `nextFirstRunStep` each time it comes into view.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

const GET_STARTED_KEY = 'get-started-v1';

let seen: boolean | null = null;

export function rememberGetStarted(): void {
  seen = true;
  AsyncStorage.setItem(GET_STARTED_KEY, 'yes').catch(() => undefined);
}

/** Opens Get Started for a guest who hasn't seen it; otherwise runs `then` (the tour). */
export async function nextFirstRunStep(isGuest: boolean, then: () => void): Promise<void> {
  if (seen === null) {
    try {
      seen = (await AsyncStorage.getItem(GET_STARTED_KEY)) === 'yes';
    } catch {
      seen = true; // if storage can't be read, don't block the app on it
    }
  }
  if (isGuest && !seen) {
    seen = true; // asked once, whatever happens next
    router.push('/get-started');
    return;
  }
  then();
}
