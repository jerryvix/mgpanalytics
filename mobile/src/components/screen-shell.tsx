import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  title: string;
  /** What this screen will do. Shown only while the screen is being built. */
  purpose?: string;
  children?: ReactNode;
};

/**
 * Standard screen frame: large title, gutter, scroll. While a screen is under
 * construction it shows its purpose in a dashed box. No screen ships to the
 * App Store in that state (App Review guideline 2.1).
 */
export function ScreenShell({ title, purpose, children }: Props) {
  const colors = useTheme();
  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="largeTitle">{title}</ThemedText>
        {purpose ? (
          <View style={[styles.wip, { borderColor: colors.border }]}>
            <ThemedText type="footnote" themeColor="textTertiary">
              In Development
            </ThemedText>
            <ThemedText type="subhead" themeColor="textSecondary">
              {purpose}
            </ThemedText>
          </View>
        ) : null}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: Spacing.gutter, paddingTop: Spacing.sm, paddingBottom: Spacing.xxl, gap: Spacing.lg },
  wip: { borderWidth: 1, borderStyle: 'dashed', borderRadius: Radius.card, padding: Spacing.lg, gap: Spacing.xs },
});
