import { sql, ensureSchema } from "./_db.js";
import { isAdmin } from "./_auth.js";

export default async function handler(req, res) {
  try {
    await ensureSchema();

    if (req.method === "DELETE") {
      if (!isAdmin(req)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const id = Number.parseInt(req.query?.id, 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: "id (integer) query param required" });
      }
      const rows = await sql`DELETE FROM samples WHERE id = ${id} RETURNING id`;
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      return res.status(200).json({ deletedId: rows[0].id });
    }

    if (req.method === "GET") {
      const rows = await sql`
        SELECT id, letter, landmarks, handedness, device_id, created_at
        FROM samples
        ORDER BY created_at DESC
      `;
      return res.status(200).json({ samples: rows });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
      const { letter, landmarks, handedness, deviceId } = body;

      if (typeof letter !== "string" || !letter.trim()) {
        return res.status(400).json({ error: "letter (string) is required" });
      }
      if (!Array.isArray(landmarks) || landmarks.length !== 21) {
        return res.status(400).json({ error: "landmarks must be an array of 21 points" });
      }

      const [row] = await sql`
        INSERT INTO samples (letter, landmarks, handedness, device_id)
        VALUES (
          ${letter.trim().toUpperCase()},
          ${JSON.stringify(landmarks)}::jsonb,
          ${handedness ?? null},
          ${deviceId ?? null}
        )
        RETURNING id, letter, landmarks, handedness, device_id, created_at
      `;
      return res.status(201).json({ sample: row });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[api/samples]", err);
    return res.status(500).json({ error: err.message ?? "Internal error" });
  }
}
