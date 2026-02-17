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

export const CATEGORY_COLORS: Record<PantryCategory, string> = {
    protein: "border-l-blue-400",
    dairy: "border-l-sky-300",
    grain: "border-l-amber-400",
    vegetable: "border-l-emerald-400",
    fruit: "border-l-rose-400",
    fat_oil: "border-l-purple-400",
    spice: "border-l-orange-400",
    beverage: "border-l-cyan-400",
    other: "border-l-zinc-400",
};

export const CATEGORY_TEXT_COLORS: Record<PantryCategory, string> = {
    protein: "text-blue-400",
    dairy: "text-sky-300",
    grain: "text-amber-400",
    vegetable: "text-emerald-400",
    fruit: "text-rose-400",
    fat_oil: "text-purple-400",
    spice: "text-orange-400",
    beverage: "text-cyan-400",
    other: "text-zinc-400",
};

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
