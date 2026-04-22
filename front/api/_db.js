import { neon } from "@neondatabase/serverless";

export const sql = neon(process.env.DATABASE_URL);

let schemaReady;
export function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS samples (
          id BIGSERIAL PRIMARY KEY,
          label TEXT NOT NULL,
          landmarks JSONB NOT NULL,
          handedness TEXT,
          device_id TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      // Idempotent rename from the pre-v2 column name "letter" to "label".
      await sql`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'samples' AND column_name = 'letter'
          ) AND NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'samples' AND column_name = 'label'
          ) THEN
            EXECUTE 'ALTER TABLE samples RENAME COLUMN letter TO label';
          END IF;
          IF EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE tablename = 'samples' AND indexname = 'samples_letter_idx'
          ) THEN
            EXECUTE 'ALTER INDEX samples_letter_idx RENAME TO samples_label_idx';
          END IF;
        END $$;
      `;
      await sql`CREATE INDEX IF NOT EXISTS samples_label_idx ON samples(label)`;

      await sql`
        CREATE TABLE IF NOT EXISTS motion_samples (
          id BIGSERIAL PRIMARY KEY,
          label TEXT NOT NULL,
          frames JSONB NOT NULL,
          duration_ms INTEGER,
          handedness TEXT,
          device_id TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS motion_samples_label_idx ON motion_samples(label)`;
    })();
  }
  return schemaReady;
}
