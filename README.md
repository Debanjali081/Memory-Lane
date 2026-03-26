# AI Extension Tool

MVP scaffolding for a save-and-resurface knowledge app targeted at product/tech folks.

## Apps
- `apps/api`: Fastify API for saving items and serving search
- `apps/worker`: Background jobs (extract, embed, tag, relate, resurface)
- `apps/web`: Next.js frontend (basic shell)

## Packages
- `packages/db`: SQL schema and migrations
- `packages/shared`: shared types and helpers

## Quick start (dev)
1. Copy `.env.example` to `.env` at the repo root and adjust values.
2. Install deps: `npm install`
3. Run API: `npm --workspace apps/api run dev`
4. Run worker: `npm --workspace apps/worker run dev`
5. Run web: `npm --workspace apps/web run dev`

## Storage
This scaffold supports ImageKit as the default media store. You can switch providers with `STORAGE_PROVIDER`.
