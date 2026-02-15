"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Camera, Loader2 } from "lucide-react";
import { createPantryItem, updatePantryItem } from "@/lib/actions/pantry";
import { extractNutritionFromLabel } from "@/lib/actions/ai";
import { PANTRY_CATEGORIES, COMMON_UNITS } from "@/lib/pantry-utils";
import { createClient } from "@/lib/supabase/client";
import type { PantryCategory, PantryItem } from "@/types/database";

interface PantryItemFormProps {
    item?: PantryItem;
    onSuccess: () => void;
}

export function PantryItemForm({ item, onSuccess }: PantryItemFormProps) {
    const [loading, setLoading] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [category, setCategory] = useState(item?.category || "other");
    const [baseUnit, setBaseUnit] = useState(item?.base_unit || "g");
    const [photoUrl, setPhotoUrl] = useState(item?.photo_url || "");

    const [formValues, setFormValues] = useState({
        name: item?.name || "",
        base_amount: item?.base_amount?.toString() || "100",
        calories_per_base: item?.calories_per_base?.toString() || "",
        protein_per_base: item?.protein_per_base?.toString() || "",
        carbs_per_base: item?.carbs_per_base?.toString() || "",
        fat_per_base: item?.fat_per_base?.toString() || "",
        cost_per_base: item?.cost_per_base?.toString() || "",
    });

    function updateField(field: string, value: string) {
        setFormValues((prev) => ({ ...prev, [field]: value }));
    }

    async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setScanning(true);
        try {
            const supabase = createClient();
            const fileName = `pantry-${Date.now()}-${file.name}`;
            const { data, error } = await supabase.storage
                .from("food-photos")
                .upload(fileName, file);

            if (error) {
                toast.error("Failed to upload photo");
                setScanning(false);
                return;
            }

            const { data: urlData } = supabase.storage
                .from("food-photos")
                .getPublicUrl(data.path);

            setPhotoUrl(urlData.publicUrl);
            toast.success("Photo uploaded! Click 'Extract Nutrition' to scan.");
        } catch {
            toast.error("Upload failed");
        }
        setScanning(false);
    }

    async function handleExtractNutrition() {
        if (!photoUrl) {
            toast.error("Upload a photo first");
            return;
        }

        setScanning(true);
        const result = await extractNutritionFromLabel(photoUrl);

        if (result.error) {
            toast.error(result.error);
        } else if (result.data) {
            setFormValues({
                name: result.data.name || formValues.name,
                base_amount: result.data.serving_amount?.toString() || formValues.base_amount,
                calories_per_base: result.data.calories?.toString() || "",
                protein_per_base: result.data.protein?.toString() || "",
                carbs_per_base: result.data.carbs?.toString() || "",
                fat_per_base: result.data.fat?.toString() || "",
                cost_per_base: formValues.cost_per_base,
            });
            if (result.data.serving_unit) {
                setBaseUnit(result.data.serving_unit);
            }
            toast.success("Nutrition extracted! Review and save.");
        }
        setScanning(false);
    }

    async function handleSubmit(formData: FormData) {
        setLoading(true);
        formData.set("category", category);
        formData.set("base_unit", baseUnit);
        formData.set("photo_url", photoUrl);

        const result = item
            ? await updatePantryItem(item.id, formData)
            : await createPantryItem(formData);

        if (result?.error) {
            toast.error(result.error);
        } else {
            toast.success(item ? "Pantry item updated!" : "Pantry item added!");
            onSuccess();
        }
        setLoading(false);
    }

    return (
        <form action={handleSubmit} className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="pantry-name">Name</Label>
                <Input
                    id="pantry-name"
                    name="name"
                    placeholder="e.g. Chicken Breast"
                    value={formValues.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    required
                />
            </div>

            <div className="space-y-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as PantryCategory)}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {PANTRY_CATEGORIES.map((cat) => (
                            <SelectItem key={cat.value} value={cat.value}>
                                {cat.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                    <Label htmlFor="base-amount">Base Amount</Label>
                    <Input
                        id="base-amount"
                        name="base_amount"
                        type="number"
                        min={0}
                        step="any"
                        value={formValues.base_amount}
                        onChange={(e) => updateField("base_amount", e.target.value)}
                    />
                </div>
                <div className="space-y-2">
                    <Label>Base Unit</Label>
                    <Select value={baseUnit} onValueChange={setBaseUnit}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {COMMON_UNITS.map((u) => (
                                <SelectItem key={u} value={u}>
                                    {u}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                    <Label htmlFor="cal-base">Calories</Label>
                    <Input
                        id="cal-base"
                        name="calories_per_base"
                        type="number"
                        min={0}
                        placeholder="0"
                        value={formValues.calories_per_base}
                        onChange={(e) => updateField("calories_per_base", e.target.value)}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="protein-base">Protein (g)</Label>
                    <Input
                        id="protein-base"
                        name="protein_per_base"
                        type="number"
                        min={0}
                        step={0.1}
                        placeholder="0"
                        value={formValues.protein_per_base}
                        onChange={(e) => updateField("protein_per_base", e.target.value)}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="carbs-base">Carbs (g)</Label>
                    <Input
                        id="carbs-base"
                        name="carbs_per_base"
                        type="number"
                        min={0}
                        step={0.1}
                        placeholder="0"
                        value={formValues.carbs_per_base}
                        onChange={(e) => updateField("carbs_per_base", e.target.value)}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="fat-base">Fat (g)</Label>
                    <Input
                        id="fat-base"
                        name="fat_per_base"
                        type="number"
                        min={0}
                        step={0.1}
                        placeholder="0"
                        value={formValues.fat_per_base}
                        onChange={(e) => updateField("fat_per_base", e.target.value)}
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="cost-base">Cost per base (optional)</Label>
                <Input
                    id="cost-base"
                    name="cost_per_base"
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="$0.00"
                    value={formValues.cost_per_base}
                    onChange={(e) => updateField("cost_per_base", e.target.value)}
                />
            </div>

            {/* Photo / Label Scanning */}
            <div className="space-y-2">
                <Label>Nutrition Label (optional)</Label>
                <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" asChild className="flex-1">
                        <label className="cursor-pointer">
                            <Camera className="h-4 w-4 mr-2" />
                            {photoUrl ? "Replace Photo" : "Upload Photo"}
                            <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                onChange={handlePhotoUpload}
                            />
                        </label>
                    </Button>
                    {photoUrl && (
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={handleExtractNutrition}
                            disabled={scanning}
                            className="flex-1"
                        >
                            {scanning ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : null}
                            Extract Nutrition
                        </Button>
                    )}
                </div>
                {scanning && !photoUrl && (
                    <p className="text-xs text-muted-foreground">Uploading...</p>
                )}
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
                {loading
                    ? item
                        ? "Updating..."
                        : "Adding..."
                    : item
                        ? "Update Item"
                        : "Add to Pantry"}
            </Button>
        </form>
    );
}
