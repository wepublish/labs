# Dorfkoenig Documentation

## Overview

Dorfkoenig is a web scout monitoring system for journalists that tracks URLs for content changes, extracts atomic information units, and enables AI-powered article draft generation. It includes a feature-flagged Bajour village newsletter workflow with WhatsApp verification and Mailchimp integration. Deployed as a static Svelte 5 SPA on GitHub Pages with Supabase as the backend.

## Quick Links

- [Architecture](../specs/ARCHITECTURE.md) - System design and data flow
- [Database Schema](../specs/DATABASE.md) - Tables, indexes, and functions
- [Authentication](../specs/AUTH.md) - Mock user pattern and JWT migration
- [API Reference](../specs/API.md) - Edge Function endpoints
- [Pipeline Details](../specs/PIPELINES.md) - Scout execution 9-step process
- [Frontend Guide](../specs/FRONTEND.md) - Components and stores
- [Deployment](../specs/DEPLOYMENT.md) - Setup and configuration

## Features

### Web Scout ("Track")
- Monitor any URL for content changes
- Define custom criteria for matching
- Automatic change detection via Firecrawl
- Email notifications when criteria are matched

### Execution Deduplication
- 0.85 cosine similarity threshold
- Prevents duplicate notifications
- pgvector-powered semantic comparison

### Information Unit Extraction
- Atomic facts extracted via LLM
- Categorized as: fact, event, entity_update
- Location-based organization

### Compose Panel (Feed)
- Filter units by location and/or topic
- Semantic search across units
- AI-powered article draft generation

### Manual Upload
- Upload text, photos, and PDFs as information units
- Extracted via LLM, stored with embeddings

### Bajour Village Newsletter (Feature-Flagged)
- 3-step wizard: village select, generate draft, preview/send
- WhatsApp verification with village correspondents
- Mailchimp campaign creation from verified drafts

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Svelte 5 with runes |
| Build | Vite 6 |
| Hosting | GitHub Pages |
| Database | Supabase PostgreSQL + pgvector |
| Scheduling | pg_cron + pg_net |
| Backend | Supabase Edge Functions (Deno) |
| AI | OpenRouter (GPT-4o-mini) |
| Scraping | Firecrawl v2 API |
| Email | Resend |
| Geocoding | MapTiler |

## Project Structure

```
dorfkoenig/
├── docs/                    # Documentation
├── specs/                   # Technical specifications
├── lib/                     # Shared utilities
│   ├── api.ts              # API client
│   ├── types.ts            # TypeScript types
│   ├── constants.ts        # App constants
│   └── supabase.ts         # Supabase client
├── stores/                  # Svelte stores
│   ├── auth.ts             # Authentication
│   ├── scouts.ts           # Scout management
│   ├── units.ts            # Information units
│   ├── executions.ts       # Execution history
│   └── ui.ts               # UI state (modals)
├── components/              # UI components
│   ├── Layout.svelte
│   ├── LoginForm.svelte
│   ├── scouts/
│   ├── executions/
│   ├── compose/
│   └── ui/                 # ScoutModal, UploadModal, LocationAutocomplete, etc.
├── bajour/                  # Bajour village newsletter feature (feature-flagged)
│   ├── api.ts
│   ├── store.ts
│   ├── types.ts
│   ├── utils.ts
│   ├── components/
│   └── __tests__/
├── routes/                  # Page components
│   ├── Login.svelte
│   ├── Manage.svelte       # (was Dashboard)
│   ├── ScoutDetail.svelte
│   ├── History.svelte
│   └── Feed.svelte         # (was Compose)
├── supabase/                # Supabase configuration
│   ├── config.toml
│   ├── migrations/
│   └── functions/
├── index.html
├── main.ts
├── App.svelte
└── styles.css
```

## Environment Variables

### Frontend (.env.local)

```bash
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_MAPTILER_API_KEY=xxx
```

### Edge Functions (Supabase Dashboard)

Set in Settings > Edge Functions > Secrets:

| Variable | Description |
|----------|-------------|
| `OPENROUTER_API_KEY` | OpenRouter API key for LLM |
| `FIRECRAWL_API_KEY` | Firecrawl API key for scraping |
| `RESEND_API_KEY` | Resend API key for email |
| `MAILCHIMP_API_KEY` | Mailchimp API key for Bajour newsletter campaigns |
| `MAILCHIMP_SERVER` | Mailchimp data center (e.g., `us21`) |

### Vault Secrets (for pg_cron)

Run in SQL Editor:

```sql
SELECT vault.create_secret('project_url', 'https://xxx.supabase.co');
SELECT vault.create_secret('service_role_key', 'eyJ...');
```

## Development

### Prerequisites

- Node.js 20+
- npm
- Supabase CLI

### Local Setup

```bash
# Navigate to Labs monorepo
cd /Users/tom/code/labs

# Install dependencies
npm install

# Start dev server
npm run dev

# Visit https://localhost:3200/dorfkoenig/
```

### Supabase Local Development

```bash
# Start local Supabase
supabase start --workdir ./src/dorfkoenig/supabase

# Serve Edge Functions locally
supabase functions serve --workdir ./src/dorfkoenig/supabase
```

## Deployment

### 1. Push Database Schema

```bash
supabase db push --workdir ./src/dorfkoenig/supabase
```

### 2. Deploy Edge Functions

```bash
supabase functions deploy --workdir ./src/dorfkoenig/supabase
```

### 3. Configure pg_cron Jobs

```sql
SELECT cron.schedule('dispatch-due-scouts', '*/15 * * * *', 'SELECT dispatch_due_scouts()');
SELECT cron.schedule('cleanup-expired-data', '0 3 * * *', 'SELECT cleanup_expired_data()');
```

### 4. Build Frontend

```bash
npm run build:production
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/scouts` | GET | List all scouts |
| `/scouts` | POST | Create scout |
| `/scouts/:id` | PUT | Update scout |
| `/scouts/:id` | DELETE | Delete scout |
| `/scouts/:id/run` | POST | Run scout manually |
| `/scouts/:id/test` | POST | Test scout (preview + provider detection) |
| `/execute-scout` | POST | Execute scout pipeline |
| `/units` | GET | List information units |
| `/units/locations` | GET | Get available locations |
| `/units/search` | GET | Semantic search |
| `/units/mark-used` | PATCH | Mark units as used |
| `/compose/generate` | POST | Generate article draft |
| `/executions` | GET | List executions |
| `/executions/:id` | GET | Get execution details |
| `/manual-upload` | POST | Upload text/photo/PDF as units |
| `/bajour-drafts` | GET/POST/PATCH | Bajour draft CRUD |
| `/bajour-select-units` | POST | AI-select units for village |
| `/bajour-generate-draft` | POST | Generate newsletter draft |
| `/bajour-send-verification` | POST | Send draft to correspondents via WhatsApp |
| `/bajour-whatsapp-webhook` | POST | WhatsApp callback webhook |
| `/bajour-send-mailchimp` | POST | Aggregate verified drafts into Mailchimp campaign |

## Scout Execution Pipeline

1. **Scrape** - Fetch URL with Firecrawl (provider-aware: changeTracking or plain)
2. **Check Changes** - Provider-aware: changeTracking status or hash comparison. Early exit if unchanged
3. **Analyze Criteria** - LLM evaluates against user criteria
4. **Check Duplicates** - pgvector cosine similarity (0.85)
5. **Store Execution** - Save record with embedding
6. **Extract Units** - Extract atomic facts if location or topic provided
7. **Send Notification** - Email via Resend if not duplicate
8. **Update Scout** - Reset failure count, update last_run
9. **Return Results** - Execution summary

## Database Tables

### scouts
- Scout configurations for URL monitoring
- Frequency: daily, weekly, biweekly, monthly
- Location and/or topic-based organization
- Provider detection: `firecrawl` or `firecrawl_plain`

### scout_executions
- Execution history with embeddings
- Deduplication via summary_embedding
- Status tracking: running, completed, failed

### information_units
- Atomic facts extracted from content (or manually uploaded)
- Types: fact, event, entity_update
- Source types: scout, manual_text, manual_photo, manual_pdf
- Semantic search via embedding

### bajour_drafts
- Village newsletter drafts with WhatsApp verification workflow
- Verification status: ausstehend, bestätigt, abgelehnt
- 4-hour timeout auto-resolves to abgelehnt (silence = rejection)

## Scheduled Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| dispatch-due-scouts | Every 15 min | Dispatch scouts due for execution |
| cleanup-expired-data | Daily 3 AM | Delete expired units and old executions |

## Security

- Row Level Security (RLS) on all tables (including bajour_drafts)
- User isolation via user_id
- API keys protected in Vault/Secrets
- CORS configured for frontend access
- URL token auth for CMS iframe embedding, mock auth for development
- Edge Functions: `verify_jwt = false`, auth via `x-user-id` header

## Troubleshooting

### Common Issues

1. **Scout not running**: Check consecutive_failures < 3, is_active = true
2. **No notifications**: Verify notification_email set, not duplicate
3. **Scrape failing**: Check Firecrawl API key, URL accessibility
4. **pg_cron not working**: Verify Vault secrets configured

### Logs

- Edge Function logs: Supabase Dashboard > Edge Functions > Logs
- pg_cron history: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC`
