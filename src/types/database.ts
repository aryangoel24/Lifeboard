export type Profile = {
  id: string;
  daily_calories_goal: number;
  daily_protein_goal: number;
  daily_carbs_goal: number;
  daily_fat_goal: number;
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

export type StreakType = "logging" | "goal" | "cooking";

export type UserStreak = {
  id: string;
  user_id: string;
  streak_type: StreakType;
  current_count: number;
  longest_count: number;
  last_logged_date: string | null;
  updated_at: string;
};
