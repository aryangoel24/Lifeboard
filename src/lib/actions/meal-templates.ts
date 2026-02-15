"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { MealTemplate } from "@/types/database";

export async function getMealTemplates(): Promise<MealTemplate[]> {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return [];

    const { data, error } = await supabase
        .from("meal_templates")
        .select("*")
        .eq("user_id", user.id)
        .order("use_count", { ascending: false });

    if (error) {
        console.error("Error fetching meal templates:", error);
        return [];
    }

    return data as MealTemplate[];
}

export async function createMealTemplate(formData: FormData) {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Unauthorized" };

    const template = {
        user_id: user.id,
        name: formData.get("name") as string,
        calories: parseInt(formData.get("calories") as string) || 0,
        protein: parseFloat(formData.get("protein") as string) || 0,
        carbs: parseFloat(formData.get("carbs") as string) || 0,
        fat: parseFloat(formData.get("fat") as string) || 0,
        meal_category: formData.get("meal_category") as string,
    };

    const { error } = await supabase.from("meal_templates").insert(template);

    if (error) return { error: error.message };

    revalidatePath("/recipes");
    return { success: true };
}

export async function logFromTemplate(templateId: string, date: string) {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Unauthorized" };

    // Get the template
    const { data: template, error: fetchError } = await supabase
        .from("meal_templates")
        .select("*")
        .eq("id", templateId)
        .eq("user_id", user.id)
        .single();

    if (fetchError || !template) return { error: "Template not found" };

    // Create food entry from template
    const entry = {
        user_id: user.id,
        name: template.name,
        calories: template.calories,
        protein: template.protein,
        carbs: template.carbs,
        fat: template.fat,
        meal_category: template.meal_category,
        logged_at: new Date(date + "T12:00:00").toISOString(),
    };

    const { error: insertError } = await supabase.from("food_entries").insert(entry);

    if (insertError) return { error: insertError.message };

    // Update use count
    await supabase
        .from("meal_templates")
        .update({
            use_count: template.use_count + 1,
            last_used_at: new Date().toISOString(),
        })
        .eq("id", templateId)
        .eq("user_id", user.id);

    revalidatePath("/dashboard");
    revalidatePath("/recipes");
    return { success: true };
}

export async function deleteMealTemplate(id: string) {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Unauthorized" };

    const { error } = await supabase
        .from("meal_templates")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

    if (error) return { error: error.message };

    revalidatePath("/recipes");
    return { success: true };
}
