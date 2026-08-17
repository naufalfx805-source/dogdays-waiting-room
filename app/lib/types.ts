export type Headline = {
  intake_rows: number; outcome_rows: number; paired_stays: number;
  dog_stays: number; dog_adoptions: number;
  pit_median: number; nonpit_median: number;
  black_median: number; nonblack_median: number;
};
export type ColorRow = { color: string; n: number; median_days: number; avg_days: number; pct_pit_bull: number };
export type ControlledRow = { color: string; breed_group: 'pit bull' | 'other breed'; n: number; median_days: number };
export type BreedRow = { breed: string; n: number; median_days: number };
export type AgeRow = { age_band: string; n: number; median_days: number };
export type Dog = {
  animal_id: string; name: string; breed: string; color: string;
  primary_color: string; is_pit_bull: number; age_years: number;
  sex_upon_intake: string; intake_condition: string; intake_type: string; los_days: number;
};

export type Findings = {
  source: 'snowflake' | 'bundled';
  elapsed_ms: number;
  ai_enabled: boolean;
  headline: Headline;
  color: ColorRow[];
  controlled: ControlledRow[];
  breed: BreedRow[];
  age: AgeRow[];
  dogs: Dog[];
};

export const AGE_ORDER = ['under 6mo', '6mo-2y', '2-5y', '5-8y', '8y+'];
