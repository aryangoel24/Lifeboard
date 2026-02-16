"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getDefaultMealCategory } from "@/lib/utils";
import type { Recipe, RecipeIngredient } from "@/types/database";

export async function getRecipes(): Promise<Recipe[]> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return [];

    const { data, error } = await supabase
        .from("recipes")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Error fetching recipes:", error);
        return [];
    }

    return data as Recipe[];
}

export async function getRecipesWithIngredients(): Promise<
    (Recipe & { ingredients: RecipeIngredient[] })[]
> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return [];

    const { data: recipes, error } = await supabase
        .from("recipes")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

    if (error || !recipes) {
        console.error("Error fetching recipes:", error);
        return [];
    }

    if (recipes.length === 0) return [];

    const recipeIds = recipes.map((r: Recipe) => r.id);
    const { data: allIngredients } = await supabase
        .from("recipe_ingredients")
        .select("*")
        .in("recipe_id", recipeIds);

    const ingredientsByRecipe = (allIngredients || []).reduce(
        (acc: Record<string, RecipeIngredient[]>, ing: RecipeIngredient) => {
            if (!acc[ing.recipe_id]) acc[ing.recipe_id] = [];
            acc[ing.recipe_id].push(ing);
            return acc;
        },
        {}
    );

    return recipes.map((r: Recipe) => ({
        ...r,
        ingredients: ingredientsByRecipe[r.id] || [],
    }));
}

export async function getRecipe(id: string): Promise<{ recipe: Recipe | null; ingredients: RecipeIngredient[] }> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { recipe: null, ingredients: [] };

    const [recipeResult, ingredientsResult] = await Promise.all([
        supabase.from("recipes").select("*").eq("id", id).eq("user_id", user.id).single(),
        supabase.from("recipe_ingredients").select("*").eq("recipe_id", id),
    ]);

    return {
        recipe: recipeResult.data as Recipe | null,
        ingredients: (ingredientsResult.data as RecipeIngredient[]) || [],
    };
}

export async function createRecipe(formData: FormData) {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Unauthorized" };

    const ingredientsJson = formData.get("ingredients") as string;
    const ingredients: Array<{
        name: string;
        amount: number;
        unit: string;
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        pantryItemId?: string | null;
    }> = ingredientsJson ? JSON.parse(ingredientsJson) : [];

    // Calculate totals from ingredients
    const totals = ingredients.reduce(
        (acc, ing) => ({
            calories: acc.calories + (ing.calories || 0),
            protein: acc.protein + (ing.protein || 0),
            carbs: acc.carbs + (ing.carbs || 0),
            fat: acc.fat + (ing.fat || 0),
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

    const tagsRaw = formData.get("tags") as string;
    const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];

    const recipe = {
        user_id: user.id,
        name: formData.get("name") as string,
        servings: parseInt(formData.get("servings") as string) || 1,
        total_calories: totals.calories,
        total_protein: totals.protein,
        total_carbs: totals.carbs,
        total_fat: totals.fat,
        prep_time_minutes: parseInt(formData.get("prep_time_minutes") as string) || null,
        tags,
    };

    const { data, error } = await supabase.from("recipes").insert(recipe).select().single();

    if (error) return { error: error.message };

    // Insert ingredients
    if (ingredients.length > 0 && data) {
        const ingredientRows = ingredients.map((ing) => ({
            recipe_id: data.id,
            name: ing.name,
            amount: ing.amount || null,
            unit: ing.unit || null,
            calories: ing.calories || 0,
            protein: ing.protein || 0,
            carbs: ing.carbs || 0,
            fat: ing.fat || 0,
            pantry_item_id: ing.pantryItemId || null,
        }));

        const { error: ingError } = await supabase.from("recipe_ingredients").insert(ingredientRows);
        if (ingError) {
            console.error("Error inserting ingredients:", ingError);
        }
    }

    revalidatePath("/recipes");
    return { success: true, id: data?.id };
}

export async function updateRecipe(id: string, formData: FormData) {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Unauthorized" };

    const ingredientsJson = formData.get("ingredients") as string;
    const ingredients: Array<{
        name: string;
        amount: number;
        unit: string;
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        pantryItemId?: string | null;
    }> = ingredientsJson ? JSON.parse(ingredientsJson) : [];

    const totals = ingredients.reduce(
        (acc, ing) => ({
            calories: acc.calories + (ing.calories || 0),
            protein: acc.protein + (ing.protein || 0),
            carbs: acc.carbs + (ing.carbs || 0),
            fat: acc.fat + (ing.fat || 0),
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

    const tagsRaw = formData.get("tags") as string;
    const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];

    const updates = {
        name: formData.get("name") as string,
        servings: parseInt(formData.get("servings") as string) || 1,
        total_calories: totals.calories,
        total_protein: totals.protein,
        total_carbs: totals.carbs,
        total_fat: totals.fat,
        prep_time_minutes: parseInt(formData.get("prep_time_minutes") as string) || null,
        tags,
        updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("recipes").update(updates).eq("id", id).eq("user_id", user.id);

    if (error) return { error: error.message };

    // Replace ingredients: delete old, insert new
    await supabase.from("recipe_ingredients").delete().eq("recipe_id", id);

    if (ingredients.length > 0) {
        const ingredientRows = ingredients.map((ing) => ({
            recipe_id: id,
            name: ing.name,
            amount: ing.amount || null,
            unit: ing.unit || null,
            calories: ing.calories || 0,
            protein: ing.protein || 0,
            carbs: ing.carbs || 0,
            fat: ing.fat || 0,
            pantry_item_id: ing.pantryItemId || null,
        }));

        await supabase.from("recipe_ingredients").insert(ingredientRows);
    }

    revalidatePath("/recipes");
    return { success: true };
}

export async function logFromRecipe(recipeId: string, servings: number, date: string) {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Unauthorized" };

    const { data: recipe, error: fetchError } = await supabase
        .from("recipes")
        .select("*")
        .eq("id", recipeId)
        .eq("user_id", user.id)
        .single();

    if (fetchError || !recipe) return { error: "Recipe not found" };

    const perServingMultiplier = servings / recipe.servings;
    const name = servings === 1 ? recipe.name : `${recipe.name} × ${servings}`;

    const entry = {
        user_id: user.id,
        name,
        calories: Math.round(recipe.total_calories * perServingMultiplier),
        protein: Math.round(recipe.total_protein * perServingMultiplier),
        carbs: Math.round(recipe.total_carbs * perServingMultiplier),
        fat: Math.round(recipe.total_fat * perServingMultiplier),
        meal_category: getDefaultMealCategory(),
        meal_source: "homemade",
        logged_at: new Date(date + "T12:00:00").toISOString(),
    };

    const { error: insertError } = await supabase.from("food_entries").insert(entry);

    if (insertError) return { error: insertError.message };

    revalidatePath("/dashboard");
    revalidatePath("/recipes");
    return { success: true };
}

export async function deleteRecipe(id: string) {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Unauthorized" };

    const { error } = await supabase.from("recipes").delete().eq("id", id).eq("user_id", user.id);

    if (error) return { error: error.message };

    revalidatePath("/recipes");
    return { success: true };
}
