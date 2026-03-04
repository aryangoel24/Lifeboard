export type Profile = {
  id: string;
  daily_calories_goal: number;
  daily_protein_goal: number;
  daily_carbs_goal: number;
  daily_fat_goal: number;
  goal_weight: number | null;
  creatine_goal: number;
  gym_weekly_goal: number;
  api_token_hash: string | null;
  api_enabled: boolean;
  timezone: string;
  creatine_nr_enabled: boolean;
  creatine_nr_is_hard: boolean;
  magnesium_nr_enabled: boolean;
  magnesium_nr_is_hard: boolean;
  gym_nr_enabled: boolean;
  gym_nr_is_hard: boolean;
  created_at: string;
  updated_at: string;
};

export type MealSource = "homemade" | "restaurant" | "takeout" | "grocery_prepared";

export type FoodEntry = {
  id: string;
  user_id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  meal_category: "breakfast" | "lunch" | "dinner" | "snack";
  photo_url: string | null;
  logged_at: string;
  created_at: string;
  cost: number | null;
  meal_source: MealSource | null;
};

export type MealCategory = FoodEntry["meal_category"];

export type Recipe = {
  id: string;
  user_id: string;
  name: string;
  servings: number;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  prep_time_minutes: number | null;
  photo_url: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
};

export type RecipeIngredient = {
  id: string;
  recipe_id: string;
  name: string;
  amount: number | null;
  unit: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  pantry_item_id: string | null;
};

export type PantryCategory =
  | "protein"
  | "dairy"
  | "grain"
  | "vegetable"
  | "fruit"
  | "fat_oil"
  | "spice"
  | "beverage"
  | "other";

export type PantryItem = {
  id: string;
  user_id: string;
  name: string;
  category: PantryCategory;
  base_amount: number;
  base_unit: string;
  calories_per_base: number;
  protein_per_base: number;
  carbs_per_base: number;
  fat_per_base: number;
  cost_per_base: number | null;
  stock_quantity: number | null;
  stock_unit: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
};

export type MealTemplate = {
  id: string;
  user_id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  meal_category: MealCategory;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
};

export type BudgetGoal = {
  id: string;
  user_id: string;
  period: "weekly" | "monthly";
  amount: number;
  category: string | null; // null = overall budget
  created_at: string;
};

export type GroceryList = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
};

export type GroceryItem = {
  id: string;
  list_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  estimated_cost: number | null;
  checked: boolean;
};

export type UserAchievement = {
  id: string;
  user_id: string;
  achievement_key: string;
  unlocked_at: string;
};

export type HabitType = "creatine" | "magnesium" | "gym" | "custom";

export type TrackingType = "checkbox" | "counter" | "duration";

export type HabitFrequency = "daily" | "weekdays" | "custom";

export type CustomHabit = {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  tracking_type: TrackingType;
  target_value: number;
  frequency: HabitFrequency;
  frequency_days: number[] | null;
  category: string | null;
  sort_order: number;
  archived: boolean;
  nr_enabled: boolean;
  nr_is_hard: boolean;
  created_at: string;
  updated_at: string;
};

export type HabitEntry = {
  id: string;
  user_id: string;
  habit_type: HabitType;
  custom_habit_id: string | null;
  logged_at: string;
  value: number;
  created_at: string;
};

// String type to support custom:{habit_id} streak keys
export type StreakType = "logging" | "goal" | "cooking" | "creatine" | "magnesium" | "gym" | (string & {});

export type UserStreak = {
  id: string;
  user_id: string;
  streak_type: StreakType;
  current_count: number;
  longest_count: number;
  last_logged_date: string | null;
  updated_at: string;
};

export type WeightEntry = {
  id: string;
  user_id: string;
  weight: number;
  logged_at: string;
  notes: string | null;
  created_at: string;
};

export type StepEntry = {
  id: string;
  user_id: string;
  steps: number;
  logged_at: string;
  created_at: string;
};

export type ExpenseEntry = {
  id: string;
  user_id: string;
  amount: number;
  description: string | null;
  expense_date: string;
  source: "receipt" | "manual" | "plaid";
  raw_text: string | null;
  category: string | null;
  merchant_name: string | null;
  created_at: string;
};

export type NodeResource = {
  url: string;
  label: string | null;
};

export type KnowledgeNode = {
  id: string;
  user_id: string;
  parent_id: string | null;
  root_id: string;
  title: string;
  description: string | null;
  key_facts: string[];
  color: string | null;
  position_x: number;
  position_y: number;
  depth: number;
  ai_generated: boolean;
  is_generating: boolean;
  last_ai_generated_at: string | null;
  detail_model: string | null;
  user_notes: string | null;
  user_facts: string[];
  resources: NodeResource[];
  node_type: 'topic' | 'concept' | 'person' | 'book' | 'skill' | 'project' | 'question' | 'insight';
  mastery_status: 'not_started' | 'learning' | 'practicing' | 'mastered';
  confidence_score: number | null;
  last_reviewed_at: string | null;
  source?: 'manual' | 'digest' | 'extract' | 'scaffold';
  source_ref?: string | null;
  ai_evidence?: string | null;
  is_collapsed: boolean;
  updated_at: string;
  created_at: string;
};

export type KnowledgeLink = {
  id: string;
  user_id: string;
  a_id: string;
  b_id: string;
  created_at: string;
};

export type NodeType = KnowledgeNode['node_type'];
export type MasteryStatus = KnowledgeNode['mastery_status'];

export type ExtractionNode = {
  temp_id: string;
  title: string;
  node_type: NodeType;
  evidence: string;
  facts?: string[];
  children?: ExtractionNode[];
};

export type ExtractionMatch = {
  temp_id: string;
  proposed_title: string;
  matched_node_id: string;
  matched_node_title: string;
  confidence: number;
  evidence: string;
  add_facts?: string[];
};

export type ExtractionResult = {
  summary: string;
  roots: ExtractionNode[];
  matches: ExtractionMatch[];
};

export type DigestNodeUpdate = {
  node_id: string;
  confidence: number;
  add_takeaways: string[];
};

export type DigestNewNode = {
  temp_id: string;
  proposed_title: string;
  node_type: NodeType;
  suggested_parent_node_id: string;
  why: string;
};

export type DigestUnassigned = {
  text: string;
  why_unmatched: string;
};

export type DigestPayload = {
  summary: string;
  highlights: string[];
  node_updates: DigestNodeUpdate[];
  new_nodes: DigestNewNode[];
  unassigned: DigestUnassigned[];
};

export type DailyDigest = {
  id: string;
  user_id: string;
  date: string;
  raw_text: string;
  summary: string | null;
  created_at: string;
};

export type DigestSuggestion = {
  id: string;
  digest_id: string;
  user_id: string;
  status: 'pending' | 'applied' | 'dismissed';
  payload_json: DigestPayload;
  created_at: string;
};

export type HabitDebt = {
  id: string;
  user_id: string;
  habit_type: HabitType;
  custom_habit_id: string | null;
  nr_opted_in_at: string;
  debt_count: number;
  completions_pending: number;
  scheduled_clean_streak: number;
  consecutive_miss_days: number;
  lifetime_unpaid_cents: number;
  debt_computed_through: string | null;
  created_at: string;
  updated_at: string;
};

export type HabitDebtMeta = {
  user_id: string;
  recovery_mode_active: boolean;
  recovery_mode_start: string | null;
  recovery_mode_deadline: string | null;
  recovery_streak: number;
  recovery_cooldown_until: string | null;
  updated_at: string;
};

export type PenaltyMonth = {
  id: string;
  user_id: string;
  month: string;
  total_cents: number;
  settled_at: string | null;
  created_at: string;
};

export type PenaltyEventReason = 'miss' | 'cap_skipped' | 'forgiven' | 'recovery_paused';

export type PenaltyEvent = {
  id: string;
  user_id: string;
  habit_type: HabitType;
  custom_habit_id: string | null;
  event_date: string;
  cents: number;
  reason: PenaltyEventReason;
  created_at: string;
};
