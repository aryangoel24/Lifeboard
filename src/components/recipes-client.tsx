"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Clock, ChefHat, Utensils, BookOpen, UtensilsCrossed, Search, ChevronDown, ChevronUp, Pencil, Bookmark } from "lucide-react";
import { createRecipe, deleteRecipe, logFromRecipe, updateRecipe } from "@/lib/actions/recipes";
import {
    createMealTemplate,
    logFromTemplate,
    deleteMealTemplate,
    addRecipeAsTemplate,
} from "@/lib/actions/meal-templates";
import { formatDate } from "@/lib/utils";
import type { Recipe, RecipeIngredient, MealTemplate, MealCategory, PantryItem } from "@/types/database";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { PantryIngredientPicker } from "@/components/pantry-ingredient-picker";

interface RecipesClientProps {
    recipes: (Recipe & { ingredients: RecipeIngredient[] })[];
    templates: MealTemplate[];
    pantryItems?: PantryItem[];
}

type IngredientInput = {
    name: string;
    amount: string;
    unit: string;
    calories: string;
    protein: string;
    carbs: string;
    fat: string;
    pantryItemId: string | null;
};

const EMPTY_INGREDIENT: IngredientInput = {
    name: "",
    amount: "",
    unit: "",
    calories: "",
    protein: "",
    carbs: "",
    fat: "",
    pantryItemId: null,
};

function recipeToIngredientInputs(ingredients: RecipeIngredient[]): IngredientInput[] {
    if (ingredients.length === 0) return [{ ...EMPTY_INGREDIENT }];
    return ingredients.map((ing) => ({
        name: ing.name,
        amount: ing.amount?.toString() || "",
        unit: ing.unit || "",
        calories: ing.calories?.toString() || "",
        protein: ing.protein?.toString() || "",
        carbs: ing.carbs?.toString() || "",
        fat: ing.fat?.toString() || "",
        pantryItemId: ing.pantry_item_id || null,
    }));
}

export function RecipesClient({
    recipes,
    templates,
    pantryItems = [],
}: RecipesClientProps) {
    const [recipeDialogOpen, setRecipeDialogOpen] = useState(false);
    const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
    const [logDialogRecipe, setLogDialogRecipe] = useState<(Recipe & { ingredients: RecipeIngredient[] }) | null>(null);
    const [logServings, setLogServings] = useState(1);
    const [ingredients, setIngredients] = useState<IngredientInput[]>([
        { ...EMPTY_INGREDIENT },
    ]);
    const [loading, setLoading] = useState(false);
    const [templateMealCategory, setTemplateMealCategory] = useState<MealCategory>("lunch");
    const [recipeSearch, setRecipeSearch] = useState("");
    const [expandedRecipes, setExpandedRecipes] = useState<Set<string>>(new Set());
    const [editRecipe, setEditRecipe] = useState<(Recipe & { ingredients: RecipeIngredient[] }) | null>(null);
    const [editIngredients, setEditIngredients] = useState<IngredientInput[]>([{ ...EMPTY_INGREDIENT }]);
    const [templateRecipe, setTemplateRecipe] = useState<(Recipe & { ingredients: RecipeIngredient[] }) | null>(null);
    const [templateCategory, setTemplateCategory] = useState<MealCategory>("lunch");

    const filteredRecipes = useMemo(() => {
        if (!recipeSearch.trim()) return recipes;
        const q = recipeSearch.toLowerCase();
        return recipes.filter(
            (r) =>
                r.name.toLowerCase().includes(q) ||
                r.tags?.some((t) => t.toLowerCase().includes(q))
        );
    }, [recipes, recipeSearch]);

    function toggleRecipeExpanded(id: string) {
        setExpandedRecipes((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function addIngredient() {
        setIngredients([...ingredients, { ...EMPTY_INGREDIENT }]);
    }

    function removeIngredient(index: number) {
        setIngredients(ingredients.filter((_, i) => i !== index));
    }

    function updateIngredient(
        index: number,
        field: keyof IngredientInput,
        value: string
    ) {
        const updated = [...ingredients];
        updated[index] = { ...updated[index], [field]: value };
        setIngredients(updated);
    }

    function updateIngredientMultiple(
        index: number,
        updates: Record<string, string>
    ) {
        const updated = [...ingredients];
        updated[index] = { ...updated[index], ...updates };
        setIngredients(updated);
    }

    // Edit ingredient helpers
    function addEditIngredient() {
        setEditIngredients([...editIngredients, { ...EMPTY_INGREDIENT }]);
    }

    function removeEditIngredient(index: number) {
        setEditIngredients(editIngredients.filter((_, i) => i !== index));
    }

    function updateEditIngredient(
        index: number,
        field: keyof IngredientInput,
        value: string
    ) {
        const updated = [...editIngredients];
        updated[index] = { ...updated[index], [field]: value };
        setEditIngredients(updated);
    }

    function updateEditIngredientMultiple(
        index: number,
        updates: Record<string, string>
    ) {
        const updated = [...editIngredients];
        updated[index] = { ...updated[index], ...updates };
        setEditIngredients(updated);
    }

    async function handleCreateRecipe(formData: FormData) {
        setLoading(true);
        const validIngredients = ingredients
            .filter((i) => i.name.trim())
            .map((i) => ({
                name: i.name,
                amount: parseFloat(i.amount) || 0,
                unit: i.unit,
                calories: parseInt(i.calories) || 0,
                protein: parseFloat(i.protein) || 0,
                carbs: parseFloat(i.carbs) || 0,
                fat: parseFloat(i.fat) || 0,
                pantryItemId: i.pantryItemId || null,
            }));

        formData.set("ingredients", JSON.stringify(validIngredients));

        const result = await createRecipe(formData);
        if (result?.error) {
            toast.error(result.error);
        } else {
            toast.success("Recipe created!");
            setRecipeDialogOpen(false);
            setIngredients([{ ...EMPTY_INGREDIENT }]);
        }
        setLoading(false);
    }

    async function handleUpdateRecipe(formData: FormData) {
        if (!editRecipe) return;
        setLoading(true);
        const validIngredients = editIngredients
            .filter((i) => i.name.trim())
            .map((i) => ({
                name: i.name,
                amount: parseFloat(i.amount) || 0,
                unit: i.unit,
                calories: parseInt(i.calories) || 0,
                protein: parseFloat(i.protein) || 0,
                carbs: parseFloat(i.carbs) || 0,
                fat: parseFloat(i.fat) || 0,
                pantryItemId: i.pantryItemId || null,
            }));

        formData.set("ingredients", JSON.stringify(validIngredients));

        const result = await updateRecipe(editRecipe.id, formData);
        if (result?.error) {
            toast.error(result.error);
        } else {
            toast.success("Recipe updated!");
            setEditRecipe(null);
        }
        setLoading(false);
    }

    async function handleDeleteRecipe(id: string) {
        if (!confirm("Delete this recipe?")) return;
        const result = await deleteRecipe(id);
        if (result?.error) {
            toast.error(result.error);
        } else {
            toast.success("Recipe deleted");
        }
    }

    async function handleLogRecipe() {
        if (!logDialogRecipe) return;
        setLoading(true);
        const today = formatDate(new Date());
        const result = await logFromRecipe(logDialogRecipe.id, logServings, today);
        if (result?.error) {
            toast.error(result.error);
        } else {
            toast.success("Logged from recipe!");
            setLogDialogRecipe(null);
            setLogServings(1);
        }
        setLoading(false);
    }

    async function handleCreateTemplate(formData: FormData) {
        setLoading(true);
        formData.set("meal_category", templateMealCategory);
        const result = await createMealTemplate(formData);
        if (result?.error) {
            toast.error(result.error);
        } else {
            toast.success("Template saved!");
            setTemplateDialogOpen(false);
        }
        setLoading(false);
    }

    async function handleLogTemplate(templateId: string) {
        const today = formatDate(new Date());
        const result = await logFromTemplate(templateId, today);
        if (result?.error) {
            toast.error(result.error);
        } else {
            toast.success("Logged from template!");
        }
    }

    async function handleDeleteTemplate(id: string) {
        if (!confirm("Delete this template?")) return;
        const result = await deleteMealTemplate(id);
        if (result?.error) {
            toast.error(result.error);
        } else {
            toast.success("Template deleted");
        }
    }

    async function handleAddToTemplate(mealCategory: MealCategory) {
        if (!templateRecipe) return;
        setLoading(true);
        const result = await addRecipeAsTemplate(templateRecipe.id, mealCategory);
        if (result?.error) {
            toast.error(result.error);
        } else {
            toast.success("Added to Quick Templates");
            setTemplateRecipe(null);
        }
        setLoading(false);
    }

    function renderIngredientForm(
        ings: IngredientInput[],
        addFn: () => void,
        removeFn: (i: number) => void,
        updateFn: (i: number, field: keyof IngredientInput, value: string) => void,
        updateMultiFn: (i: number, updates: Record<string, string>) => void
    ) {
        return (
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <Label className="text-base">Ingredients</Label>
                    <Button type="button" variant="ghost" size="sm" onClick={addFn}>
                        <Plus className="h-3 w-3 mr-1" />
                        Add
                    </Button>
                </div>
                {ings.map((ing, idx) => (
                    <div key={idx} className="border rounded-lg p-3 space-y-2 relative">
                        {ings.length > 1 && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute top-1 right-1 h-6 w-6"
                                onClick={() => removeFn(idx)}
                            >
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        )}
                        {pantryItems.length > 0 ? (
                            <PantryIngredientPicker
                                pantryItems={pantryItems}
                                ingredient={ing}
                                onUpdate={(field, value) => updateFn(idx, field as keyof IngredientInput, value)}
                                onUpdateMultiple={(updates) => updateMultiFn(idx, updates)}
                            />
                        ) : (
                            <Input
                                placeholder="Ingredient name"
                                value={ing.name}
                                onChange={(e) => updateFn(idx, "name", e.target.value)}
                            />
                        )}
                        <div className="grid grid-cols-4 gap-2">
                            <Input placeholder="Cal" type="number" value={ing.calories} onChange={(e) => updateFn(idx, "calories", e.target.value)} />
                            <Input placeholder="P (g)" type="number" value={ing.protein} onChange={(e) => updateFn(idx, "protein", e.target.value)} />
                            <Input placeholder="C (g)" type="number" value={ing.carbs} onChange={(e) => updateFn(idx, "carbs", e.target.value)} />
                            <Input placeholder="F (g)" type="number" value={ing.fat} onChange={(e) => updateFn(idx, "fat", e.target.value)} />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold">Recipes & Templates</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Save your favorite meals for quick logging
                    </p>
                </div>
            </div>

            <Tabs defaultValue="recipes" className="space-y-4">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="recipes" className="gap-2">
                        <BookOpen className="h-4 w-4" />
                        Recipes ({recipes.length})
                    </TabsTrigger>
                    <TabsTrigger value="templates" className="gap-2">
                        <Utensils className="h-4 w-4" />
                        Quick Templates ({templates.length})
                    </TabsTrigger>
                </TabsList>

                {/* Recipes Tab */}
                <TabsContent value="recipes" className="space-y-4">
                    {/* Search */}
                    {recipes.length > 0 && (
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search recipes..."
                                value={recipeSearch}
                                onChange={(e) => setRecipeSearch(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                    )}

                    <Dialog open={recipeDialogOpen} onOpenChange={setRecipeDialogOpen}>
                        <DialogTrigger asChild>
                            <Button className="w-full" variant="outline">
                                <Plus className="h-4 w-4 mr-2" />
                                New Recipe
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle>Create Recipe</DialogTitle>
                            </DialogHeader>
                            <form action={handleCreateRecipe} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="recipe-name">Recipe Name</Label>
                                    <Input id="recipe-name" name="name" placeholder="e.g. Chicken Stir Fry" required />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-2">
                                        <Label htmlFor="servings">Servings</Label>
                                        <Input id="servings" name="servings" type="number" min={1} defaultValue={1} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="prep-time">Prep Time (min)</Label>
                                        <Input id="prep-time" name="prep_time_minutes" type="number" min={0} placeholder="30" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="tags">Tags (comma-separated)</Label>
                                    <Input id="tags" name="tags" placeholder="e.g. high-protein, quick, Asian" />
                                </div>
                                {renderIngredientForm(ingredients, addIngredient, removeIngredient, updateIngredient, updateIngredientMultiple)}
                                <Button type="submit" className="w-full" disabled={loading}>
                                    {loading ? "Creating..." : "Create Recipe"}
                                </Button>
                            </form>
                        </DialogContent>
                    </Dialog>

                    {filteredRecipes.length === 0 ? (
                        <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                                <ChefHat className="h-12 w-12 text-muted-foreground/50 mb-4" />
                                <p className="text-muted-foreground font-medium">
                                    {recipes.length === 0 ? "No recipes yet" : "No recipes match your search"}
                                </p>
                                <p className="text-muted-foreground text-sm mt-1">
                                    {recipes.length === 0
                                        ? "Create your first recipe to get started"
                                        : "Try a different search term"}
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                            {filteredRecipes.map((recipe) => {
                                const isExpanded = expandedRecipes.has(recipe.id);
                                return (
                                    <Card
                                        key={recipe.id}
                                        className="shadow-sm hover:shadow-md transition-shadow"
                                    >
                                        <CardHeader className="pb-2">
                                            <div className="flex items-start justify-between">
                                                <CardTitle className="text-base">{recipe.name}</CardTitle>
                                                <div className="flex gap-1">
                                                    <Button
                                                        variant="default"
                                                        size="sm"
                                                        className="h-7 text-xs"
                                                        onClick={() => {
                                                            setLogDialogRecipe(recipe);
                                                            setLogServings(1);
                                                        }}
                                                    >
                                                        <UtensilsCrossed className="h-3 w-3 mr-1" />
                                                        Log
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7"
                                                        onClick={() => {
                                                            setEditRecipe(recipe);
                                                            setEditIngredients(recipeToIngredientInputs(recipe.ingredients));
                                                        }}
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7"
                                                        onClick={() => {
                                                            setTemplateRecipe(recipe);
                                                            setTemplateCategory("lunch");
                                                        }}
                                                    >
                                                        <Bookmark className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 text-destructive"
                                                        onClick={() => handleDeleteRecipe(recipe.id)}
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </div>
                                            <CardDescription className="flex items-center gap-3">
                                                {recipe.prep_time_minutes && (
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="h-3 w-3" />
                                                        {recipe.prep_time_minutes}m
                                                    </span>
                                                )}
                                                <span>{recipe.servings} serving{recipe.servings !== 1 ? "s" : ""}</span>
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="grid grid-cols-4 gap-2 text-sm">
                                                <div>
                                                    <p className="text-muted-foreground text-xs">Calories</p>
                                                    <p className="font-medium">{recipe.total_calories}</p>
                                                </div>
                                                <div>
                                                    <p className="text-muted-foreground text-xs">Protein</p>
                                                    <p className="font-medium">{Math.round(recipe.total_protein)}g</p>
                                                </div>
                                                <div>
                                                    <p className="text-muted-foreground text-xs">Carbs</p>
                                                    <p className="font-medium">{Math.round(recipe.total_carbs)}g</p>
                                                </div>
                                                <div>
                                                    <p className="text-muted-foreground text-xs">Fat</p>
                                                    <p className="font-medium">{Math.round(recipe.total_fat)}g</p>
                                                </div>
                                            </div>
                                            {recipe.servings > 1 && (
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    Per serving: {Math.round(recipe.total_calories / recipe.servings)} cal
                                                    {" \u2022 "}
                                                    {Math.round(recipe.total_protein / recipe.servings)}g P
                                                    {" \u2022 "}
                                                    {Math.round(recipe.total_carbs / recipe.servings)}g C
                                                    {" \u2022 "}
                                                    {Math.round(recipe.total_fat / recipe.servings)}g F
                                                </p>
                                            )}

                                            {/* Expandable Ingredients */}
                                            {recipe.ingredients.length > 0 && (
                                                <button
                                                    type="button"
                                                    className="flex items-center gap-1 text-xs text-muted-foreground mt-2 hover:text-foreground transition-colors"
                                                    onClick={() => toggleRecipeExpanded(recipe.id)}
                                                >
                                                    {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                                    {recipe.ingredients.length} ingredient{recipe.ingredients.length !== 1 ? "s" : ""}
                                                </button>
                                            )}
                                            {isExpanded && recipe.ingredients.length > 0 && (
                                                <div className="mt-2 space-y-1 text-xs border-t pt-2">
                                                    {recipe.ingredients.map((ing) => (
                                                        <div key={ing.id} className="flex justify-between text-muted-foreground">
                                                            <span>
                                                                {ing.amount ? `${ing.amount}${ing.unit ? ` ${ing.unit}` : ""} ` : ""}
                                                                {ing.name}
                                                            </span>
                                                            <span className="shrink-0 ml-2">
                                                                {ing.calories}cal
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {recipe.tags && recipe.tags.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-3">
                                                    {recipe.tags.map((tag) => (
                                                        <Badge key={tag} variant="secondary" className="text-xs">
                                                            {tag}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </TabsContent>

                {/* Templates Tab */}
                <TabsContent value="templates" className="space-y-4">
                    <Dialog
                        open={templateDialogOpen}
                        onOpenChange={setTemplateDialogOpen}
                    >
                        <DialogTrigger asChild>
                            <Button className="w-full" variant="outline">
                                <Plus className="h-4 w-4 mr-2" />
                                New Template
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Create Meal Template</DialogTitle>
                            </DialogHeader>
                            <form action={handleCreateTemplate} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="template-name">Name</Label>
                                    <Input id="template-name" name="name" placeholder="e.g. Morning Oatmeal" required />
                                </div>
                                <div className="space-y-2">
                                    <Label>Meal</Label>
                                    <Select value={templateMealCategory} onValueChange={(v) => setTemplateMealCategory(v as MealCategory)}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="breakfast">Breakfast</SelectItem>
                                            <SelectItem value="lunch">Lunch</SelectItem>
                                            <SelectItem value="dinner">Dinner</SelectItem>
                                            <SelectItem value="snack">Snack</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-2">
                                        <Label htmlFor="template-calories">Calories</Label>
                                        <Input id="template-calories" name="calories" type="number" min={0} placeholder="0" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="template-protein">Protein (g)</Label>
                                        <Input id="template-protein" name="protein" type="number" min={0} step={0.1} placeholder="0" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="template-carbs">Carbs (g)</Label>
                                        <Input id="template-carbs" name="carbs" type="number" min={0} step={0.1} placeholder="0" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="template-fat">Fat (g)</Label>
                                        <Input id="template-fat" name="fat" type="number" min={0} step={0.1} placeholder="0" />
                                    </div>
                                </div>
                                <Button type="submit" className="w-full" disabled={loading}>
                                    {loading ? "Saving..." : "Save Template"}
                                </Button>
                            </form>
                        </DialogContent>
                    </Dialog>

                    {templates.length === 0 ? (
                        <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                                <Utensils className="h-12 w-12 text-muted-foreground/50 mb-4" />
                                <p className="text-muted-foreground font-medium">No templates yet</p>
                                <p className="text-muted-foreground text-sm mt-1">
                                    Save frequently logged meals as templates for one-tap logging
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-2">
                            {templates.map((template) => (
                                <Card key={template.id} className="shadow-sm hover:shadow-md transition-shadow">
                                    <CardContent className="py-3 px-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="font-medium truncate">{template.name}</p>
                                                    <Badge variant="secondary" className="text-xs shrink-0">
                                                        {template.meal_category}
                                                    </Badge>
                                                </div>
                                                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                                    <span>{template.calories} cal</span>
                                                    <span>{Math.round(template.protein)}g P</span>
                                                    <span>{Math.round(template.carbs)}g C</span>
                                                    <span>{Math.round(template.fat)}g F</span>
                                                    {template.use_count > 0 && (
                                                        <span>
                                                            {"\u2022"} Logged {template.use_count}x
                                                        </span>
                                                    )}
                                                    {template.last_used_at && (
                                                        <span className="hidden sm:inline">
                                                            {"\u2022"} Last: {new Date(template.last_used_at).toLocaleDateString()}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex gap-1 ml-2">
                                                <Button variant="default" size="sm" onClick={() => handleLogTemplate(template.id)}>
                                                    Log
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteTemplate(template.id)}>
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            {/* Log from Recipe Dialog */}
            <Dialog open={!!logDialogRecipe} onOpenChange={(open) => { if (!open) setLogDialogRecipe(null); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Log from Recipe</DialogTitle>
                    </DialogHeader>
                    {logDialogRecipe && (() => {
                        const perServing = {
                            calories: Math.round(logDialogRecipe.total_calories / logDialogRecipe.servings),
                            protein: Math.round(logDialogRecipe.total_protein / logDialogRecipe.servings),
                            carbs: Math.round(logDialogRecipe.total_carbs / logDialogRecipe.servings),
                            fat: Math.round(logDialogRecipe.total_fat / logDialogRecipe.servings),
                        };
                        return (
                            <div className="space-y-4">
                                <div>
                                    <p className="font-medium">{logDialogRecipe.name}</p>
                                    <p className="text-sm text-muted-foreground">
                                        Per serving: {perServing.calories} cal {"\u2022"} {perServing.protein}g P {"\u2022"} {perServing.carbs}g C {"\u2022"} {perServing.fat}g F
                                    </p>
                                </div>

                                {/* Ingredient list in log dialog */}
                                {logDialogRecipe.ingredients.length > 0 && (
                                    <div className="text-xs space-y-1 border rounded-lg p-3 bg-muted/50">
                                        <p className="font-medium text-sm mb-1">Ingredients</p>
                                        {logDialogRecipe.ingredients.map((ing) => (
                                            <div key={ing.id} className="flex justify-between text-muted-foreground">
                                                <span>
                                                    {ing.amount ? `${ing.amount}${ing.unit ? ` ${ing.unit}` : ""} ` : ""}
                                                    {ing.name}
                                                </span>
                                                <span className="shrink-0 ml-2">
                                                    {ing.calories}cal {"\u2022"} {Math.round(ing.protein)}g P
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <Label htmlFor="log-servings">Servings</Label>
                                    <Input
                                        id="log-servings"
                                        type="number"
                                        min={0.5}
                                        step={0.5}
                                        value={logServings}
                                        onChange={(e) => setLogServings(parseFloat(e.target.value) || 1)}
                                    />
                                </div>
                                <div className="grid grid-cols-4 gap-2 text-sm rounded-lg bg-muted p-3">
                                    <div>
                                        <p className="text-muted-foreground text-xs">Calories</p>
                                        <p className="font-medium">{Math.round(perServing.calories * logServings)}</p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground text-xs">Protein</p>
                                        <p className="font-medium">{Math.round(perServing.protein * logServings)}g</p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground text-xs">Carbs</p>
                                        <p className="font-medium">{Math.round(perServing.carbs * logServings)}g</p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground text-xs">Fat</p>
                                        <p className="font-medium">{Math.round(perServing.fat * logServings)}g</p>
                                    </div>
                                </div>
                                <Button className="w-full" onClick={handleLogRecipe} disabled={loading}>
                                    {loading ? "Logging..." : "Log Entry"}
                                </Button>
                            </div>
                        );
                    })()}
                </DialogContent>
            </Dialog>

            {/* Edit Recipe Dialog */}
            <Dialog open={!!editRecipe} onOpenChange={(open) => { if (!open) setEditRecipe(null); }}>
                <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Edit Recipe</DialogTitle>
                    </DialogHeader>
                    {editRecipe && (
                        <form action={handleUpdateRecipe} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="edit-recipe-name">Recipe Name</Label>
                                <Input id="edit-recipe-name" name="name" defaultValue={editRecipe.name} required />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <Label htmlFor="edit-servings">Servings</Label>
                                    <Input id="edit-servings" name="servings" type="number" min={1} defaultValue={editRecipe.servings} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="edit-prep-time">Prep Time (min)</Label>
                                    <Input id="edit-prep-time" name="prep_time_minutes" type="number" min={0} defaultValue={editRecipe.prep_time_minutes || ""} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-tags">Tags (comma-separated)</Label>
                                <Input id="edit-tags" name="tags" defaultValue={editRecipe.tags?.join(", ") || ""} />
                            </div>
                            {renderIngredientForm(editIngredients, addEditIngredient, removeEditIngredient, updateEditIngredient, updateEditIngredientMultiple)}
                            <Button type="submit" className="w-full" disabled={loading}>
                                {loading ? "Saving..." : "Save Changes"}
                            </Button>
                        </form>
                    )}
                </DialogContent>
            </Dialog>

            {/* Save as Quick Template Dialog */}
            <Dialog open={!!templateRecipe} onOpenChange={(open) => { if (!open) setTemplateRecipe(null); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add to Quick Templates</DialogTitle>
                    </DialogHeader>
                    {templateRecipe && (
                        <div className="space-y-4">
                            <div>
                                <Label>Recipe</Label>
                                <p className="mt-1 text-sm font-medium">{templateRecipe.name}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Per serving: {Math.round(templateRecipe.total_calories / templateRecipe.servings)} cal
                                    {" \u2022 "}
                                    {Math.round(templateRecipe.total_protein / templateRecipe.servings)}g P
                                    {" \u2022 "}
                                    {Math.round(templateRecipe.total_carbs / templateRecipe.servings)}g C
                                    {" \u2022 "}
                                    {Math.round(templateRecipe.total_fat / templateRecipe.servings)}g F
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label>Meal Category</Label>
                                <Select value={templateCategory} onValueChange={(v) => setTemplateCategory(v as MealCategory)}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="breakfast">Breakfast</SelectItem>
                                        <SelectItem value="lunch">Lunch</SelectItem>
                                        <SelectItem value="dinner">Dinner</SelectItem>
                                        <SelectItem value="snack">Snack</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button className="w-full" onClick={() => handleAddToTemplate(templateCategory)} disabled={loading}>
                                {loading ? "Saving..." : "Add Template"}
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
