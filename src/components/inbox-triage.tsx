"use client";

import { useState, useTransition } from "react";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet";
import { Loader2, Inbox, Merge, MoveRight, Trash2, ArrowUpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { KnowledgeNode } from "@/types/database";
import { moveNode, deleteNode, mergeNodes } from "@/lib/actions/knowledge";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Combobox for selecting existing nodes
function NodeCombobox({
    nodes,
    value,
    onChange,
    placeholder,
}: {
    nodes: { id: string; breadcrumb: string }[];
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
}) {
    const [open, setOpen] = useState(false);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between h-8 text-xs font-normal"
                >
                    {value
                        ? nodes.find((n) => n.id === value)?.breadcrumb
                        : placeholder ?? "Select node..."}
                    <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
                <Command
                    filter={(value, search) => {
                        if (value.toLowerCase().includes(search.toLowerCase())) return 1;
                        return 0;
                    }}
                >
                    <CommandInput placeholder="Search nodes..." className="h-8 text-xs" />
                    <CommandList className="max-h-[300px]">
                        <CommandEmpty className="py-2 text-center text-xs text-muted-foreground">
                            No nodes found.
                        </CommandEmpty>
                        <CommandGroup>
                            {nodes.map((n) => (
                                <CommandItem
                                    key={n.id}
                                    value={n.breadcrumb}
                                    className="text-xs py-1"
                                    onSelect={() => {
                                        onChange(n.id);
                                        setOpen(false);
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-3 w-3",
                                            value === n.id ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    {n.breadcrumb}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

interface InboxTriageSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    allNodes: KnowledgeNode[];
    onNodeTriaged?: (nodeId: string, actionType: 'move' | 'merge' | 'promote' | 'delete', targetId?: string) => void;
}

export function InboxTriageSheet({ open, onOpenChange, allNodes, onNodeTriaged }: InboxTriageSheetProps) {
    const [isPending, startTransition] = useTransition();
    const [optimisticRemovedIds, setOptimisticRemovedIds] = useState<Set<string>>(new Set());

    // Reset optimistic state when sheet closes
    if (!open && optimisticRemovedIds.size > 0) {
        setOptimisticRemovedIds(new Set());
    }

    // Find the Inbox Root Node
    const inboxRoot = allNodes.find((n) => n.title === "Inbox" && n.parent_id === null);

    // Compute all descendants of Inbox
    const triageNodes = allNodes.filter(n => n.root_id === inboxRoot?.id && n.id !== inboxRoot?.id);

    // Build the list of potential targets (everything NOT in the inbox tree)
    const validTargets = allNodes
        .filter(n => n.root_id !== inboxRoot?.id)
        .map(n => {
            // Build breadcrumb
            const chain: string[] = [];
            let cur: KnowledgeNode | undefined = n;
            while (cur) {
                chain.push(cur.title);
                cur = allNodes.find(p => p.id === cur?.parent_id);
            }
            return {
                id: n.id,
                title: n.title,
                breadcrumb: chain.reverse().join(" > "),
                depth: n.depth
            };
        })
        .sort((a, b) => a.depth - b.depth || a.title.localeCompare(b.title));

    const [activeAction, setActiveAction] = useState<{ type: 'move' | 'merge', nodeId: string } | null>(null);

    const handlePromote = (node: KnowledgeNode) => {
        setOptimisticRemovedIds((prev) => { const next = new Set(prev); next.add(node.id); return next; });
        startTransition(async () => {
            const res = await moveNode(node.id, null);
            if ("error" in res) {
                toast.error("Failed to promote node: " + res.error);
                setOptimisticRemovedIds((prev) => { const next = new Set(prev); next.delete(node.id); return next; });
            } else {
                toast.success(`Promoted "${node.title}" to a root topic`);
                onNodeTriaged?.(node.id, 'promote');
            }
        });
    };

    const handleDelete = (node: KnowledgeNode) => {
        setOptimisticRemovedIds((prev) => { const next = new Set(prev); next.add(node.id); return next; });
        startTransition(async () => {
            const res = await deleteNode(node.id);
            if ("error" in res) {
                toast.error("Failed to delete node: " + res.error);
                setOptimisticRemovedIds((prev) => { const next = new Set(prev); next.delete(node.id); return next; });
            } else {
                toast.success(`Deleted "${node.title}"`);
                onNodeTriaged?.(node.id, 'delete');
            }
            setActiveAction(null);
        });
    };

    const handleMove = (sourceNodeId: string, targetNodeId: string) => {
        setOptimisticRemovedIds((prev) => { const next = new Set(prev); next.add(sourceNodeId); return next; });
        startTransition(async () => {
            const res = await moveNode(sourceNodeId, targetNodeId);
            if ("error" in res) {
                toast.error("Failed to move node: " + res.error);
                setOptimisticRemovedIds((prev) => { const next = new Set(prev); next.delete(sourceNodeId); return next; });
            } else {
                toast.success("Node moved successfully");
                onNodeTriaged?.(sourceNodeId, 'move', targetNodeId);
            }
            setActiveAction(null);
        });
    };

    const handleMerge = (sourceNodeId: string, targetNodeId: string) => {
        setOptimisticRemovedIds((prev) => { const next = new Set(prev); next.add(sourceNodeId); return next; });
        startTransition(async () => {
            const res = await mergeNodes(sourceNodeId, targetNodeId);
            if ("error" in res) {
                toast.error("Failed to merge node: " + res.error);
                setOptimisticRemovedIds((prev) => { const next = new Set(prev); next.delete(sourceNodeId); return next; });
            } else {
                toast.success("Node merged successfully");
                onNodeTriaged?.(sourceNodeId, 'merge', targetNodeId);
            }
            setActiveAction(null);
        });
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-[400px] sm:w-[540px] flex flex-col p-0">
                <SheetHeader className="px-6 py-4 border-b">
                    <SheetTitle className="flex items-center gap-2">
                        <Inbox className="h-5 w-5 text-muted-foreground" />
                        Inbox Triage Workspace
                    </SheetTitle>
                    <SheetDescription>
                        {triageNodes.length > 0
                            ? `You have ${triageNodes.length} extraction${triageNodes.length === 1 ? '' : 's'} to review and organize into your graph.`
                            : "Your inbox is clear! Nice work."}
                    </SheetDescription>
                </SheetHeader>

                <ScrollArea className="flex-1 px-6 py-4">
                    <div className="space-y-4 pb-8">
                        {triageNodes.length === 0 && (
                            <div className="text-center py-12 text-muted-foreground">
                                <Inbox className="h-12 w-12 mx-auto mb-4 opacity-20" />
                                <p>No extractions waiting in your Inbox.</p>
                                <p className="text-sm mt-1">Use the Quick Extract tool to add more.</p>
                            </div>
                        )}

                        {triageNodes.filter(n => !optimisticRemovedIds.has(n.id)).map((node) => (
                            <div key={node.id} className="rounded-lg border bg-card p-4 space-y-3 shadow-sm relative group">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-medium text-sm truncate" title={node.title}>
                                                {node.title}
                                            </h4>
                                            <Badge variant="secondary" className="text-[10px] uppercase font-semibold">
                                                {node.node_type}
                                            </Badge>
                                        </div>
                                        {node.ai_evidence && (
                                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">
                                                &quot;{node.ai_evidence}&quot;
                                            </p>
                                        )}
                                        {Array.isArray(node.user_facts) && node.user_facts.length > 0 && (
                                            <div className="mt-2 text-xs text-muted-foreground">
                                                <span className="font-semibold text-foreground/70">Facts:</span> {node.user_facts.length}
                                            </div>
                                        )}
                                    </div>

                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 !p-0 absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <ChevronsUpDown className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-48">
                                            <DropdownMenuItem onClick={() => setActiveAction({ type: 'move', nodeId: node.id })}>
                                                <MoveRight className="mr-2 h-4 w-4" /> Move to parent...
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setActiveAction({ type: 'merge', nodeId: node.id })}>
                                                <Merge className="mr-2 h-4 w-4" /> Merge into...
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handlePromote(node)}>
                                                <ArrowUpCircle className="mr-2 h-4 w-4" /> Promote to Root
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleDelete(node)} className="text-destructive">
                                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>

                                {isPending && (
                                    <div className="absolute inset-0 bg-background/50 flex items-center justify-center rounded-lg z-10">
                                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                    </div>
                                )}

                                {/* Inline Action Menus */}
                                {activeAction?.nodeId === node.id && (
                                    <div className="pt-3 border-t flex items-center gap-2">
                                        <div className="flex-1">
                                            <NodeCombobox
                                                nodes={validTargets}
                                                value=""
                                                placeholder={activeAction.type === 'move' ? "Select new parent node..." : "Select node to merge facts into..."}
                                                onChange={(val) => {
                                                    if (activeAction.type === 'move') {
                                                        handleMove(node.id, val);
                                                    } else {
                                                        handleMerge(node.id, val);
                                                    }
                                                }}
                                            />
                                        </div>
                                        <Button variant="ghost" size="sm" onClick={() => setActiveAction(null)} className="h-8 px-2 text-xs">
                                            Cancel
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
}
