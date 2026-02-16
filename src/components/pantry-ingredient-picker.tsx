"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { ChevronsUpDown, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { scaleNutrition } from "@/lib/pantry-utils";
import type { PantryItem } from "@/types/database";

interface PantryIngredientPickerProps {
    pantryItems: PantryItem[];
    ingredient: {
        name: string;
        amount: string;
        unit: string;
        calories: string;
        protein: string;
        carbs: string;
        fat: string;
        pantryItemId: string | null;
    };
    onUpdate: (field: string, value: string) => void;
    onUpdateMultiple: (updates: Record<string, string>) => void;
}

export function PantryIngredientPicker({
    pantryItems,
    ingredient,
    onUpdate,
    onUpdateMultiple,
}: PantryIngredientPickerProps) {
    const [open, setOpen] = useState(false);

    const selectedPantryItem = useMemo(
        () => pantryItems.find((p) => p.id === ingredient.pantryItemId) || null,
        [pantryItems, ingredient.pantryItemId]
    );

    function handleSelectPantryItem(item: PantryItem) {
        onUpdateMultiple({
            name: item.name,
            unit: item.base_unit,
            pantryItemId: item.id,
        });
        setOpen(false);
        // If amount already set, auto-compute macros
        const amt = parseFloat(ingredient.amount);
        if (amt > 0) {
            computeAndFill(item, amt);
        }
    }

    function handleClearPantryItem() {
        onUpdateMultiple({
            pantryItemId: "",
        });
    }

    function handleAmountChange(value: string) {
        const amt = parseFloat(value);
        if (selectedPantryItem && amt > 0) {
            const scaled = scaleNutrition(selectedPantryItem, amt);
            onUpdateMultiple({
                amount: value,
                calories: scaled.calories.toString(),
                protein: scaled.protein.toString(),
                carbs: scaled.carbs.toString(),
                fat: scaled.fat.toString(),
            });
        } else {
            onUpdate("amount", value);
        }
    }

    function computeAndFill(item: PantryItem, amount: number) {
        const scaled = scaleNutrition(item, amount);
        onUpdateMultiple({
            calories: scaled.calories.toString(),
            protein: scaled.protein.toString(),
            carbs: scaled.carbs.toString(),
            fat: scaled.fat.toString(),
        });
    }

    return (
        <div className="space-y-2">
            <div className="flex gap-2">
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={open}
                            className="flex-1 justify-between font-normal"
                        >
                            {selectedPantryItem
                                ? selectedPantryItem.name
                                : ingredient.name || "Search pantry or type name..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0" align="start">
                        <Command>
                            <CommandInput placeholder="Search pantry..." />
                            <CommandList>
                                <CommandEmpty>
                                    No pantry items found.
                                </CommandEmpty>
                                <CommandGroup>
                                    {pantryItems.map((item) => (
                                        <CommandItem
                                            key={item.id}
                                            value={item.name}
                                            onSelect={() => handleSelectPantryItem(item)}
                                        >
                                            <Check
                                                className={cn(
                                                    "mr-2 h-4 w-4",
                                                    ingredient.pantryItemId === item.id
                                                        ? "opacity-100"
                                                        : "opacity-0"
                                                )}
                                            />
                                            <div className="flex-1 min-w-0">
                                                <p className="truncate">{item.name}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {item.calories_per_base} cal / {item.base_amount}{item.base_unit}
                                                </p>
                                            </div>
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
                {selectedPantryItem && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        onClick={handleClearPantryItem}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                )}
            </div>

            {/* Manual name input when no pantry item selected */}
            {!selectedPantryItem && (
                <Input
                    placeholder="Ingredient name (manual)"
                    value={ingredient.name}
                    onChange={(e) => onUpdate("name", e.target.value)}
                />
            )}

            {/* Amount + unit row — always visible */}
            <div className="flex gap-2 items-center">
                <Input
                    placeholder="Amount"
                    type="number"
                    min={0}
                    step="any"
                    value={ingredient.amount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    className="flex-1"
                />
                {selectedPantryItem ? (
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                        {selectedPantryItem.base_unit}
                    </span>
                ) : (
                    <Input
                        placeholder="unit"
                        value={ingredient.unit}
                        onChange={(e) => onUpdate("unit", e.target.value)}
                        className="w-20"
                    />
                )}
            </div>

            {/* Live macro preview when pantry item + amount */}
            {selectedPantryItem && parseFloat(ingredient.amount) > 0 && (
                <div className="text-xs text-muted-foreground bg-muted rounded px-2 py-1">
                    {ingredient.calories} cal &middot; {ingredient.protein}g P &middot; {ingredient.carbs}g C &middot; {ingredient.fat}g F
                </div>
            )}
        </div>
    );
}
