"use client";

import { useState } from "react";
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
import { Plus, Trash2, Clock, ChefHat, Utensils, BookOpen } from "lucide-react";
import { createRecipe, deleteRecipe } from "@/lib/actions/recipes";
import {
    createMealTemplate,
    logFromTemplate,
    deleteMealTemplate,
} from "@/lib/actions/meal-templates";
import { formatDate } from "@/lib/utils";
import type { Recipe, MealTemplate, MealCategory } from "@/types/database";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface RecipesClientProps {
    recipes: Recipe[];
    templates: MealTemplate[];
}

type IngredientInput = {
    name: string;
    amount: string;
    unit: string;
    calories: string;
    protein: string;
    carbs: string;
    fat: string;
};

const EMPTY_INGREDIENT: IngredientInput = {
    name: "",
    amount: "",
    unit: "",
    calories: "",
    protein: "",
    carbs: "",
    fat: "",
};

export function RecipesClient({
    recipes,
    templates,
}: RecipesClientProps) {
    const [recipeDialogOpen, setRecipeDialogOpen] = useState(false);
    const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
    const [ingredients, setIngredients] = useState<IngredientInput[]>([
        { ...EMPTY_INGREDIENT },
    ]);
    const [loading, setLoading] = useState(false);
    const [templateMealCategory, setTemplateMealCategory] = useState<MealCategory>("lunch");

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

    async function handleDeleteRecipe(id: string) {
        if (!confirm("Delete this recipe?")) return;
        const result = await deleteRecipe(id);
        if (result?.error) {
            toast.error(result.error);
        } else {
            toast.success("Recipe deleted");
        }
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
                                    <Input
                                        id="recipe-name"
                                        name="name"
                                        placeholder="e.g. Chicken Stir Fry"
                                        required
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-2">
                                        <Label htmlFor="servings">Servings</Label>
                                        <Input
                                            id="servings"
                                            name="servings"
                                            type="number"
                                            min={1}
                                            defaultValue={1}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="prep-time">Prep Time (min)</Label>
                                        <Input
                                            id="prep-time"
                                            name="prep_time_minutes"
                                            type="number"
                                            min={0}
                                            placeholder="30"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="tags">Tags (comma-separated)</Label>
                                    <Input
                                        id="tags"
                                        name="tags"
                                        placeholder="e.g. high-protein, quick, Asian"
                                    />
                                </div>

                                {/* Ingredients */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-base">Ingredients</Label>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={addIngredient}
                                        >
                                            <Plus className="h-3 w-3 mr-1" />
                                            Add
                                        </Button>
                                    </div>
                                    {ingredients.map((ing, idx) => (
                                        <div
                                            key={idx}
                                            className="border rounded-lg p-3 space-y-2 relative"
                                        >
                                            {ingredients.length > 1 && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="absolute top-1 right-1 h-6 w-6"
                                                    onClick={() => removeIngredient(idx)}
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            )}
                                            <Input
                                                placeholder="Ingredient name"
                                                value={ing.name}
                                                onChange={(e) =>
                                                    updateIngredient(idx, "name", e.target.value)
                                                }
                                            />
                                            <div className="grid grid-cols-4 gap-2">
                                                <Input
                                                    placeholder="Cal"
                                                    type="number"
                                                    value={ing.calories}
                                                    onChange={(e) =>
                                                        updateIngredient(idx, "calories", e.target.value)
                                                    }
                                                />
                                                <Input
                                                    placeholder="P (g)"
                                                    type="number"
                                                    value={ing.protein}
                                                    onChange={(e) =>
                                                        updateIngredient(idx, "protein", e.target.value)
                                                    }
                                                />
                                                <Input
                                                    placeholder="C (g)"
                                                    type="number"
                                                    value={ing.carbs}
                                                    onChange={(e) =>
                                                        updateIngredient(idx, "carbs", e.target.value)
                                                    }
                                                />
                                                <Input
                                                    placeholder="F (g)"
                                                    type="number"
                                                    value={ing.fat}
                                                    onChange={(e) =>
                                                        updateIngredient(idx, "fat", e.target.value)
                                                    }
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <Button type="submit" className="w-full" disabled={loading}>
                                    {loading ? "Creating..." : "Create Recipe"}
                                </Button>
                            </form>
                        </DialogContent>
                    </Dialog>

                    {recipes.length === 0 ? (
                        <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                                <ChefHat className="h-12 w-12 text-muted-foreground/50 mb-4" />
                                <p className="text-muted-foreground font-medium">
                                    No recipes yet
                                </p>
                                <p className="text-muted-foreground text-sm mt-1">
                                    Create your first recipe to get started
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                            {recipes.map((recipe) => (
                                <Card
                                    key={recipe.id}
                                    className="shadow-sm hover:shadow-md transition-shadow"
                                >
                                    <CardHeader className="pb-2">
                                        <div className="flex items-start justify-between">
                                            <CardTitle className="text-base">{recipe.name}</CardTitle>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-destructive"
                                                onClick={() => handleDeleteRecipe(recipe.id)}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
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
                                                <p className="text-muted-foreground text-xs">
                                                    Calories
                                                </p>
                                                <p className="font-medium">{recipe.total_calories}</p>
                                            </div>
                                            <div>
                                                <p className="text-muted-foreground text-xs">Protein</p>
                                                <p className="font-medium">
                                                    {Math.round(recipe.total_protein)}g
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-muted-foreground text-xs">Carbs</p>
                                                <p className="font-medium">
                                                    {Math.round(recipe.total_carbs)}g
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-muted-foreground text-xs">Fat</p>
                                                <p className="font-medium">
                                                    {Math.round(recipe.total_fat)}g
                                                </p>
                                            </div>
                                        </div>
                                        {recipe.tags && recipe.tags.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-3">
                                                {recipe.tags.map((tag) => (
                                                    <Badge
                                                        key={tag}
                                                        variant="secondary"
                                                        className="text-xs"
                                                    >
                                                        {tag}
                                                    </Badge>
                                                ))}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            ))}
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
                                    <Input
                                        id="template-name"
                                        name="name"
                                        placeholder="e.g. Morning Oatmeal"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Meal</Label>
                                    <Select
                                        value={templateMealCategory}
                                        onValueChange={(v) => setTemplateMealCategory(v as MealCategory)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
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
                                        <Input
                                            id="template-calories"
                                            name="calories"
                                            type="number"
                                            min={0}
                                            placeholder="0"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="template-protein">Protein (g)</Label>
                                        <Input
                                            id="template-protein"
                                            name="protein"
                                            type="number"
                                            min={0}
                                            step={0.1}
                                            placeholder="0"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="template-carbs">Carbs (g)</Label>
                                        <Input
                                            id="template-carbs"
                                            name="carbs"
                                            type="number"
                                            min={0}
                                            step={0.1}
                                            placeholder="0"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="template-fat">Fat (g)</Label>
                                        <Input
                                            id="template-fat"
                                            name="fat"
                                            type="number"
                                            min={0}
                                            step={0.1}
                                            placeholder="0"
                                        />
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
                                <p className="text-muted-foreground font-medium">
                                    No templates yet
                                </p>
                                <p className="text-muted-foreground text-sm mt-1">
                                    Save frequently logged meals as templates for one-tap logging
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-2">
                            {templates.map((template) => (
                                <Card
                                    key={template.id}
                                    className="shadow-sm hover:shadow-md transition-shadow"
                                >
                                    <CardContent className="py-3 px-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="font-medium truncate">
                                                        {template.name}
                                                    </p>
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
                                                        <span>• Logged {template.use_count}x</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex gap-1 ml-2">
                                                <Button
                                                    variant="default"
                                                    size="sm"
                                                    onClick={() => handleLogTemplate(template.id)}
                                                >
                                                    Log
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-destructive"
                                                    onClick={() => handleDeleteTemplate(template.id)}
                                                >
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
        </div>
    );
}
