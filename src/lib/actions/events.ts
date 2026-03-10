"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractEventDetails, generateEmbedding } from "@/lib/ai-utils";

export async function ingestEvent(
  rawText: string,
  source: string,
  overrideUserId?: string,
  media?: { type: 'photo' | 'audio', storagePath: string }[]
) {
  let supabase;
  let userId: string;

  if (overrideUserId) {
    supabase = createAdminClient();
    userId = overrideUserId;
  } else {
    supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };
    userId = user.id;
  }

  // 1. Ask AI to analyze the raw story
  const { result: extracted, error: extractErr } = await extractEventDetails(rawText);
  if (extractErr || !extracted) {
    return { error: extractErr || "Failed to extract event." };
  }

  // 2. Generate embedding for semantic search
  let embeddingVector = null;
  const embedInput = `${extracted.title}\n\n${extracted.summary}\n\nRaw: ${rawText}`;
  const embedRes = await generateEmbedding(embedInput);
  if (embedRes && !embedRes.error && embedRes.embedding) {
    embeddingVector = embedRes.embedding;
  }

  // 3. Save the event
  const { data: event, error: eventErr } = await supabase
    .from("events")
    .insert({
      user_id: userId,
      title: extracted.title,
      happened_at: extracted.happened_at,
      time_precision: extracted.time_precision,
      raw_text: rawText,
      summary: extracted.summary,
      source: source,
      extracted_people: extracted.extracted_people,
      extracted_places: extracted.extracted_places,
      embedding: embeddingVector,
      processing_status: "complete"
    })
    .select("id")
    .single();

  if (eventErr || !event) {
    console.error("Failed to insert event:", eventErr);
    return { error: "Failed to save event to database." };
  }

  const eventId = event.id;

  // 4. Save any media
  if (media && media.length > 0) {
    const mediaInserts = media.map((m, index) => ({
      event_id: eventId,
      user_id: userId,
      type: m.type,
      storage_path: m.storagePath,
      sort_order: index
    }));

    const { error: mediaErr } = await supabase
      .from("event_media")
      .insert(mediaInserts);

    if (mediaErr) {
      console.error("Failed to insert event media:", mediaErr);
      // We don't fail the whole request just for media
    }
  }

  // 4. Save any fact suggestions
  if (extracted.fact_suggestions && extracted.fact_suggestions.length > 0) {
    const suggestionRows = extracted.fact_suggestions.map(fact => ({
      event_id: eventId,
      fact_text: fact,
      status: "pending" as const,
    }));
    const { error: sugErr } = await supabase
      .from("event_fact_suggestions")
      .insert(suggestionRows);

    if (sugErr) {
      console.error("Failed to insert fact suggestions:", sugErr);
      // We don't fail the whole request for this
    }
  }

  // 5. Attempt auto-linking (Naive match: if an exact node title exists matching an extracted person/place)
  const combinedEntities = [...extracted.extracted_people, ...extracted.extracted_places];
  if (combinedEntities.length > 0) {
    const { data: matchedNodes } = await supabase
      .from("knowledge_nodes")
      .select("id, title")
      .eq("user_id", userId)
      .in("title", combinedEntities);

    if (matchedNodes && matchedNodes.length > 0) {
      const linkRows = matchedNodes.map(n => ({
        event_id: eventId,
        node_id: n.id,
        why: "Auto-linked by name match",
      }));
      await supabase.from("event_knowledge_links").insert(linkRows);
    }
  }

  revalidatePath("/journal");
  return { success: true, eventId };
}

export async function addMediaToEvent(
  eventId: string,
  userId: string,
  media: { type: string; storagePath: string }[]
) {
  const supabase = createAdminClient();

  // Get the current max sort_order for this event
  const { data: existing } = await supabase
    .from("event_media")
    .select("sort_order")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const startOrder = (existing && existing.length > 0 ? existing[0].sort_order + 1 : 0);

  const mediaInserts = media.map((m, index) => ({
    event_id: eventId,
    user_id: userId,
    type: m.type,
    storage_path: m.storagePath,
    sort_order: startOrder + index,
  }));

  const { error } = await supabase
    .from("event_media")
    .insert(mediaInserts);

  if (error) {
    console.error("Failed to add media to event:", error);
    return { error: "Failed to add media." };
  }

  return { success: true };
}

async function processPendingAlbums(userId: string) {
  const adminSupabase = createAdminClient();

  // Find all pending album photos for this user that are older than 10 seconds
  const cutoff = new Date(Date.now() - 10_000).toISOString();
  const { data: pendingPhotos } = await adminSupabase
    .from("pending_album_photos")
    .select("*")
    .eq("user_id", userId)
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true });

  if (!pendingPhotos || pendingPhotos.length === 0) return;

  // Group by media_group_id
  interface PendingPhoto { media_group_id: string; storage_path: string; caption: string | null; }
  const groups: Record<string, PendingPhoto[]> = {};
  for (const photo of pendingPhotos) {
    const gid = photo.media_group_id as string;
    if (!groups[gid]) groups[gid] = [];
    groups[gid].push(photo as PendingPhoto);
  }

  // Process each album group
  for (const mediaGroupId of Object.keys(groups)) {
    const photos = groups[mediaGroupId];
    // Deterministic caption: first non-empty caption
    const caption = photos.find((p: PendingPhoto) => p.caption)?.caption || "Photo album";
    const media = photos.map((p: PendingPhoto) => ({ type: "photo" as const, storagePath: p.storage_path }));

    try {
      const result = await ingestEvent(caption, "telegram_photo_caption", userId, media);

      if (result && !result.error) {
        // Success — delete buffer rows for this album
        await adminSupabase
          .from("pending_album_photos")
          .delete()
          .eq("media_group_id", mediaGroupId);
      } else {
        console.error(`[album] Failed to process album ${mediaGroupId}:`, result?.error);
      }
    } catch (err) {
      console.error(`[album] Error processing album ${mediaGroupId}:`, err);
    }
  }
}

export async function getEvents() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Unauthorized" };

  // Lazily process any pending album photos (older than 10s = album is complete)
  await processPendingAlbums(user.id);

  const { data, error } = await supabase
    .from("events")
    .select("*, event_knowledge_links(node_id, why, knowledge_nodes(title)), event_media(*)")
    .eq("user_id", user.id)
    .order("happened_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch events:", error);
    return { data: null, error: "Failed to fetch events." };
  }

  // Resolve signed URLs for media
  const { getSignedUrl } = await import("@/lib/storage-utils");
  if (data) {
    for (const event of data) {
      if (event.event_media && event.event_media.length > 0) {
        // Sort by sort_order
        event.event_media.sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order);
        for (const media of event.event_media) {
          const bucket = media.type === 'photo' ? 'food-photos' : 'journal-media';
          const res = await getSignedUrl(media.storage_path, bucket);
          if (!("error" in res) && res.signedUrl) {
            media.signed_url = res.signedUrl;
          }
        }
      }
    }
  }

  return { data, error: null };
}

export async function updateEvent(id: string, updates: { title?: string, summary?: string, raw_text?: string, happened_at?: string }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Unauthorized" };

  const { error } = await supabase
    .from("events")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("Failed to update event:", error);
    return { success: false, error: "Failed to update event." };
  }

  revalidatePath("/journal");
  return { success: true };
}

export async function deleteEvent(id: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Unauthorized" };

  const { error } = await supabase
    .from("events")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("Failed to delete event:", error);
    return { success: false, error: "Failed to delete event." };
  }

  revalidatePath("/journal");
  return { success: true };
}
