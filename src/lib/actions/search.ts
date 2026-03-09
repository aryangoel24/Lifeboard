"use server";

import { createClient } from "@/lib/supabase/server";
import { generateEmbedding, synthesizeRagResponse } from "@/lib/ai-utils";
import type { KnowledgeNode, Event } from "@/types/database";

export interface RagSearchResult {
    answer: string | null;
    contextNodes: Partial<KnowledgeNode>[];
    contextEvents: Partial<Event>[];
    error: string | null;
}

export async function performRagSearch(query: string): Promise<RagSearchResult> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { answer: null, contextNodes: [], contextEvents: [], error: "Unauthorized" };

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
        return { answer: null, contextNodes: [], contextEvents: [], error: "Empty query" };
    }

    // 1. Generate semantic embedding for the query
    const { embedding, error: embedError } = await generateEmbedding(trimmedQuery);
    if (embedError || !embedding) {
        return { answer: null, contextNodes: [], contextEvents: [], error: embedError || "Failed to embed query" };
    }

    const contextMap = new Map<string, Partial<KnowledgeNode>>();
    const eventContextMap = new Map<string, Partial<Event>>();

    // 2. Perform Vector Search
    const [nodeSearchRes, eventSearchRes] = await Promise.all([
        supabase.rpc("match_knowledge_nodes", {
            query_embedding: embedding,
            match_threshold: 0.65,
            match_count: 8,
            user_id_filter: user.id,
        }),
        supabase.rpc("match_events", {
            query_embedding: embedding,
            match_threshold: 0.65,
            match_count: 5,
            user_id_filter: user.id,
        })
    ]);

    const { data: vectorMatches, error: rpcError } = nodeSearchRes;
    const { data: eventMatches, error: eventRpcError } = eventSearchRes;

    if (rpcError) {
        console.error("Vector search RPC error (nodes):", rpcError);
    }
    if (eventRpcError) {
        console.error("Vector search RPC error (events):", eventRpcError);
    }

    if (vectorMatches) {
        for (const match of vectorMatches) {
            contextMap.set(match.id, {
                id: match.id,
                title: match.title,
                description: match.description,
                key_facts: match.key_facts as string[],
                user_facts: match.user_facts as string[],
                ai_evidence: match.ai_evidence,
                node_type: match.node_type as KnowledgeNode["node_type"],
                parent_id: match.parent_id,
                root_id: match.root_id
            });
        }
    }

    if (eventMatches) {
        for (const match of eventMatches) {
            eventContextMap.set(match.id, {
                id: match.id,
                title: match.title,
                summary: match.summary,
                raw_text: match.raw_text,
                happened_at: match.happened_at,
                time_precision: match.time_precision as Event["time_precision"]
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
            console.error("Lexical search error (nodes):", lexError);
        } else if (lexicalMatches) {
            for (const match of lexicalMatches) {
                if (!contextMap.has(match.id as string)) {
                    contextMap.set(match.id as string, match as Partial<KnowledgeNode>);
                }
            }
        }

        let eventsSearchQuery = supabase
            .from("events")
            .select("id, title, summary, raw_text, happened_at, time_precision")
            .eq("user_id", user.id)
            .limit(3);

        const eventOrClauses = searchTerms.map((term: string) => `title.ilike.%${term}%,raw_text.ilike.%${term}%`).join(",");
        eventsSearchQuery = eventsSearchQuery.or(eventOrClauses);

        const { data: lexicalEvents, error: evError } = await eventsSearchQuery;
        if (evError) {
            console.error("Lexical search error (events):", evError);
        } else if (lexicalEvents) {
            for (const match of lexicalEvents) {
                if (!eventContextMap.has(match.id as string)) {
                    eventContextMap.set(match.id as string, match as Partial<Event>);
                }
            }
        }
    }

    const mergedNodes = Array.from(contextMap.values());
    const mergedEvents = Array.from(eventContextMap.values());

    // 4. Synthesize the response using the strict grounded prompt
    const { text: answer, error: synthError } = await synthesizeRagResponse(trimmedQuery, mergedNodes, mergedEvents);

    if (synthError || !answer) {
        return { answer: null, contextNodes: mergedNodes, contextEvents: mergedEvents, error: synthError || "Failed to synthesize answer" };
    }

    return { answer, contextNodes: mergedNodes, contextEvents: mergedEvents, error: null };
}
