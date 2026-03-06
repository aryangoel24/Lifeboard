import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import crypto from 'crypto';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openAiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !supabaseServiceKey || !openAiKey) {
    console.error("Missing required environment variables in .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const openai = new OpenAI({ apiKey: openAiKey });

function hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
}

async function main() {
    console.log('Fetching all knowledge nodes...');

    const { data: nodes, error } = await supabase
        .from('knowledge_nodes')
        .select('id, title, node_type, parent_id, root_id, description, key_facts, user_facts, ai_evidence, embedding_content_hash, embedding');

    if (error || !nodes) {
        console.error('Error fetching nodes:', error);
        return;
    }

    console.log(`Found ${nodes.length} total nodes. Checking hashes...`);

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (const node of nodes) {
        const payloadString = `Title: ${node.title}
Type: ${node.node_type}
Path: Parent(${node.parent_id || 'Root'}) -> Root(${node.root_id})
Description: ${node.description || "None"}
Key Facts:
${Array.isArray(node.key_facts) ? node.key_facts.slice(0, 10).map((f: any) => "- " + f).join("\n") : "None"}
User Facts:
${Array.isArray(node.user_facts) ? node.user_facts.slice(0, 10).map((f: any) => "- " + f).join("\n") : "None"}
Evidence: ${node.ai_evidence ? node.ai_evidence.substring(0, 500) + '...' : "None"}`;

        const currentHash = hashContent(payloadString);

        // Skip if hash matches and embedding is already populated
        if (currentHash === node.embedding_content_hash && node.embedding !== null) {
            skipped++;
            continue;
        }

        try {
            const response = await openai.embeddings.create({
                model: 'text-embedding-3-small',
                input: payloadString,
                encoding_format: 'float',
            });

            const embedding = response.data[0]?.embedding;

            if (embedding) {
                const { error: updateError } = await supabase
                    .from('knowledge_nodes')
                    .update({
                        embedding,
                        embedding_content_hash: currentHash
                    })
                    .eq('id', node.id);

                if (updateError) {
                    console.error(`[X] Error updating DB for node: ${node.title}`, updateError);
                    errors++;
                } else {
                    processed++;
                    console.log(`[+] Generated embedding for: ${node.title}`);
                }
            }
        } catch (err) {
            console.error(`[X] OpenAI error for node: ${node.title}`, err);
            errors++;
        }

        // Quick delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 50));
    }

    console.log(`\n=== Backfill Complete ===`);
    console.log(`Processed: ${processed}`);
    console.log(`Skipped (Already Up-To-Date): ${skipped}`);
    console.log(`Errors: ${errors}`);
}

main().catch(console.error);
