# Usage Meter API Worker

Minimal Cloudflare Worker for the Wear OS MVP.

## Routes

- `POST /usage`: Mac Usage Meter uploads the latest JSON.
- `GET /usage`: Pixel Watch app reads the latest JSON.

Both routes require either `Authorization: Bearer <key>` or `x-api-key: <key>`.

## Setup

```sh
cd api/cloudflare-worker
cp wrangler.toml.example wrangler.toml
wrangler kv namespace create USAGE_METER_KV
wrangler secret put USAGE_METER_API_KEY
wrangler deploy
```

Use the deployed `/usage` URL and the same API key in:

- Mac: `wear-sync.json` in the Electron user data directory, or environment variables.
- Wear app: `wear/local.properties`.
