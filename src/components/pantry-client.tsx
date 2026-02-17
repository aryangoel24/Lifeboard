"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Card,
    CardContent,
} from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Search, Trash2, Pencil, Package, UtensilsCrossed, MoreHorizontal, ChevronDown, ChevronRight } from "lucide-react";
import { deletePantryItem, logFromPantry } from "@/lib/actions/pantry";
import { PANTRY_CATEGORIES, CATEGORY_COLORS, scaleNutrition } from "@/lib/pantry-utils";
import { getDefaultMealCategory } from "@/lib/utils";
import { PantryItemForm } from "@/components/pantry-item-form";
import type { PantryItem, PantryCategory, MealCategory } from "@/types/database";

interface PantryClientProps {
    items: PantryItem[];
}

export function PantryClient({ items }: PantryClientProps) {
    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState<PantryCategory | "all">("all");
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [editItem, setEditItem] = useState<PantryItem | null>(null);
    const [logItem, setLogItem] = useState<PantryItem | null>(null);
    const [logAmount, setLogAmount] = useState("");
    const [logMealCategory, setLogMealCategory] = useState<MealCategory>(getDefaultMealCategory());
    const [logLoading, setLogLoading] = useState(false);
    const [collapsedCategories, setCollapsedCategories] = useState<Set<PantryCategory>>(new Set());

    const logPreview = useMemo(() => {
        if (!logItem) return null;
        const amt = parseFloat(logAmount);
        if (!amt || amt <= 0) return null;
        return scaleNutrition(logItem, amt);
    }, [logItem, logAmount]);

    const filtered = useMemo(() => {
        return items.filter((item) => {
            const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
            const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
            return matchesSearch && matchesCategory;
        });
    }, [items, search, categoryFilter]);

    const groupedItems = useMemo(() => {
        if (categoryFilter !== "all") return null;
        const groups: { category: PantryCategory; label: string; items: PantryItem[] }[] = [];
        for (const cat of PANTRY_CATEGORIES) {
            const catItems = filtered.filter(item => item.category === cat.value);
            if (catItems.length > 0) {
                groups.push({ category: cat.value, label: cat.label, items: catItems });
            }
        }
        return groups;
    }, [filtered, categoryFilter]);

    function toggleCategory(cat: PantryCategory) {
        setCollapsedCategories(prev => {
            const next = new Set(prev);
            if (next.has(cat)) {
                next.delete(cat);
            } else {
                next.add(cat);
            }
            return next;
        });
    }

    async function handleDelete(id: string) {
        if (!confirm("Delete this pantry item?")) return;
        const result = await deletePantryItem(id);
        if (result?.error) {
            toast.error(result.error);
        } else {
            toast.success("Item deleted");
        }
    }

    function openLogDialog(item: PantryItem) {
        setLogItem(item);
        setLogAmount(String(item.base_amount));
        setLogMealCategory(getDefaultMealCategory());
    }

    async function handleLog() {
        if (!logItem) return;
        const amt = parseFloat(logAmount);
        if (!amt || amt <= 0) {
            toast.error("Enter a valid amount");
            return;
        }
        setLogLoading(true);
        const result = await logFromPantry(logItem.id, amt, logMealCategory);
        setLogLoading(false);
        if (result?.error) {
            toast.error(result.error);
        } else {
            toast.success(`Logged ${logItem.name}`);
            setLogItem(null);
        }
    }

    function renderCard(item: PantryItem) {
        return (
            <Card key={item.id} className={`glass-card rounded-2xl border-l-[3px] ${CATEGORY_COLORS[item.category]} hover:shadow-xl transition-all duration-200`}>
                <CardContent className="py-2.5 px-3">
                    <div className="flex items-center justify-between gap-1 mb-1">
                        <p className="font-medium truncate text-sm">{item.name}</p>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openLogDialog(item)}>
                                    <UtensilsCrossed className="h-3.5 w-3.5 mr-2" />
                                    Log
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setEditItem(item)}>
                                    <Pencil className="h-3.5 w-3.5 mr-2" />
                                    Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(item.id)}>
                                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                                    Delete
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                    <p className="text-sm">
                        <span className="font-semibold">{item.calories_per_base} cal</span>
                        <span className="text-muted-foreground text-xs">
                            {" · "}{item.protein_per_base}g P
                            {" · "}{item.carbs_per_base}g C
                            {" · "}{item.fat_per_base}g F
                        </span>
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-xs text-muted-foreground">
                            Per {item.base_amount}{item.base_unit}
                            {item.cost_per_base ? ` · $${Number(item.cost_per_base).toFixed(2)}` : ""}
                        </span>
                        {item.stock_quantity !== null && item.stock_quantity !== undefined && (
                            <>
                                <span className="text-xs text-muted-foreground">·</span>
                                <div className={`h-1.5 w-1.5 rounded-full ${item.stock_quantity <= 0 ? "bg-destructive" : item.stock_quantity < 2 ? "bg-amber-500" : "bg-green-500"}`} />
                                <span className="text-xs text-muted-foreground">
                                    {item.stock_quantity <= 0
                                        ? "Out"
                                        : `${item.stock_quantity}${item.stock_unit ? ` ${item.stock_unit}` : ""}`}
                                </span>
                            </>
                        )}
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold">Pantry</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Your ingredient library with saved nutrition data
                    </p>
                </div>
                <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Item
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>Add Pantry Item</DialogTitle>
                        </DialogHeader>
                        <PantryItemForm onSuccess={() => setCreateDialogOpen(false)} />
                    </DialogContent>
                </Dialog>
            </div>

            {/* Search & Filter */}
            <div className="space-y-3 mb-6">
                <div className="relative glass-subtle rounded-xl">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search pantry..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 border-0 bg-transparent"
                    />
                </div>
                <div className="flex flex-wrap gap-1.5">
                    <Badge
                        variant={categoryFilter === "all" ? "default" : "outline"}
                        className={`cursor-pointer ${categoryFilter === "all" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20" : ""}`}
                        onClick={() => setCategoryFilter("all")}
                    >
                        All
                    </Badge>
                    {PANTRY_CATEGORIES.map((cat) => (
                        <Badge
                            key={cat.value}
                            variant={categoryFilter === cat.value ? "default" : "outline"}
                            className={`cursor-pointer ${categoryFilter === cat.value ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20" : ""}`}
                            onClick={() => setCategoryFilter(cat.value)}
                        >
                            {cat.label}
                        </Badge>
                    ))}
                </div>
            </div>

            {/* Items */}
            {filtered.length === 0 ? (
                <Card className="glass-card rounded-2xl">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
                        <p className="text-muted-foreground font-medium">
                            {items.length === 0 ? "No pantry items yet" : "No items match your search"}
                        </p>
                        <p className="text-muted-foreground text-sm mt-1">
                            {items.length === 0
                                ? "Add ingredients to build your nutrition library"
                                : "Try a different search or category"}
                        </p>
                    </CardContent>
                </Card>
            ) : groupedItems ? (
                <div className="space-y-4">
                    {groupedItems.map((group) => (
                        <Collapsible
                            key={group.category}
                            open={!collapsedCategories.has(group.category)}
                            onOpenChange={() => toggleCategory(group.category)}
                        >
                            <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-1.5 group">
                                {collapsedCategories.has(group.category) ? (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                )}
                                <span className="font-semibold text-sm">
                                    {group.label}
                                </span>
                                <span className="text-xs text-muted-foreground">({group.items.length})</span>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-2">
                                    {group.items.map(renderCard)}
                                </div>
                            </CollapsibleContent>
                        </Collapsible>
                    ))}
                </div>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {filtered.map(renderCard)}
                </div>
            )}

            {/* Edit Dialog */}
            <Dialog open={!!editItem} onOpenChange={(open) => { if (!open) setEditItem(null); }}>
                <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Edit Pantry Item</DialogTitle>
                    </DialogHeader>
                    {editItem && (
                        <PantryItemForm
                            item={editItem}
                            onSuccess={() => setEditItem(null)}
                        />
                    )}
                </DialogContent>
            </Dialog>

            {/* Log Dialog */}
            <Dialog open={!!logItem} onOpenChange={(open) => { if (!open) setLogItem(null); }}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Log {logItem?.name}</DialogTitle>
                    </DialogHeader>
                    {logItem && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="log-amount">Amount ({logItem.base_unit})</Label>
                                <Input
                                    id="log-amount"
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={logAmount}
                                    onChange={(e) => setLogAmount(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Meal Category</Label>
                                <Select value={logMealCategory} onValueChange={(v) => setLogMealCategory(v as MealCategory)}>
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
                            {logPreview && (
                                <div className="grid grid-cols-4 gap-2 text-sm glass-subtle rounded-xl p-3">
                                    <div className="text-center">
                                        <p className="text-muted-foreground text-xs">Cal</p>
                                        <p className="font-medium">{logPreview.calories}</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-muted-foreground text-xs">P</p>
                                        <p className="font-medium">{logPreview.protein}g</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-muted-foreground text-xs">C</p>
                                        <p className="font-medium">{logPreview.carbs}g</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-muted-foreground text-xs">F</p>
                                        <p className="font-medium">{logPreview.fat}g</p>
                                    </div>
                                </div>
                            )}
                            <Button onClick={handleLog} disabled={logLoading} className="w-full">
                                {logLoading ? "Logging..." : "Log Entry"}
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
