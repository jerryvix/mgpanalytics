/**
 * Today's date for Today and Games. It rolls over at midnight and when the app comes back to
 * the foreground, so a phone left open overnight shows the new day.
 */
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { ymd } from '@/lib/time';

export function useToday(): Date {
  const [today, setToday] = useState(() => new Date());
  const day = ymd(today);

  useEffect(() => {
    const check = () => setToday((cur) => (ymd(cur) === ymd(new Date()) ? cur : new Date()));
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    const timer = setTimeout(check, nextMidnight.getTime() - now.getTime());
    return () => {
      sub.remove();
      clearTimeout(timer);
    };
  }, [day]);

  return today;
}
