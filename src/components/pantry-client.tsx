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
import { toast } from "sonner";
import { Plus, Search, Trash2, Pencil, Package } from "lucide-react";
import { deletePantryItem } from "@/lib/actions/pantry";
import { PANTRY_CATEGORIES } from "@/lib/pantry-utils";
import { PantryItemForm } from "@/components/pantry-item-form";
import type { PantryItem, PantryCategory } from "@/types/database";

interface PantryClientProps {
    items: PantryItem[];
}

export function PantryClient({ items }: PantryClientProps) {
    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState<PantryCategory | "all">("all");
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [editItem, setEditItem] = useState<PantryItem | null>(null);

    const filtered = useMemo(() => {
        return items.filter((item) => {
            const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
            const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
            return matchesSearch && matchesCategory;
        });
    }, [items, search, categoryFilter]);

    async function handleDelete(id: string) {
        if (!confirm("Delete this pantry item?")) return;
        const result = await deletePantryItem(id);
        if (result?.error) {
            toast.error(result.error);
        } else {
            toast.success("Item deleted");
        }
    }

    function getCategoryLabel(cat: PantryCategory) {
        return PANTRY_CATEGORIES.find((c) => c.value === cat)?.label || cat;
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
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search pantry..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                    />
                </div>
                <div className="flex flex-wrap gap-1.5">
                    <Badge
                        variant={categoryFilter === "all" ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => setCategoryFilter("all")}
                    >
                        All
                    </Badge>
                    {PANTRY_CATEGORIES.map((cat) => (
                        <Badge
                            key={cat.value}
                            variant={categoryFilter === cat.value ? "default" : "outline"}
                            className="cursor-pointer"
                            onClick={() => setCategoryFilter(cat.value)}
                        >
                            {cat.label}
                        </Badge>
                    ))}
                </div>
            </div>

            {/* Items Grid */}
            {filtered.length === 0 ? (
                <Card>
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
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {filtered.map((item) => (
                        <Card key={item.id} className="shadow-sm hover:shadow-md transition-shadow">
                            <CardContent className="py-3 px-4">
                                <div className="flex items-start justify-between mb-2">
                                    <div className="min-w-0">
                                        <p className="font-medium truncate">{item.name}</p>
                                        <Badge variant="secondary" className="text-xs mt-1">
                                            {getCategoryLabel(item.category)}
                                        </Badge>
                                    </div>
                                    <div className="flex gap-1 ml-2 shrink-0">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() => setEditItem(item)}
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-destructive"
                                            onClick={() => handleDelete(item.id)}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground mb-1">
                                    Per {item.base_amount}{item.base_unit}
                                    {item.cost_per_base ? ` \u2022 $${Number(item.cost_per_base).toFixed(2)}` : ""}
                                </p>
                                <div className="grid grid-cols-4 gap-2 text-sm">
                                    <div>
                                        <p className="text-muted-foreground text-xs">Cal</p>
                                        <p className="font-medium">{item.calories_per_base}</p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground text-xs">P</p>
                                        <p className="font-medium">{item.protein_per_base}g</p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground text-xs">C</p>
                                        <p className="font-medium">{item.carbs_per_base}g</p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground text-xs">F</p>
                                        <p className="font-medium">{item.fat_per_base}g</p>
                                    </div>
                                </div>
                                {item.stock_quantity !== null && item.stock_quantity !== undefined && (
                                    <div className="mt-2 flex items-center gap-1.5">
                                        <div className={`h-1.5 w-1.5 rounded-full ${item.stock_quantity <= 0 ? "bg-destructive" : item.stock_quantity < 2 ? "bg-amber-500" : "bg-green-500"}`} />
                                        <span className="text-xs text-muted-foreground">
                                            {item.stock_quantity <= 0
                                                ? "Out of stock"
                                                : `${item.stock_quantity}${item.stock_unit ? ` ${item.stock_unit}` : ""} in stock`}
                                        </span>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
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
        </div>
    );
}
