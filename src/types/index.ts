export type GolferRegion = "usa" | "european" | "asian" | "longshot" | "liv" | "senior" | "other";

export interface Golfer {
  id: string;
  name: string;
  country: string;
  region: GolferRegion; // geographic only: usa | european | asian | other
  is_liv: boolean;
  is_longshot: boolean;
  is_senior: boolean;
  odds: number | null; // e.g. 10000 = 100-1 odds
  world_ranking: number | null;
  tour: "pga" | "liv";
  image_url: string | null;
  updated_at: string;
}

export interface GolferStats {
  id: string;
  golfer_id: string;
  year: number;
  round: number | null;
  score: number | null;       // total relative to par (negative = under par)
  round_score: number | null; // current round score relative to par
  position: number | null;
  thru: number | null; // holes completed in current round
  status: "active" | "cut" | "wd" | "mc" | "notstarted";
  updated_at: string;
  golfer?: Golfer;
}

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Picks {
  id: string;
  user_id: string;
  year: number;
  usa_pick: string | null;
  european_pick: string | null;
  asian_pick: string | null;
  longshot_pick: string | null;
  liv_pick: string | null;
  senior_pick: string | null;
  submitted_at: string;
  locked: boolean;
  profile?: Profile;
  usa_golfer?: Golfer;
  european_golfer?: Golfer;
  asian_golfer?: Golfer;
  longshot_golfer?: Golfer;
  liv_golfer?: Golfer;
}

export interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  total_score: number;
  picks: {
    category: GolferRegion;
    golfer: Golfer;
    stats: GolferStats | null;
  }[];
}

export const PICK_CATEGORIES: {
  key: keyof Omit<Picks, "id" | "user_id" | "year" | "submitted_at" | "locked" | "profile">;
  label: string;
  region: GolferRegion;
  description: string;
  emoji: string;
}[] = [
  {
    key: "usa_pick",
    label: "American",
    region: "usa",
    description: "A golfer from the United States",
    emoji: "🇺🇸",
  },
  {
    key: "european_pick",
    label: "European",
    region: "european",
    description: "A golfer from Europe",
    emoji: "🇪🇺",
  },
  {
    key: "asian_pick",
    label: "Asian",
    region: "asian",
    description: "A golfer from Asia",
    emoji: "🌏",
  },
  {
    key: "longshot_pick",
    label: "Longshot",
    region: "longshot",
    description: "A golfer with 100-1 or greater odds",
    emoji: "🎯",
  },
  {
    key: "liv_pick",
    label: "LIV Golfer",
    region: "liv",
    description: "A LIV Golf tour member",
    emoji: "⚡",
  },
  {
    key: "senior_pick",
    label: "Fossils",
    region: "senior",
    description: "A past champion or Augusta veteran aged 50 or over",
    emoji: "🦕",
  },
];

export const TOURNAMENT_YEAR = new Date().getFullYear();
