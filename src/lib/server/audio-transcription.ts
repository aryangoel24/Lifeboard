import OpenAI, { toFile } from "openai";

// Define a separate module just for server-side audio processing
// This keeps file logic isolated from general prompting utilities.

export async function transcribeAudio(
    audioBuffer: Buffer,
    filename: string
): Promise<{ text: string } | { error: string }> {
    try {
        if (!process.env.OPENAI_API_KEY) {
            return { error: "OPENAI_API_KEY is not set" };
        }

        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        // Use openai's helper to create an Uploadable file from the buffer
        const file = await toFile(audioBuffer, filename, { type: "audio/ogg" });

        const transcription = await openai.audio.transcriptions.create({
            file,
            model: "whisper-1",
        });

        return { text: transcription.text };
    } catch (error: any) {
        console.error("Audio transcription error:", error);
        return { error: error.message || "Unknown transcription error" };
    }
}
