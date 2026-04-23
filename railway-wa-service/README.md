# Al Hamra — Local WhatsApp Service (Railway)

This folder contains the Railway deployment configuration for the **Local WhatsApp Channels** integration.
It wraps **Evolution API** — an open-source WhatsApp REST API built on Baileys.

## Architecture

```
WhatsApp Phone ──(scan QR)──> Evolution API on Railway
                                      │
                                      │ webhook (POST)
                                      ▼
                           local-wa-webhook (Supabase Edge Fn)
                                      │
                                      ▼
                           wa_channels / wa_conversations / wa_messages
                           (same tables as Wazzup24, source='local')
                                      │
                                      ▼
                           /local-whatsapp page in CRM
```

## Deployment on Railway

### Option A: Evolution API (Recommended)
Railway has a one-click template. In your Railway project:

1. Click **+ New Service** → **Template**
2. Search for **Evolution API**
3. It provisions: Evolution API + PostgreSQL + Redis automatically
4. Set these environment variables in the Evolution API service:

```
AUTHENTICATION_TYPE=apikey
AUTHENTICATION_API_KEY=<choose-a-strong-key>
WEBHOOK_GLOBAL_ENABLED=true
WEBHOOK_GLOBAL_URL=https://hvhggfieaykcrlqxumeh.supabase.co/functions/v1/local-wa-webhook
WEBHOOK_GLOBAL_WEBHOOK_BY_EVENTS=true
WEBHOOK_GLOBAL_EVENTS_MESSAGES_UPSERT=true
WEBHOOK_GLOBAL_EVENTS_QRCODE_UPDATED=true
WEBHOOK_GLOBAL_EVENTS_CONNECTION_UPDATE=true
CORS_ORIGIN=https://alhamra-crm.lovable.app
```

5. Copy the Railway public URL for the Evolution API service (e.g. `https://evolution-api-xxxx.up.railway.app`)
6. Set **RAILWAY_WA_URL** and **RAILWAY_WA_API_KEY** in Supabase Edge Function secrets

### Option B: Custom Node.js service (this folder)
If you want full control, deploy the custom service from `railway-wa-service/`.
It's a thin Express wrapper around whatsapp-web.js with the same webhook contract.

## Environment Variables needed in Supabase (Edge Function Secrets)

| Name | Value |
|---|---|
| `RAILWAY_WA_URL` | e.g. `https://evolution-api-xxxx.up.railway.app` |
| `RAILWAY_WA_API_KEY` | The API key you set in Evolution API |
| `LOCAL_WA_WEBHOOK_SECRET` | A shared secret to validate incoming webhooks |

## Instance Management

Each WhatsApp number = one **instance** in Evolution API.
The CRM `/local-whatsapp` page lets managers:
- Create a new instance (enter a name/label)
- Scan the QR code to connect that WhatsApp number
- See connected status and last activity
- Delete/disconnect instances

## Webhook Events received from Evolution API

| Event | Action in CRM |
|---|---|
| `QRCODE_UPDATED` | Updates QR code shown on /local-whatsapp page |
| `CONNECTION_UPDATE` | Updates channel state in wa_channels |
| `MESSAGES_UPSERT` | Creates wa_conversation + wa_message |
