import { getRecipes } from "@/lib/actions/recipes";
import { getMealTemplates } from "@/lib/actions/meal-templates";
import { getPantryItems } from "@/lib/actions/pantry";
import { RecipesClient } from "@/components/recipes-client";

export default async function RecipesPage() {
    const [recipes, templates, pantryItems] = await Promise.all([
        getRecipes(),
        getMealTemplates(),
        getPantryItems(),
    ]);

    return (
        <div className="max-w-4xl mx-auto">
            <RecipesClient
                recipes={recipes}
                templates={templates}
                pantryItems={pantryItems}
            />
        </div>
    );
}
