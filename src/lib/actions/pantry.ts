"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { scaleNutrition } from "@/lib/pantry-utils";
import { getNow } from "@/lib/timezone";
import { updateStreaks, checkAndUnlockAchievements } from "@/lib/actions/achievements";
import type { PantryItem, MealCategory } from "@/types/database";

export async function getPantryItems(): Promise<PantryItem[]> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return [];

    const { data, error } = await supabase
        .from("pantry_items")
        .select("*")
        .eq("user_id", user.id)
        .order("name", { ascending: true });

    if (error) {
        console.error("Error fetching pantry items:", error);
        return [];
    }

    return data as PantryItem[];
}

export async function createPantryItem(formData: FormData) {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Unauthorized" };

    const item = {
        user_id: user.id,
        name: formData.get("name") as string,
        category: formData.get("category") as string,
        base_amount: parseFloat(formData.get("base_amount") as string) || 100,
        base_unit: formData.get("base_unit") as string || "g",
        calories_per_base: parseInt(formData.get("calories_per_base") as string) || 0,
        protein_per_base: parseFloat(formData.get("protein_per_base") as string) || 0,
        carbs_per_base: parseFloat(formData.get("carbs_per_base") as string) || 0,
        fat_per_base: parseFloat(formData.get("fat_per_base") as string) || 0,
        cost_per_base: formData.get("cost_per_base")
            ? parseFloat(formData.get("cost_per_base") as string)
            : null,
        photo_url: (formData.get("photo_url") as string) || null,
    };

    if (!item.name?.trim()) return { error: "Name is required" };

    const { error } = await supabase.from("pantry_items").insert(item);

    if (error) return { error: error.message };

    revalidatePath("/pantry");
    return { success: true };
}

export async function updatePantryItem(id: string, formData: FormData) {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Unauthorized" };

    const updates = {
        name: formData.get("name") as string,
        category: formData.get("category") as string,
        base_amount: parseFloat(formData.get("base_amount") as string) || 100,
        base_unit: formData.get("base_unit") as string || "g",
        calories_per_base: parseInt(formData.get("calories_per_base") as string) || 0,
        protein_per_base: parseFloat(formData.get("protein_per_base") as string) || 0,
        carbs_per_base: parseFloat(formData.get("carbs_per_base") as string) || 0,
        fat_per_base: parseFloat(formData.get("fat_per_base") as string) || 0,
        cost_per_base: formData.get("cost_per_base")
            ? parseFloat(formData.get("cost_per_base") as string)
            : null,
        photo_url: (formData.get("photo_url") as string) || null,
        updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
        .from("pantry_items")
        .update(updates)
        .eq("id", id)
        .eq("user_id", user.id);

    if (error) return { error: error.message };

    revalidatePath("/pantry");
    revalidatePath("/recipes");
    return { success: true };
}

export async function logFromPantry(
    pantryItemId: string,
    amount: number,
    mealCategory: MealCategory,
) {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Unauthorized" };

    const { data: item, error: fetchError } = await supabase
        .from("pantry_items")
        .select("*")
        .eq("id", pantryItemId)
        .eq("user_id", user.id)
        .single();

    if (fetchError || !item) return { error: "Pantry item not found" };

    const macros = scaleNutrition(item as PantryItem, amount);

    const entry = {
        user_id: user.id,
        name: item.name,
        calories: macros.calories,
        protein: macros.protein,
        carbs: macros.carbs,
        fat: macros.fat,
        meal_category: mealCategory,
        meal_source: "grocery_prepared",
        logged_at: getNow().toISOString(),
    };

    const { error: insertError } = await supabase.from("food_entries").insert(entry);

    if (insertError) return { error: insertError.message };

    await Promise.all([updateStreaks(), checkAndUnlockAchievements()]);

    revalidatePath("/dashboard");
    return { success: true };
}

export async function deletePantryItem(id: string) {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Unauthorized" };

    const { error } = await supabase
        .from("pantry_items")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

    if (error) return { error: error.message };

    revalidatePath("/pantry");
    return { success: true };
}
