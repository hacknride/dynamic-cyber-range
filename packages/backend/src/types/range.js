export type Difficulty = "easy" | "medium" | "hard";

export interface RangeConfig {
  id: string; // range id
  difficulty: Difficulty;
  machinesPresent: number;
  category: string;
  composition: {
    windows: number;
    linux: number;
    random: number;
  };
  segmentation: boolean;
  createdByUserId: string;
  createdAt: string;
}
