/**
 * App theme. Colors, sizes and radii come from the shared design tokens
 * (packages/shared/design-tokens/tokens.json), which are the source of truth.
 * Change a value there, not here.
 */
import '@/global.css';

import tokens from '@shared/design-tokens/tokens.json';

type ColorSet = typeof tokens.app.color.light;
type ColorName = keyof ColorSet;

function flatten(set: ColorSet): Record<ColorName, string> {
  const out = {} as Record<ColorName, string>;
  (Object.keys(set) as ColorName[]).forEach((name) => {
    out[name] = set[name].$value;
  });
  return out;
}

export const Colors = {
  light: flatten(tokens.app.color.light),
  dark: flatten(tokens.app.color.dark),
} as const;

export type ThemeColor = ColorName;

const px = (v: string) => Number.parseInt(v, 10);

export const FontSize = {
  largeTitle: px(tokens.app.font.size.largeTitle.$value),
  title1: px(tokens.app.font.size.title1.$value),
  title2: px(tokens.app.font.size.title2.$value),
  title3: px(tokens.app.font.size.title3.$value),
  headline: px(tokens.app.font.size.headline.$value),
  body: px(tokens.app.font.size.body.$value),
  callout: px(tokens.app.font.size.callout.$value),
  subhead: px(tokens.app.font.size.subhead.$value),
  footnote: px(tokens.app.font.size.footnote.$value),
  caption: px(tokens.app.font.size.caption.$value),
} as const;

export const Radius = {
  chip: px(tokens.app.radius.chip.$value),
  row: px(tokens.app.radius.row.$value),
  card: px(tokens.app.radius.card.$value),
  sheet: px(tokens.app.radius.sheet.$value),
  pill: px(tokens.app.radius.pill.$value),
} as const;

export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  gutter: px(tokens.app.layout.screenGutter.$value),
} as const;

/**
 * Geist everywhere in the app (Direction I, docs/mobile/DECISIONS.md D-049 and D-050). Titles use
 * medium (500), not bold: size and gray set the hierarchy. React Native needs one family name per
 * weight; these match the faces loaded in src/app/_layout.tsx.
 */
export const Font = {
  regular: 'Geist_400Regular',
  italic: 'Geist_400Regular_Italic',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  bold: 'Geist_700Bold',
  /** The detail font (D-064): small uppercase labels, sources, time lines. */
  mono: 'GeistMono_400Regular',
  monoMedium: 'GeistMono_500Medium',
} as const;
