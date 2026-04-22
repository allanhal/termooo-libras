import { neon } from "@neondatabase/serverless";

export const sql = neon(process.env.DATABASE_URL);

let schemaReady;
export function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS samples (
          id BIGSERIAL PRIMARY KEY,
          letter TEXT NOT NULL,
          landmarks JSONB NOT NULL,
          handedness TEXT,
          device_id TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS samples_letter_idx ON samples(letter)`;
    })();
  }
  return schemaReady;
}
