import { Slot } from 'expo-router';

/**
 * Web preview only (the app ships on iPhone): NativeTabs' web fallback trips expo-router's
 * Slot style check, so the preview renders each screen without a tab bar.
 */
export default function AppTabs() {
  return <Slot />;
}
