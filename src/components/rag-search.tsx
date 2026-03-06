"use client";

import { useState, useTransition } from "react";
import { performRagSearch, type RagSearchResult } from "@/lib/actions/search";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Search, Loader2, ArrowRight, BrainCircuit } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";

export function RagSearchDialog() {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [result, setResult] = useState<RagSearchResult | null>(null);
    const [isPending, startTransition] = useTransition();

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim() || isPending) return;

        startTransition(async () => {
            const res = await performRagSearch(query);
            setResult(res);
        });
    };

    const handleOpenChange = (newOpen: boolean) => {
        setOpen(newOpen);
        if (!newOpen) {
            setTimeout(() => {
                setQuery("");
                setResult(null);
            }, 300); // Clear state after close animation
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="outline" className="gap-2 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20 border-indigo-200/50 hover:bg-indigo-100/50 text-indigo-700 dark:text-indigo-300 transition-all duration-300 hover:shadow-sm">
                    <Sparkles className="h-4 w-4" />
                    <span className="hidden sm:inline">Ask AI</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] gap-0 p-0 overflow-hidden bg-background/95 backdrop-blur-xl border-border/50 shadow-2xl">
                <div className="p-4 border-b bg-muted/20">
                    <form onSubmit={handleSearch} className="relative flex items-center">
                        <Search className="absolute left-3 h-5 w-5 text-muted-foreground" />
                        <Input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Ask anything about your knowledge..."
                            className="pl-10 pr-12 py-6 text-base bg-transparent border-none shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/50 transition-all font-medium"
                            autoFocus
                        />
                        <Button
                            type="submit"
                            size="icon"
                            disabled={!query.trim() || isPending}
                            className={`absolute right-1 transition-all ${query.trim() && !isPending ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
                        >
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                    </form>
                </div>

                <ScrollArea className="max-h-[60vh]">
                    <div className="p-6">
                        <AnimatePresence mode="wait">
                            {isPending && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="flex flex-col items-center justify-center py-12 space-y-4 text-muted-foreground"
                                >
                                    <div className="relative">
                                        <BrainCircuit className="h-10 w-10 text-indigo-500/50 animate-pulse" />
                                        <Loader2 className="h-10 w-10 text-indigo-500 absolute top-0 left-0 animate-spin opacity-50" />
                                    </div>
                                    <p className="text-sm font-medium animate-pulse">Searching your neural graph...</p>
                                </motion.div>
                            )}

                            {!isPending && result && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="space-y-6"
                                >
                                    {result.error && (
                                        <div className="p-4 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/20">
                                            {result.error}
                                        </div>
                                    )}

                                    {result.answer && (
                                        <div className="prose prose-sm dark:prose-invert max-w-none text-[15px] leading-relaxed">
                                            {/* Render markdown line breaks safely */}
                                            {result.answer.split('\\n').map((line, i) => (
                                                <p key={i} className="mb-2 last:mb-0 text-foreground/90">{line}</p>
                                            ))}
                                        </div>
                                    )}

                                    {result.contextNodes.length > 0 && (
                                        <div className="pt-6 mt-6 border-t border-border/50">
                                            <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-3 px-1">
                                                Sources & Context
                                            </h4>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {result.contextNodes.map((node, i) => (
                                                    <motion.div
                                                        initial={{ opacity: 0, scale: 0.95 }}
                                                        animate={{ opacity: 1, scale: 1 }}
                                                        transition={{ delay: i * 0.05 }}
                                                        key={node.id}
                                                        className="p-3 rounded-lg bg-muted/40 border hover:bg-muted/70 transition-colors flex flex-col gap-2 cursor-default group"
                                                    >
                                                        <div className="flex items-start justify-between">
                                                            <span className="text-sm font-semibold truncate text-foreground/90 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                                                {node.title}
                                                            </span>
                                                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 ml-2 shrink-0 opacity-70">
                                                                {node.node_type}
                                                            </Badge>
                                                        </div>
                                                        {(node.description || node.ai_evidence) && (
                                                            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                                                                {node.description || node.ai_evidence}
                                                            </p>
                                                        )}
                                                    </motion.div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </motion.div>
                            )}

                            {!isPending && !result && query.length === 0 && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="flex flex-col items-center justify-center py-12 text-center"
                                >
                                    <div className="h-12 w-12 rounded-full bg-indigo-500/10 flex items-center justify-center mb-4 border border-indigo-500/20">
                                        <Sparkles className="h-6 w-6 text-indigo-500" />
                                    </div>
                                    <h3 className="text-lg font-semibold text-foreground/90 mb-1">Semantic Search</h3>
                                    <p className="text-sm text-muted-foreground max-w-[250px]">
                                        Ask complex questions about your knowledge. I will find the most relevant nodes and synthesize an answer.
                                    </p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
