import { StyleSheet, Text, type TextProps } from 'react-native';

import { Font, FontSize, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'largeTitle' | 'title' | 'headline' | 'body' | 'subhead' | 'footnote' | 'caption' | 'number';
  themeColor?: ThemeColor;
};

/**
 * Text that follows the app type scale (Geist) and the light or dark palette.
 * Copy rule: labels (titles, buttons, tabs, chips, badges) are Title Case; sentences are sentence case.
 * See docs/mobile/DECISIONS.md D-027 and titleCase() in packages/shared/text.
 */
export function ThemedText({ style, type = 'body', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  return <Text style={[{ color: theme[themeColor ?? 'text'] }, styles[type], style]} {...rest} />;
}

const styles = StyleSheet.create({
  largeTitle: { fontFamily: Font.medium, fontSize: FontSize.largeTitle, lineHeight: 38, letterSpacing: -0.8 },
  title: { fontFamily: Font.medium, fontSize: FontSize.title2, lineHeight: 28, letterSpacing: -0.3 },
  headline: { fontFamily: Font.semibold, fontSize: FontSize.headline, lineHeight: 22 },
  body: { fontFamily: Font.regular, fontSize: FontSize.body, lineHeight: 24 },
  subhead: { fontFamily: Font.regular, fontSize: FontSize.subhead, lineHeight: 21 },
  footnote: { fontFamily: Font.medium, fontSize: FontSize.footnote, lineHeight: 18 },
  caption: { fontFamily: Font.medium, fontSize: FontSize.caption, lineHeight: 16 },
  /** Odds, scores and prices: tabular figures so columns line up. */
  number: { fontFamily: Font.medium, fontSize: FontSize.headline, lineHeight: 22, fontVariant: ['tabular-nums'] },
});
