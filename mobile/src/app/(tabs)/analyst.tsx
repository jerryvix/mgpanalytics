/** The Analyst (D-030): the grounded AI chat. It needs an account; sign-in lands with the next build. */
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, T, TopBar } from '@/components/night';
import { useTheme } from '@/hooks/use-theme';

export default function AnalystScreen() {
  const c = useTheme();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar />
      <View style={{ paddingHorizontal: 16, paddingTop: 10, gap: 14 }}>
        <T size={34} weight="medium" style={{ letterSpacing: -0.8 }}>The Analyst</T>
        <T size={17} style={{ lineHeight: 24 }}>{"Ask anything about tonight's games: splits, trends, matchups and the shows' picks, answered from MGP's data"}</T>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', padding: 14, borderRadius: 16, backgroundColor: c.surface }}>
          <Icon name="person.crop.circle.badge.checkmark" size={22} />
          <T size={15} style={{ flex: 1, lineHeight: 21 }}>Sign in arrives in the next build, and The Analyst opens with it</T>
        </View>
      </View>
    </SafeAreaView>
  );
}
