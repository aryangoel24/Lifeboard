import type { PantryCategory, PantryItem } from "@/types/database";

export const PANTRY_CATEGORIES: { value: PantryCategory; label: string }[] = [
    { value: "protein", label: "Protein" },
    { value: "dairy", label: "Dairy" },
    { value: "grain", label: "Grain" },
    { value: "vegetable", label: "Vegetable" },
    { value: "fruit", label: "Fruit" },
    { value: "fat_oil", label: "Fat & Oil" },
    { value: "spice", label: "Spice" },
    { value: "beverage", label: "Beverage" },
    { value: "other", label: "Other" },
];

export const COMMON_UNITS = ["g", "ml", "oz", "cup", "tbsp", "tsp", "unit"];

export function scaleNutrition(
    item: PantryItem,
    amount: number
): { calories: number; protein: number; carbs: number; fat: number } {
    const ratio = amount / item.base_amount;
    return {
        calories: Math.round(item.calories_per_base * ratio),
        protein: Math.round(item.protein_per_base * ratio * 10) / 10,
        carbs: Math.round(item.carbs_per_base * ratio * 10) / 10,
        fat: Math.round(item.fat_per_base * ratio * 10) / 10,
    };
}
