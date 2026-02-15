// Define all available achievements
export const ACHIEVEMENTS = [
    // Consistency
    { key: "streak_7", label: "7-Day Streak", description: "Log food 7 days in a row", icon: "🔥", category: "consistency" },
    { key: "streak_30", label: "30-Day Streak", description: "Log food 30 days in a row", icon: "🔥", category: "consistency" },
    { key: "entries_10", label: "Getting Started", description: "Log 10 food entries", icon: "🌱", category: "consistency" },
    { key: "entries_50", label: "Regular Logger", description: "Log 50 food entries", icon: "📝", category: "consistency" },
    { key: "entries_100", label: "Century Club", description: "Log 100 food entries", icon: "💯", category: "consistency" },
    { key: "entries_500", label: "Dedicated Tracker", description: "Log 500 food entries", icon: "🏆", category: "consistency" },

    // Nutrition
    { key: "protein_streak_7", label: "Protein Pro", description: "Hit protein goal 7 days in a row", icon: "💪", category: "nutrition" },
    { key: "all_meals_logged", label: "Full Day", description: "Log breakfast, lunch, dinner, and snack in one day", icon: "🍽️", category: "nutrition" },
    { key: "under_budget_7", label: "Calorie Control", description: "Stay under calorie goal 7 days in a row", icon: "🎯", category: "nutrition" },

    // Cooking
    { key: "cooking_streak_3", label: "Home Chef", description: "Cook at home 3 days in a row", icon: "👨‍🍳", category: "cooking" },
    { key: "cooking_streak_7", label: "Kitchen Master", description: "Cook at home 7 days in a row", icon: "👩‍🍳", category: "cooking" },
    { key: "recipes_5", label: "Recipe Builder", description: "Create 5 recipes", icon: "📖", category: "cooking" },

    // Budget
    { key: "budget_tracked_week", label: "Budget Tracker", description: "Track food costs for a full week", icon: "💰", category: "budget" },
    { key: "under_budget_month", label: "Budget Champion", description: "Stay under food budget for a month", icon: "🏅", category: "budget" },
] as const;

export type AchievementDefinition = (typeof ACHIEVEMENTS)[number];
