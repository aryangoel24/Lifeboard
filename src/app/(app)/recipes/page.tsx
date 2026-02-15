import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRecipes } from "@/lib/actions/recipes";
import { getMealTemplates } from "@/lib/actions/meal-templates";
import { RecipesClient } from "@/components/recipes-client";

export default async function RecipesPage() {
    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const [recipes, templates] = await Promise.all([
        getRecipes(),
        getMealTemplates(),
    ]);

    return (
        <div className="max-w-4xl mx-auto">
            <RecipesClient
                recipes={recipes}
                templates={templates}
            />
        </div>
    );
}
