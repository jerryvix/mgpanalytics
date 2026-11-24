/**
 * Room for the floating tab bar (D-090). The tab screens' own safe area didn't include it on
 * device, so tab screens reserve the home indicator inset plus a standard 49-point tab bar.
 * On iOS 26 the floating bar's top sits about 72 points above the screen bottom; this leaves
 * a little air above it.
 */
import { initialWindowMetrics } from 'react-native-safe-area-context';

export const TAB_BAR_SPACE = (initialWindowMetrics?.insets.bottom ?? 0) + 49;
