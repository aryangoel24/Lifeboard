import { getRecipes } from "@/lib/actions/recipes";
import { getMealTemplates } from "@/lib/actions/meal-templates";
import { RecipesClient } from "@/components/recipes-client";

export default async function RecipesPage() {
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
