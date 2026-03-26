import "dotenv/config";
import crypto from "crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { v4 as uuidv4 } from "uuid";
import { pool } from "./db.js";
import { itemQueue } from "./queue.js";

const app = Fastify({ logger: true });
await app.register(cors, {
  origin: true,
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
});

const openaiApiKey = process.env.OPENAI_API_KEY;
const resurfaceModel =
  process.env.OPENAI_RESURFACE_MODEL || "gpt-5-mini-2025-08-07";
const embeddingModel =
  process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-large";
const devAutoUser = process.env.DEV_AUTO_USER === "true";
const devUserEmail = process.env.DEV_USER_EMAIL || "dev@local";
const devUserApiKey = process.env.DEV_USER_API_KEY || null;

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

async function generateQueryEmbedding(query) {
  if (!openaiApiKey || !query) return null;
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: embeddingModel,
      input: query,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    app.log.error({ status: res.status, errText }, "embedding_failed");
    return null;
  }
  const data = await res.json();
  const vector = data?.data?.[0]?.embedding;
  if (!Array.isArray(vector)) return null;
  return vector;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(hash, "hex");
  if (storedBuf.length !== derived.length) return false;
  return crypto.timingSafeEqual(storedBuf, derived);
}

function generateApiKey() {
  return crypto.randomBytes(24).toString("hex");
}

async function ensureDevUser() {
  const { rows } = await pool.query(
    "SELECT id, email, api_key FROM users WHERE email = $1",
    [devUserEmail]
  );
  if (rows.length > 0) return rows[0];
  const id = crypto.randomUUID();
  const apiKey = devUserApiKey || generateApiKey();
  await pool.query(
    "INSERT INTO users (id, email, api_key) VALUES ($1, $2, $3)",
    [id, devUserEmail, apiKey]
  );
  return { id, email: devUserEmail, api_key: apiKey };
}

app.addHook("preHandler", async (request, reply) => {
  const url = request.routeOptions?.url || request.url || "";
  if (url.startsWith("/health") || (url.startsWith("/auth/") && url !== "/auth/me")) return;

  const authHeader = request.headers.authorization || "";
  const headerToken = authHeader.replace(/^Bearer\\s+/i, "").trim();
  const xApiKey = String(request.headers["x-api-key"] || "").trim();
  const queryKey = String(request.query?.api_key || "").trim();
  const cleanedHeaderToken = headerToken.replace(/^"(.+)"$/, "$1");
  const token = xApiKey || queryKey || cleanedHeaderToken;
  if (url.startsWith("/tags")) {
    app.log.info(
      {
        authHeaderPresent: Boolean(authHeader),
        headerLen: headerToken ? headerToken.length : 0,
        xApiKeyLen: xApiKey ? xApiKey.length : 0,
        queryKeyLen: queryKey ? queryKey.length : 0,
      },
      "auth_debug_tags"
    );
  }
  if (url.startsWith("/resurface")) {
    const tokenHash = token
      ? crypto.createHash("sha256").update(token).digest("hex").slice(0, 8)
      : "";
    app.log.info(
      {
        authHeaderPresent: Boolean(authHeader),
        headerLen: headerToken ? headerToken.length : 0,
        xApiKeyLen: xApiKey ? xApiKey.length : 0,
        queryKeyLen: queryKey ? queryKey.length : 0,
        tokenHash,
      },
      "auth_debug_resurface"
    );
  }
  if (!token) {
    if (devAutoUser) {
      request.user = await ensureDevUser();
      request.allowNullUser = true;
      return;
    }
    reply.code(401).send({ error: "unauthorized" });
    return;
  }

  const { rows } = await pool.query(
    "SELECT id, email, api_key FROM users WHERE api_key = $1",
    [token]
  );
  if (url.startsWith("/resurface")) {
    app.log.info(
      { userFound: rows.length > 0 },
      "auth_debug_resurface_lookup"
    );
  }
  if (rows.length === 0) {
    reply.code(401).send({ error: "unauthorized" });
    return;
  }
  request.user = rows[0];
});

app.post("/auth/register", async (request, reply) => {
  const { email, password } = request.body || {};
  if (!email || !password) {
    reply.code(400);
    return { error: "email_password_required" };
  }
  const { rows } = await pool.query("SELECT id FROM users WHERE email = $1", [
    email,
  ]);
  if (rows.length > 0) {
    reply.code(409);
    return { error: "email_exists" };
  }
  const id = crypto.randomUUID();
  const apiKey = generateApiKey();
  const passwordHash = hashPassword(password);
  await pool.query(
    "INSERT INTO users (id, email, password_hash, api_key) VALUES ($1, $2, $3, $4)",
    [id, email, passwordHash, apiKey]
  );
  reply.code(201);
  return { api_key: apiKey };
});

app.post("/auth/login", async (request, reply) => {
  const { email, password } = request.body || {};
  if (!email || !password) {
    reply.code(400);
    return { error: "email_password_required" };
  }
  const { rows } = await pool.query(
    "SELECT id, email, password_hash, api_key FROM users WHERE email = $1",
    [email]
  );
  if (rows.length === 0) {
    reply.code(401);
    return { error: "invalid_credentials" };
  }
  const user = rows[0];
  if (!verifyPassword(password, user.password_hash)) {
    reply.code(401);
    return { error: "invalid_credentials" };
  }
  return { api_key: user.api_key };
});

app.get("/auth/verify", async (request, reply) => {
  const apiKey = String(request.query?.api_key || "").trim();
  if (!apiKey) {
    reply.code(400);
    return { ok: false, error: "api_key_required" };
  }
  const { rows } = await pool.query(
    "SELECT id, email FROM users WHERE api_key = $1",
    [apiKey]
  );
  if (rows.length === 0) {
    reply.code(404);
    return { ok: false, error: "not_found" };
  }
  return { ok: true, user: rows[0] };
});

app.post("/auth/verify", async (request, reply) => {
  const { api_key: apiKey } = request.body || {};
  if (!apiKey) {
    reply.code(400);
    return { ok: false, error: "api_key_required" };
  }
  const { rows } = await pool.query(
    "SELECT id, email FROM users WHERE api_key = $1",
    [apiKey]
  );
  if (rows.length === 0) {
    reply.code(404);
    return { ok: false, error: "not_found" };
  }
  return { ok: true, user: rows[0] };
});

app.get("/auth/me", async (request, reply) => {
  const user = request.user;
  if (!user) {
    reply.code(401);
    return { error: "unauthorized" };
  }
  return { id: user.id, email: user.email, api_key: user.api_key };
});

function userCondition(alias, allowNull) {
  return allowNull
    ? `(${alias}.user_id = $1 OR ${alias}.user_id IS NULL)`
    : `${alias}.user_id = $1`;
}

async function generateResurfaceReason(item) {
  if (!openaiApiKey) return "";
  const excerpt = item.content_text
    ? String(item.content_text).slice(0, 500)
    : "";
  const note = item.metadata?.note ? `Note: ${item.metadata.note}` : "";
  const prompt = `Write one short sentence (max 20 words) explaining why this saved item is worth resurfacing to the user.`;
  const input = `Title: ${item.title}\nType: ${item.type}\n${note}\nExcerpt: ${excerpt}`;

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: resurfaceModel,
      instructions: prompt,
      input,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    app.log.error({ status: res.status, errText }, "resurface_reason_failed");
    return "";
  }

  const data = await res.json();
  return extractOutputText(data).trim();
}

app.get("/health", async () => ({ ok: true }));

app.get("/tags", async (request) => {
  const userId = request.user?.id;
  const allowNull = request.allowNullUser === true;
  const condition = allowNull
    ? "(i.user_id = $1 OR i.user_id IS NULL)"
    : "i.user_id = $1";
  const { rows } = await pool.query(
    `SELECT t.name, t.source, COUNT(it.item_id) AS count
     FROM tags t
     JOIN item_tags it ON it.tag_id = t.id
     JOIN items i ON i.id = it.item_id
     WHERE ${condition}
     GROUP BY t.name, t.source
     ORDER BY t.name ASC`,
    [userId]
  );
  return { tags: rows };
});

app.get("/resurface", async (request) => {
  const { limit = 5, days = 30, ai = "1" } = request.query || {};
  const limitNum = Math.min(Number(limit) || 5, 20);
  const daysNum = Math.min(Number(days) || 30, 365);
  const userId = request.user?.id;
  const allowNull = request.allowNullUser === true;
  const condition = allowNull ? "(i.user_id = $3 OR i.user_id IS NULL)" : "i.user_id = $3";

  const { rows } = await pool.query(
    `SELECT i.id, i.url, i.title, i.type, i.content_text, i.metadata, i.created_at
     FROM items i
     LEFT JOIN resurfacing_log r
       ON r.item_id = i.id
      AND r.surfaced_at > NOW() - ($1 || ' days')::interval
     WHERE i.created_at < NOW() - ($1 || ' days')::interval
       AND r.item_id IS NULL
       AND ${condition}
     ORDER BY random()
     LIMIT $2`,
    [String(daysNum), limitNum, userId]
  );

  const now = Date.now();
  const items = [];
  for (const item of rows) {
    const daysAgo = Math.max(
      1,
      Math.floor((now - new Date(item.created_at).getTime()) / 86400000)
    );
    let reason = `You saved this ${daysAgo} days ago.`;
    if (ai !== "0" && openaiApiKey) {
      const aiReason = await generateResurfaceReason(item);
      if (aiReason) reason = aiReason;
    }
    items.push({
      id: item.id,
      url: item.url,
      title: item.title,
      type: item.type,
      created_at: item.created_at,
      reason,
    });
  }

  if (items.length > 0) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const it of items) {
        await client.query(
          "INSERT INTO resurfacing_log (id, item_id, user_id) VALUES ($1, $2, $3)",
          [crypto.randomUUID(), it.id, userId]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  }

  return { items };
});

app.get("/graph", async (request) => {
  const { limit = 60, max_edges = 120 } = request.query || {};
  const limitNum = Math.min(Number(limit) || 60, 200);
  const maxEdges = Math.min(Number(max_edges) || 120, 500);
  const userId = request.user?.id;
  const allowNull = request.allowNullUser === true;
  const condition = allowNull ? "(user_id = $2 OR user_id IS NULL)" : "user_id = $2";

  const { rows: nodes } = await pool.query(
    `SELECT id, title, type
     FROM items
     WHERE ${condition}
     ORDER BY created_at DESC
     LIMIT $1`,
    [limitNum, userId]
  );

  if (nodes.length < 2) return { nodes, links: [] };

  const { rows: links } = await pool.query(
    `WITH items_limited AS (
        SELECT id FROM items WHERE ${
          allowNull ? "(user_id = $3 OR user_id IS NULL)" : "user_id = $3"
        } ORDER BY created_at DESC LIMIT $1
     )
     SELECT it1.item_id AS source, it2.item_id AS target, COUNT(*)::int AS weight
     FROM item_tags it1
     JOIN item_tags it2
       ON it1.tag_id = it2.tag_id
      AND it1.item_id < it2.item_id
     WHERE it1.item_id IN (SELECT id FROM items_limited)
       AND it2.item_id IN (SELECT id FROM items_limited)
     GROUP BY it1.item_id, it2.item_id
     ORDER BY weight DESC
     LIMIT $2`,
    [limitNum, maxEdges, userId]
  );

  return { nodes, links };
});

app.get("/clusters", async (request) => {
  const { limit = 20 } = request.query || {};
  const limitNum = Math.min(Number(limit) || 20, 100);
  const userId = request.user?.id;
  const allowNull = request.allowNullUser === true;
  const condition = allowNull ? "(i.user_id = $2 OR i.user_id IS NULL)" : "i.user_id = $2";

  const { rows } = await pool.query(
    `SELECT t.name, COUNT(it.item_id)::int AS count,
            COALESCE(json_agg(i.title) FILTER (WHERE i.title IS NOT NULL), '[]') AS items
     FROM tags t
     JOIN item_tags it ON it.tag_id = t.id
     JOIN items i ON i.id = it.item_id
     WHERE ${condition}
     GROUP BY t.name
     ORDER BY count DESC
     LIMIT $1`,
    [limitNum, userId]
  );
  return { clusters: rows };
});

app.get("/collections", async (request) => {
  const userId = request.user?.id;
  const { rows } = await pool.query(
    "SELECT id, name, rules_json, created_at FROM collections WHERE user_id = $1 ORDER BY created_at DESC",
    [userId]
  );
  return { collections: rows };
});

app.post("/collections", async (request, reply) => {
  const { name, rules } = request.body || {};
  const userId = request.user?.id;
  if (!name) {
    reply.code(400);
    return { error: "name_required" };
  }
  const id = crypto.randomUUID();
  await pool.query(
    "INSERT INTO collections (id, user_id, name, rules_json) VALUES ($1, $2, $3, $4)",
    [id, userId, name, rules || {}]
  );
  reply.code(201);
  return { id };
});

app.get("/collections/:id", async (request, reply) => {
  const { id } = request.params || {};
  const userId = request.user?.id;
  const { rows } = await pool.query(
    "SELECT id, name, rules_json, created_at FROM collections WHERE id = $1 AND user_id = $2",
    [id, userId]
  );
  if (rows.length === 0) {
    reply.code(404);
    return { error: "not_found" };
  }
  return rows[0];
});

app.delete("/collections/:id", async (request, reply) => {
  const { id } = request.params || {};
  const userId = request.user?.id;
  if (!id) {
    reply.code(400);
    return { error: "id_required" };
  }
  await pool.query("DELETE FROM collections WHERE id = $1 AND user_id = $2", [
    id,
    userId,
  ]);
  return { ok: true };
});

app.get("/collections/:id/items", async (request, reply) => {
  const { id } = request.params || {};
  const userId = request.user?.id;
  const { rows } = await pool.query(
    "SELECT id, name, rules_json FROM collections WHERE id = $1 AND user_id = $2",
    [id, userId]
  );
  if (rows.length === 0) {
    reply.code(404);
    return { error: "not_found" };
  }

  const rules = rows[0].rules_json || {};
  if (!rules || Object.keys(rules).length === 0) {
    const { rows: items } = await pool.query(
      `SELECT i.id, i.url, i.title, i.type, i.content_text, i.metadata, i.created_at
       FROM collection_items ci
       JOIN items i ON i.id = ci.item_id
       WHERE ci.collection_id = $1
       ORDER BY ci.created_at DESC`,
      [id]
    );
    return { items, mode: "manual" };
  }

  const { q = "", type, tag, from, to } = rules;
  const conditions = [];
  const filterValues = [];

  if (q) {
    filterValues.push(`%${q}%`);
    conditions.push(`i.title ILIKE $${filterValues.length}`);
  }
  if (type && type !== "all") {
    filterValues.push(type);
    conditions.push(`i.type = $${filterValues.length}`);
  }
  if (from) {
    filterValues.push(from);
    conditions.push(`i.created_at >= $${filterValues.length}`);
  }
  if (to) {
    filterValues.push(to);
    conditions.push(`i.created_at <= $${filterValues.length}`);
  }
  if (tag) {
    filterValues.push(tag);
    conditions.push(
      `EXISTS (SELECT 1 FROM item_tags it2 JOIN tags t2 ON t2.id = it2.tag_id WHERE it2.item_id = i.id AND t2.name = $${filterValues.length})`
    );
  }

  const userCond = request.allowNullUser === true
    ? "(i.user_id = $1 OR i.user_id IS NULL)"
    : "i.user_id = $1";
  const whereClause =
    conditions.length > 0
      ? `WHERE ${userCond} AND ${conditions.join(" AND ")}`
      : `WHERE ${userCond}`;

  const { rows: items } = await pool.query(
    `SELECT i.id, i.url, i.title, i.type, i.content_text, i.metadata, i.created_at
     FROM items i
     ${whereClause}
     ORDER BY i.created_at DESC
     LIMIT 200`,
    [userId, ...filterValues]
  );

  return { items, mode: "smart" };
});

app.post("/collections/:id/items", async (request, reply) => {
  const { id } = request.params || {};
  const { item_id } = request.body || {};
  const userId = request.user?.id;
  if (!id || !item_id) {
    reply.code(400);
    return { error: "id_required" };
  }
  const { rows } = await pool.query(
    "SELECT id FROM collections WHERE id = $1 AND user_id = $2",
    [id, userId]
  );
  if (rows.length === 0) {
    reply.code(404);
    return { error: "not_found" };
  }
  await pool.query(
    "INSERT INTO collection_items (collection_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [id, item_id]
  );
  return { ok: true };
});

app.delete("/collections/:id/items/:item_id", async (request, reply) => {
  const { id, item_id } = request.params || {};
  const userId = request.user?.id;
  if (!id || !item_id) {
    reply.code(400);
    return { error: "id_required" };
  }
  const { rows } = await pool.query(
    "SELECT id FROM collections WHERE id = $1 AND user_id = $2",
    [id, userId]
  );
  if (rows.length === 0) {
    reply.code(404);
    return { error: "not_found" };
  }
  await pool.query(
    "DELETE FROM collection_items WHERE collection_id = $1 AND item_id = $2",
    [id, item_id]
  );
  return { ok: true };
});

app.get("/items/:id/highlights", async (request) => {
  const { id } = request.params || {};
  const userId = request.user?.id;
  const allowNull = request.allowNullUser === true;
  const { rows } = await pool.query(
    `SELECT h.id, h.text, h.note, h.start_offset, h.end_offset, h.created_at
     FROM highlights h
     JOIN items i ON i.id = h.item_id
     WHERE h.item_id = $1 AND ${
       allowNull ? "(i.user_id = $2 OR i.user_id IS NULL)" : "i.user_id = $2"
     }
     ORDER BY h.created_at DESC`,
    [id, userId]
  );
  return { highlights: rows };
});

app.post("/items/:id/highlights", async (request, reply) => {
  const { id } = request.params || {};
  const { text, note, start_offset, end_offset } = request.body || {};
  const userId = request.user?.id;
  const allowNull = request.allowNullUser === true;
  if (!text) {
    reply.code(400);
    return { error: "text_required" };
  }
  const { rows: itemRows } = await pool.query(
    `SELECT id FROM items WHERE id = $1 AND ${
      allowNull ? "(user_id = $2 OR user_id IS NULL)" : "user_id = $2"
    }`,
    [id, userId]
  );
  if (itemRows.length === 0) {
    reply.code(404);
    return { error: "not_found" };
  }
  const hid = crypto.randomUUID();
  await pool.query(
    `INSERT INTO highlights (id, item_id, text, note, start_offset, end_offset)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [hid, id, text, note || null, start_offset || null, end_offset || null]
  );
  reply.code(201);
  return { id: hid };
});

app.post("/items", async (request, reply) => {
  const { url, title, type, note, highlight } = request.body || {};
  const userId = request.user?.id;

  function inferType(inputUrl = "") {
    const lower = String(inputUrl).toLowerCase();
    if (lower.includes("twitter.com/") || lower.includes("x.com/")) return "tweet";
    if (lower.endsWith(".pdf")) return "pdf";
    if (lower.match(/\.(png|jpg|jpeg|gif|webp|svg)$/)) return "image";
    if (
      lower.includes("youtube.com/") ||
      lower.includes("youtu.be/") ||
      lower.includes("vimeo.com/")
    )
      return "video";
    return "article";
  }

  const normalizedType = type || inferType(url);

  if (!url && normalizedType !== "note") {
    reply.code(400);
    return { error: "url_required" };
  }

  const id = uuidv4();
  const safeUrl = url || `note:${id}`;
  const safeTitle = title || safeUrl;

  await pool.query(
    "INSERT INTO items (id, user_id, url, title, type, metadata) VALUES ($1, $2, $3, $4, $5, $6)",
    [
      id,
      userId,
      safeUrl,
      safeTitle,
      normalizedType,
      {
        note: note || null,
        highlight: highlight || null,
      },
    ]
  );

  await itemQueue.add("process-item", { itemId: id, url: safeUrl, type: normalizedType });

  reply.code(201);
  return { id };
});

app.get("/search", async (request) => {
  const { q = "", limit = 20, type, from, to, tag } = request.query || {};
  const limitNum = Math.min(Number(limit) || 20, 50);

  const userId = request.user?.id;
  const allowNull = request.allowNullUser === true;
  const conditions = [
    allowNull ? "(i.user_id = $1 OR i.user_id IS NULL)" : "i.user_id = $1",
  ];
  const filterValues = [userId];

  if (q) {
    filterValues.push(`%${q}%`);
    conditions.push(`i.title ILIKE $${filterValues.length}`);
  }
  if (type && type !== "all") {
    filterValues.push(type);
    conditions.push(`i.type = $${filterValues.length}`);
  }
  if (from) {
    filterValues.push(from);
    conditions.push(`i.created_at >= $${filterValues.length}`);
  }
  if (to) {
    filterValues.push(to);
    conditions.push(`i.created_at <= $${filterValues.length}`);
  }
  if (tag) {
    filterValues.push(tag);
    conditions.push(
      `EXISTS (SELECT 1 FROM item_tags it2 JOIN tags t2 ON t2.id = it2.tag_id WHERE it2.item_id = i.id AND t2.name = $${filterValues.length})`
    );
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  let rows = [];
  let usedSemantic = false;
  if (q && openaiApiKey) {
    const embedding = await generateQueryEmbedding(String(q));
    if (embedding) {
      usedSemantic = true;
      const vectorLiteral = `[${embedding.join(",")}]`;
      const vectorIndex = filterValues.length + 1;
      const limitIndex = filterValues.length + 2;
      const { rows: semanticRows } = await pool.query(
        `WITH candidates AS (
           SELECT i.id
           FROM items i
           ${whereClause}
         )
         SELECT i.id, i.url, i.title, i.type, i.content_text, i.metadata, i.created_at,
                COALESCE(json_agg(t.name) FILTER (WHERE t.name IS NOT NULL), '[]') AS tags,
                (1 - (e.vector <=> $${vectorIndex}::vector)) AS score
         FROM candidates c
         JOIN embeddings e ON e.item_id = c.id
         JOIN items i ON i.id = c.id
         LEFT JOIN item_tags it ON it.item_id = i.id
         LEFT JOIN tags t ON t.id = it.tag_id
         GROUP BY i.id, e.vector
         ORDER BY e.vector <=> $${vectorIndex}::vector
         LIMIT $${limitIndex}`,
        [...filterValues, vectorLiteral, limitNum]
      );
      rows = semanticRows;
    }
  }

  if (!usedSemantic || rows.length === 0) {
    const { rows: basicRows } = await pool.query(
      `SELECT i.id, i.url, i.title, i.type, i.content_text, i.metadata, i.created_at,
              COALESCE(json_agg(t.name) FILTER (WHERE t.name IS NOT NULL), '[]') AS tags
       FROM items i
       LEFT JOIN item_tags it ON it.item_id = i.id
       LEFT JOIN tags t ON t.id = it.tag_id
       ${whereClause}
       GROUP BY i.id
       ORDER BY i.created_at DESC
       LIMIT $${filterValues.length + 1}`,
      [...filterValues, limitNum]
    );
    rows = basicRows;
  }

  return { items: rows, semantic: usedSemantic };
});

app.get("/items/:id", async (request, reply) => {
  const { id } = request.params || {};
  const userId = request.user?.id;
  const allowNull = request.allowNullUser === true;
  const condition = allowNull ? "(i.user_id = $2 OR i.user_id IS NULL)" : "i.user_id = $2";
  const { rows } = await pool.query(
    `SELECT i.id, i.url, i.title, i.type, i.content_text, i.metadata, i.created_at,
            COALESCE(json_agg(t.name) FILTER (WHERE t.name IS NOT NULL), '[]') AS tags
     FROM items i
     LEFT JOIN item_tags it ON it.item_id = i.id
     LEFT JOIN tags t ON t.id = it.tag_id
     WHERE i.id = $1 AND ${condition}
     GROUP BY i.id`,
    [id, userId]
  );
  if (rows.length === 0) {
    reply.code(404);
    return { error: "not_found" };
  }
  return rows[0];
});

app.delete("/items/:id", async (request, reply) => {
  const { id } = request.params || {};
  const userId = request.user?.id;
  const allowNull = request.allowNullUser === true;
  const condition = allowNull ? "(user_id = $2 OR user_id IS NULL)" : "user_id = $2";
  const { rows } = await pool.query(
    `DELETE FROM items WHERE id = $1 AND ${condition} RETURNING id`,
    [id, userId]
  );
  if (rows.length === 0) {
    reply.code(404);
    return { error: "not_found" };
  }
  return { ok: true, id };
});

app.get("/items/:id/related", async (request, reply) => {
  const { id } = request.params || {};
  const { limit = 6 } = request.query || {};
  const limitNum = Math.min(Number(limit) || 6, 20);
  const userId = request.user?.id;
  const allowNull = request.allowNullUser === true;
  const itemCond = allowNull ? "(i.user_id = $2 OR i.user_id IS NULL)" : "i.user_id = $2";

  if (!id) {
    reply.code(400);
    return { error: "id_required" };
  }

  const { rows: ownerRows } = await pool.query(
    `SELECT id FROM items WHERE id = $1 AND ${
      allowNull ? "(user_id = $2 OR user_id IS NULL)" : "user_id = $2"
    }`,
    [id, userId]
  );
  if (ownerRows.length === 0) {
    reply.code(404);
    return { error: "not_found" };
  }

  const { rows: embRows } = await pool.query(
    `SELECT e.item_id
     FROM embeddings e
     JOIN items i ON i.id = e.item_id
     WHERE e.item_id = $1 AND ${itemCond}`,
    [id, userId]
  );

  if (embRows.length > 0) {
    const { rows } = await pool.query(
      `SELECT i2.id, i2.url, i2.title, i2.type, i2.created_at,
              (1 - (e2.vector <=> e1.vector)) AS score
       FROM embeddings e1
       JOIN embeddings e2 ON e2.item_id <> e1.item_id
       JOIN items i2 ON i2.id = e2.item_id
       WHERE e1.item_id = $1 AND ${allowNull ? "(i2.user_id = $3 OR i2.user_id IS NULL)" : "i2.user_id = $3"}
       ORDER BY e2.vector <=> e1.vector
       LIMIT $2`,
      [id, limitNum, userId]
    );
    if (rows.length > 0) {
      return { items: rows, strategy: "semantic" };
    }
  }

  const { rows: tagRows } = await pool.query(
    `SELECT it.tag_id
     FROM item_tags it
     JOIN items i ON i.id = it.item_id
     WHERE it.item_id = $1 AND ${itemCond}`,
    [id, userId]
  );

  if (tagRows.length > 0) {
    const { rows } = await pool.query(
      `SELECT i2.id, i2.url, i2.title, i2.type, i2.created_at,
              COUNT(*)::int AS score,
              COALESCE(json_agg(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL), '[]') AS shared_tags
       FROM item_tags it1
       JOIN item_tags it2 ON it1.tag_id = it2.tag_id AND it2.item_id <> $1
       JOIN items i2 ON i2.id = it2.item_id
       JOIN tags t ON t.id = it2.tag_id
       WHERE it1.item_id = $1 AND ${allowNull ? "(i2.user_id = $3 OR i2.user_id IS NULL)" : "i2.user_id = $3"}
       GROUP BY i2.id
       ORDER BY score DESC, i2.created_at DESC
       LIMIT $2`,
      [id, limitNum, userId]
    );

    if (rows.length > 0) {
      return { items: rows, strategy: "shared_tags" };
    }
  }

  const { rows: recentRows } = await pool.query(
    `SELECT id, url, title, type, created_at
     FROM items
     WHERE id <> $1 AND ${allowNull ? "(user_id = $2 OR user_id IS NULL)" : "user_id = $2"}
     ORDER BY created_at DESC
     LIMIT $3`,
    [id, userId, limitNum]
  );
  return { items: recentRows, strategy: "recent" };
});

app.put("/items/:id/tags", async (request, reply) => {
  const { id } = request.params || {};
  const { tags } = request.body || {};
  const userId = request.user?.id;
  const allowNull = request.allowNullUser === true;

  if (!id) {
    reply.code(400);
    return { error: "id_required" };
  }

  const { rows: itemRows } = await pool.query(
    `SELECT id FROM items WHERE id = $1 AND ${
      allowNull ? "(user_id = $2 OR user_id IS NULL)" : "user_id = $2"
    }`,
    [id, userId]
  );
  if (itemRows.length === 0) {
    reply.code(404);
    return { error: "not_found" };
  }

  let tagList = [];
  if (Array.isArray(tags)) {
    tagList = tags;
  } else if (typeof tags === "string") {
    tagList = tags.split(",").map((t) => t.trim());
  }

  tagList = Array.from(new Set(tagList.map((t) => String(t).trim()).filter(Boolean)));

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM item_tags
       USING tags
       WHERE item_tags.tag_id = tags.id
         AND item_tags.item_id = $1
         AND tags.source = 'user'`,
      [id]
    );

    for (const tag of tagList) {
      const { rows } = await client.query(
        "INSERT INTO tags (id, name, source) VALUES ($1, $2, $3) ON CONFLICT (name) DO UPDATE SET source = EXCLUDED.source RETURNING id",
        [crypto.randomUUID(), tag, "user"]
      );
      const tagId = rows[0]?.id;
      if (tagId) {
        await client.query(
          "INSERT INTO item_tags (item_id, tag_id, confidence) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
          [id, tagId, 1.0]
        );
      }
    }

    const { rows: tagRows } = await client.query(
      `SELECT COALESCE(json_agg(t.name) FILTER (WHERE t.name IS NOT NULL), '[]') AS tags
       FROM item_tags it
       JOIN tags t ON t.id = it.tag_id
       WHERE it.item_id = $1`,
      [id]
    );

    await client.query("COMMIT");
    return { id, tags: tagRows[0]?.tags || [] };
  } catch (err) {
    await client.query("ROLLBACK");
    reply.code(500);
    return { error: "tag_update_failed" };
  } finally {
    client.release();
  }
});

app.put("/items/:id/note", async (request, reply) => {
  const { id } = request.params || {};
  const { note } = request.body || {};
  const userId = request.user?.id;
  const allowNull = request.allowNullUser === true;

  if (!id) {
    reply.code(400);
    return { error: "id_required" };
  }

  const safeNote = typeof note === "string" ? note.trim() : "";

  const { rows } = await pool.query(
    `UPDATE items
     SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('note', $2::text)
     WHERE id = $1 AND ${allowNull ? "(user_id = $3 OR user_id IS NULL)" : "user_id = $3"}
     RETURNING id, metadata`,
    [id, safeNote, userId]
  );

  if (rows.length === 0) {
    reply.code(404);
    return { error: "not_found" };
  }

  return rows[0];
});

const port = Number(process.env.PORT || 3001);
app.listen({ port, host: "0.0.0.0" });
