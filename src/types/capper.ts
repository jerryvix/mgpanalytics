export type CapperCategory = 
  | 'sharp_bettor'
  | 'analyst'
  | 'media'
  | 'insider'
  | 'odds_provider'
  | 'pop_culture'
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
  pop_culture: 'Pop Culture',
  community: 'Community',
};

export const CAPPER_CATEGORY_ICONS: Record<CapperCategory, string> = {
  sharp_bettor: '🎯',
  analyst: '📊',
  media: '📰',
  insider: '🔔',
  odds_provider: '⚡',
  pop_culture: '🎬',
  community: '👥',
};

export const CAPPER_TIER_COLORS: Record<CapperTier, string> = {
  elite: 'text-yellow-500',
  popular: 'text-blue-500',
  rising: 'text-green-500',
};

export interface CategoryConfig {
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  description: string;
  disclaimer?: string;
  isEntertainment?: boolean;
}

export const CATEGORY_CONFIG: Record<CapperCategory, CategoryConfig> = {
  sharp_bettor: {
    label: 'Sharp Bettor',
    icon: '🎯',
    color: 'text-green-400',
    bgColor: 'bg-green-400/10',
    description: 'Professional bettors with proven track records',
  },
  analyst: {
    label: 'Analyst',
    icon: '📊',
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10',
    description: 'Data-driven analysis and insights',
  },
  media: {
    label: 'Media',
    icon: '📰',
    color: 'text-purple-400',
    bgColor: 'bg-purple-400/10',
    description: 'Betting news and media outlets',
  },
  pop_culture: {
    label: 'Pop Culture',
    icon: '🎬',
    color: 'text-pink-400',
    bgColor: 'bg-pink-400/10',
    description: 'Entertainment personalities in the betting space',
    disclaimer: 'Entertainment content - follow for vibes, not picks',
    isEntertainment: true,
  },
  insider: {
    label: 'Insider',
    icon: '🔔',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-400/10',
    description: 'Breaking news and injury reports',
  },
  odds_provider: {
    label: 'Odds Provider',
    icon: '⚡',
    color: 'text-orange-400',
    bgColor: 'bg-orange-400/10',
    description: 'Sportsbooks and odds platforms',
  },
  community: {
    label: 'Community',
    icon: '👥',
    color: 'text-gray-400',
    bgColor: 'bg-gray-400/10',
    description: 'Community voices and rising cappers',
  },
};
