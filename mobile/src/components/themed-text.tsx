import { StyleSheet, Text, type TextProps } from 'react-native';

import { FontSize, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'largeTitle' | 'title' | 'headline' | 'body' | 'subhead' | 'footnote' | 'caption';
  themeColor?: ThemeColor;
};

/** Text that follows the app type scale and the light or dark palette. */
export function ThemedText({ style, type = 'body', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  return <Text style={[{ color: theme[themeColor ?? 'text'] }, styles[type], style]} {...rest} />;
}

const styles = StyleSheet.create({
  largeTitle: { fontSize: FontSize.largeTitle, lineHeight: 41, fontWeight: '700' },
  title: { fontSize: FontSize.title2, lineHeight: 28, fontWeight: '700' },
  headline: { fontSize: FontSize.headline, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: FontSize.body, lineHeight: 22, fontWeight: '400' },
  subhead: { fontSize: FontSize.subhead, lineHeight: 20, fontWeight: '400' },
  footnote: { fontSize: FontSize.footnote, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: FontSize.caption, lineHeight: 16, fontWeight: '400' },
});
