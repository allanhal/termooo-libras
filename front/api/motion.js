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
      const rows = await sql`DELETE FROM motion_samples WHERE id = ${id} RETURNING id`;
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      return res.status(200).json({ deletedId: rows[0].id });
    }

    if (req.method === "GET") {
      // Frames are heavy (N frames × 21 points × 3 nums). Default to metadata only;
      // callers pass ?frames=1 when they actually need the sequences.
      const includeFrames = req.query?.frames === "1" || req.query?.frames === "true";
      const rows = includeFrames
        ? await sql`
            SELECT id, label, frames, duration_ms, handedness, device_id, created_at,
                   jsonb_array_length(frames) AS frame_count
            FROM motion_samples
            ORDER BY created_at DESC
          `
        : await sql`
            SELECT id, label, duration_ms, handedness, device_id, created_at,
                   jsonb_array_length(frames) AS frame_count
            FROM motion_samples
            ORDER BY created_at DESC
          `;
      return res.status(200).json({ samples: rows });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
      const { label, frames, durationMs, handedness, deviceId } = body;

      if (typeof label !== "string" || !label.trim()) {
        return res.status(400).json({ error: "label (string) is required" });
      }
      if (!Array.isArray(frames) || frames.length < 2) {
        return res.status(400).json({ error: "frames must be an array of at least 2 landmark arrays" });
      }
      for (const f of frames) {
        if (!Array.isArray(f) || f.length !== 21) {
          return res.status(400).json({ error: "each frame must be an array of 21 landmark points" });
        }
      }

      const [row] = await sql`
        INSERT INTO motion_samples (label, frames, duration_ms, handedness, device_id)
        VALUES (
          ${label.trim()},
          ${JSON.stringify(frames)}::jsonb,
          ${Number.isFinite(durationMs) ? Math.round(durationMs) : null},
          ${handedness ?? null},
          ${deviceId ?? null}
        )
        RETURNING id, label, frames, duration_ms, handedness, device_id, created_at,
                  jsonb_array_length(frames) AS frame_count
      `;
      return res.status(201).json({ sample: row });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[api/motion]", err);
    return res.status(500).json({ error: err.message ?? "Internal error" });
  }
}
