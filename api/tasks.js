// ---------- The backend: runs on Vercel's servers, not in the browser ----------
// GET  /api/tasks?list=ID  -> sends back the tasks saved for that list
// POST /api/tasks?list=ID  -> saves the tasks sent in the request
import { Redis } from "@upstash/redis";

// Connection details are added to the project by Vercel when the database is connected.
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

// List IDs are long random codes, so nobody can guess someone else's list.
const VALID_LIST_ID = /^[a-z0-9]{20,64}$/;

// Limits that stop anyone from filling the database with junk.
const MAX_TASKS = 500;
const MAX_TEXT_LENGTH = 500;

export default async function handler(req, res) {
  const listId = String(req.query.list || "");
  if (!VALID_LIST_ID.test(listId)) {
    return res.status(400).json({ error: "Invalid list ID" });
  }
  const key = "list:" + listId;

  if (req.method === "GET") {
    const tasks = (await redis.get(key)) || [];
    return res.status(200).json({ tasks });
  }

  if (req.method === "POST") {
    const tasks = req.body && req.body.tasks;
    const valid =
      Array.isArray(tasks) &&
      tasks.length <= MAX_TASKS &&
      tasks.every(t =>
        t && typeof t.text === "string" && t.text.length <= MAX_TEXT_LENGTH &&
        typeof t.done === "boolean");
    if (!valid) {
      return res.status(400).json({ error: "Invalid tasks" });
    }

    // Keep only the two fields we expect, and drop lists unused for a year.
    const clean = tasks.map(t => ({ text: t.text, done: t.done }));
    await redis.set(key, clean, { ex: 60 * 60 * 24 * 365 });
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
