# Termooo Libras — Front

React + Vite app with:

- `/` — landing page (links to Termooo and to the detector)
- `/termooo/` — legacy Termooo game (served as static files from `public/termooo/`)
- `/detect` — webcam hand-sign detector (MediaPipe Hands + k-NN classifier)
- `/api/samples` — Vercel serverless function that reads/writes hand samples in Neon Postgres

## Local development

Install deps once:

```sh
yarn install
```

Then choose:

- **UI only** (no database/API): `yarn dev` — the `/detect` page will load but will fail to fetch or save samples.
- **Full stack** (UI + serverless `/api/*` routes + Neon): `npx vercel dev` inside this folder. Put the `DATABASE_URL` into `.env.local` (already in `.gitignore`).

## Environment variables

| Name           | Description                                      |
| -------------- | ------------------------------------------------ |
| `DATABASE_URL` | Neon Postgres connection string (pooled, SSL).   |

Set it in Vercel Project Settings → Environment Variables for production.

## Deploy (Vercel)

- Set **Root Directory** = `front` in the Vercel project settings.
- Framework preset: Vite.
- Add `DATABASE_URL` as an Environment Variable.
