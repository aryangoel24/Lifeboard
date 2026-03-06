"use server";

import { createClient } from "@/lib/supabase/server";
import { generateEmbedding, synthesizeRagResponse } from "@/lib/ai-utils";
import type { KnowledgeNode } from "@/types/database";

export interface RagSearchResult {
    answer: string | null;
    contextNodes: Partial<KnowledgeNode>[];
    error: string | null;
}

export async function performRagSearch(query: string): Promise<RagSearchResult> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { answer: null, contextNodes: [], error: "Unauthorized" };

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
        return { answer: null, contextNodes: [], error: "Empty query" };
    }

    // 1. Generate semantic embedding for the query
    const { embedding, error: embedError } = await generateEmbedding(trimmedQuery);
    if (embedError || !embedding) {
        return { answer: null, contextNodes: [], error: embedError || "Failed to embed query" };
    }

    const contextMap = new Map<string, Partial<KnowledgeNode>>();

    // 2. Perform Vector Search (Top 8)
    const { data: vectorMatches, error: rpcError } = await supabase.rpc("match_knowledge_nodes", {
        query_embedding: embedding,
        match_threshold: 0.65, // Tune this lower if recall is too strict
        match_count: 8,
        user_id_filter: user.id,
    });

    if (rpcError) {
        console.error("Vector search RPC error:", rpcError);
        // Non-fatal, we can still try lexical fallback
    }

    if (vectorMatches) {
        for (const match of vectorMatches) {
            contextMap.set(match.id, {
                id: match.id,
                title: match.title,
                description: match.description,
                key_facts: match.key_facts as any,
                user_facts: match.user_facts as any,
                ai_evidence: match.ai_evidence,
                node_type: match.node_type as any,
                parent_id: match.parent_id,
                root_id: match.root_id
            });
        }
    }

    // 3. Perform Lexical Fallback Search (Top 5)
    // Simple ILIKE match on title or facts to catch acronyms, exact names, specific course codes
    const searchTerms = trimmedQuery.split(" ").filter(w => w.length > 2);
    if (searchTerms.length > 0) {
        let textSearchQuery = supabase
            .from("knowledge_nodes")
            .select("id, title, description, key_facts, user_facts, ai_evidence, node_type, parent_id, root_id")
            .eq("user_id", user.id)
            .limit(5);

        // Build an OR chain for the tokens against the title
        const orClauses = searchTerms.map(term => `title.ilike.%${term}%`).join(",");
        textSearchQuery = textSearchQuery.or(orClauses);

        const { data: lexicalMatches, error: lexError } = await textSearchQuery;

        if (lexError) {
            console.error("Lexical search error:", lexError);
        } else if (lexicalMatches) {
            for (const match of lexicalMatches) {
                if (!contextMap.has(match.id as string)) {
                    contextMap.set(match.id as string, match as Partial<KnowledgeNode>);
                }
            }
        }
    }

    const mergedNodes = Array.from(contextMap.values());

    // 4. Synthesize the response using the strict grounded prompt
    const { text: answer, error: synthError } = await synthesizeRagResponse(trimmedQuery, mergedNodes);

    if (synthError || !answer) {
        return { answer: null, contextNodes: mergedNodes, error: synthError || "Failed to synthesize answer" };
    }

    return { answer, contextNodes: mergedNodes, error: null };
}
