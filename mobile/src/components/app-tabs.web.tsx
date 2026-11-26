import { Link, Slot, usePathname } from 'expo-router';
import { View } from 'react-native';

import { T } from '@/components/night';
import { useTheme } from '@/hooks/use-theme';

/**
 * Web preview only (the app ships on iPhone): NativeTabs' web fallback trips expo-router's
 * Slot style check, so the preview renders each screen with a plain stand-in for the tab bar,
 * four equal slots like the iPhone's, so the first-run tour's arrows can be checked (D-124).
 */
const TABS = [
  { href: '/', label: 'Today' },
  { href: '/games', label: 'Games' },
  { href: '/pulse', label: 'Pulse' },
  { href: '/analyst', label: 'The Analyst' },
] as const;

export default function AppTabs() {
  const c = useTheme();
  const path = usePathname();
  return (
    <View style={{ flex: 1 }}>
      <Slot />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 49, flexDirection: 'row', backgroundColor: c.surface }}>
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', display: 'flex' }}>
            <T size={12} weight="semibold" style={{ opacity: path === t.href ? 1 : 0.5 }}>{t.label}</T>
          </Link>
        ))}
      </View>
    </View>
  );
}
