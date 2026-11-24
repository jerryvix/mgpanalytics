import { NativeTabs } from 'expo-router/native-tabs';

import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The four v1 tabs (docs/mobile/PLAN.md, D-059, D-071, D-079): Today, Games, Pulse, The Analyst. Labels are Title Case (D-027); the Analyst tab is named "The Analyst" (D-030). Profile is reached from the avatar in
 * each screen's header, not a tab. Icons: SF Symbols on iOS, Material on Android.
 */
export default function AppTabs() {
  const colors = useTheme();

  return (
    <NativeTabs
      backgroundColor={colors.surface}
      indicatorColor={colors.chipActiveBg}
      labelStyle={{
        default: { fontFamily: Font.semibold },
        selected: { fontFamily: Font.semibold, color: colors.text },
      }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'flame', selected: 'flame.fill' }} md="local_fire_department" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="games">
        <NativeTabs.Trigger.Label>Games</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'sportscourt', selected: 'sportscourt.fill' }} md="sports" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="pulse">
        <NativeTabs.Trigger.Label>Pulse</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'waveform.path.ecg', selected: 'waveform.path.ecg' }} md="monitor_heart" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="analyst">
        <NativeTabs.Trigger.Label>The Analyst</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'bubble.left.and.text.bubble.right', selected: 'bubble.left.and.text.bubble.right.fill' }}
          md="forum"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
