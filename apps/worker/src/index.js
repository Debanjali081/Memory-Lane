import "dotenv/config";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import pg from "pg";
import ImageKit from "imagekit";
import * as cheerio from "cheerio";
import dns from "dns";
import { v4 as uuidv4 } from "uuid";

dns.setDefaultResultOrder("ipv4first");

if (process.env.EXTRACT_ALLOW_INSECURE_TLS === "true") {
  // Dev-only escape hatch for TLS issues on some machines.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const { Pool } = pg;

const redis = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const storageProvider = (process.env.STORAGE_PROVIDER || "IMAGEKIT").toUpperCase();

const imagekit =
  storageProvider === "IMAGEKIT"
    ? new ImageKit({
        publicKey: process.env.IMAGEKIT_PUBLIC_KEY || "",
        privateKey: process.env.IMAGEKIT_PRIVATE_KEY || "",
        urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || "",
      })
    : null;

const openaiApiKey = process.env.OPENAI_API_KEY;
const tagModel = process.env.OPENAI_TAG_MODEL || "gpt-5-mini-2025-08-07";
const tagCount = Number(process.env.OPENAI_TAG_COUNT || 5);
const embeddingModel =
  process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-large";

function extractOutputText(responseJson) {
  if (!responseJson) return "";
  if (responseJson.output_text) return responseJson.output_text;
  const output = responseJson.output || [];
  const chunks = [];
  for (const item of output) {
    if (item.type === "message" && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (c.type === "output_text" && c.text) chunks.push(c.text);
      }
    }
  }
  return chunks.join("\n");
}

async function generateTags(text) {
  if (!openaiApiKey || !text) return [];
  const prompt = `Return ${tagCount} short topical tags for the following text. Use JSON array of strings only, no extra text.`;

  const body = {
    model: tagModel,
    instructions: prompt,
    input: text.slice(0, 4000),
  };

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Tagging failed", { status: res.status, errText });
    return [];
  }

  const data = await res.json();
  const outputText = extractOutputText(data).trim();
  if (!outputText) return [];

  try {
    const parsed = JSON.parse(outputText);
    if (Array.isArray(parsed)) {
      return parsed.map((t) => String(t).trim()).filter(Boolean);
    }
  } catch {
    // Fallback: comma-separated
    return outputText
      .split(/,|\n/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, tagCount);
  }

  return [];
}

async function generateEmbedding(text) {
  if (!openaiApiKey || !text) return null;
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: embeddingModel,
      input: text.slice(0, 8000),
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Embedding failed", { status: res.status, errText });
    return null;
  }

  const data = await res.json();
  const vector = data?.data?.[0]?.embedding;
  if (!Array.isArray(vector)) return null;
  return vector;
}

const worker = new Worker(
  "items",
  async (job) => {
    const { itemId, url, type } = job.data;

    let extractedTitle = null;
    let extractedText = null;
    let extractionStatus = null;
    let extractionError = null;
    let extractionErrorCause = null;

    try {
      const parsedUrl = new URL(url);
      const host = parsedUrl.hostname || "";
      if (
        host === "localhost" ||
        host === "127.0.0.1" ||
        host.endsWith(".local")
      ) {
        extractionError = "skipped_local";
        throw new Error("soft_block");
      }

      if (["image", "video", "pdf", "note"].includes(String(type))) {
        extractionError = `skipped_type_${type}`;
        throw new Error("soft_block");
      }

      const res = await fetch(url, {
        redirect: "follow",
        headers: {
          "User-Agent":
            "MemoryLaneBot/0.1 (+https://example.com) Node.js fetch",
        },
      });
      extractionStatus = res.status;
      if (!res.ok) {
        if (res.status === 403 || res.status === 401) {
          extractionError = `fetch_blocked_${res.status}`;
          extractionErrorCause = null;
          // Skip extraction without throwing; some sites block bots.
          throw new Error("soft_block");
        }
        throw new Error(`fetch_failed_${res.status}`);
      }
      const html = await res.text();
      const $ = cheerio.load(html);
      extractedTitle = $("title").first().text().trim() || null;
      const bodyText = $("body").text();
      extractedText = bodyText
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 20000);
      if (extractedText) {
        const looksLikeNoise =
          extractedText.includes("sourceMappingURL=data:") ||
          extractedText.includes("function(") ||
          extractedText.length > 12000;
        if (looksLikeNoise) {
          extractionError = "noisy_content";
          extractedText = null;
        }
      }
    } catch (err) {
      if (String(err?.message) === "soft_block") {
        // Preserve soft block error info without logging noisy stack.
      } else {
        extractionError = extractionError || String(err?.message || err);
        extractionErrorCause =
          extractionErrorCause ||
          (err?.cause ? String(err.cause?.message || err.cause) : null);
        console.error("Extraction failed", {
          itemId,
          url,
          extractionError,
          extractionErrorCause,
        });
      }
      extractedTitle = null;
      extractedText = null;
    }

    let tags = [];
    let embedding = null;
    if (extractedText) {
      tags = await generateTags(extractedText);
      embedding = await generateEmbedding(extractedText);
    }

    await pool.query(
      "UPDATE items SET content_text = COALESCE($2, content_text), metadata = metadata || $3 WHERE id = $1",
      [
        itemId,
        extractedText,
        {
          processedAt: new Date().toISOString(),
          extractedFrom: url,
          extractedTitle,
          extractionStatus,
          extractionError,
          extractionErrorCause,
          storageProvider: storageProvider,
          imagekitConfigured: Boolean(imagekit),
          tagCount: tags.length,
        },
      ]
    );

    if (embedding && embedding.length > 0) {
      const vectorLiteral = `[${embedding.join(",")}]`;
      await pool.query(
        "INSERT INTO embeddings (item_id, vector) VALUES ($1, $2::vector) ON CONFLICT (item_id) DO UPDATE SET vector = EXCLUDED.vector",
        [itemId, vectorLiteral]
      );
    }

    if (tags.length > 0) {
      for (const tag of tags) {
        const { rows } = await pool.query(
          "INSERT INTO tags (id, name, source) VALUES ($1, $2, $3) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id",
          [uuidv4(), tag, "ai"]
        );
        const tagId = rows[0]?.id;
        if (tagId) {
          await pool.query(
            "INSERT INTO item_tags (item_id, tag_id, confidence) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
            [itemId, tagId, 1.0]
          );
        }
      }
    }

    return { ok: true };
  },
  { connection: redis }
);

worker.on("completed", (job) => {
  console.log(`job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`job ${job?.id} failed`, err);
});
