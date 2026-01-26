export type CapperCategory = 
  | 'sharp_bettor'
  | 'analyst'
  | 'media'
  | 'insider'
  | 'odds_provider'
  | 'community';

export type CapperTier = 'elite' | 'popular' | 'rising';

export type Sport = 'NFL' | 'NBA' | 'MLB' | 'NHL' | 'NCAAB' | 'NCAAF' | 'Soccer' | 'MMA' | 'Golf' | 'Tennis';

export interface Capper {
  id: string;
  x_user_id: string;
  x_username: string;
  x_display_name: string;
  x_profile_image: string | null;
  x_verified: boolean;
  x_followers_count: number;
  category: CapperCategory;
  sports: Sport[];
  specialty: string[];
  description: string | null;
  mgp_verified: boolean;
  featured: boolean;
  tier: CapperTier;
  mgp_followers: number;
  added_at: string;
  updated_at: string;
}

export interface UserCapperFollow {
  id: string;
  user_id: string;
  capper_id: string;
  followed_at: string;
}

export const CAPPER_CATEGORY_LABELS: Record<CapperCategory, string> = {
  sharp_bettor: 'Sharp Bettor',
  analyst: 'Analyst',
  media: 'Media',
  insider: 'Insider',
  odds_provider: 'Odds Provider',
  community: 'Community',
};

export const CAPPER_CATEGORY_ICONS: Record<CapperCategory, string> = {
  sharp_bettor: '🎯',
  analyst: '📊',
  media: '📺',
  insider: '🔍',
  odds_provider: '📈',
  community: '👥',
};

export const CAPPER_TIER_COLORS: Record<CapperTier, string> = {
  elite: 'text-yellow-500',
  popular: 'text-blue-500',
  rising: 'text-green-500',
};
