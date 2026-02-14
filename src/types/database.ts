export type Profile = {
  id: string;
  daily_calories_goal: number;
  daily_protein_goal: number;
  daily_carbs_goal: number;
  daily_fat_goal: number;
  created_at: string;
  updated_at: string;
};

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
};

export type MealCategory = FoodEntry["meal_category"];
