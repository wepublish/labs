# coJournalist-Lite Deployment Guide

## Overview

coJournalist-Lite is deployed as:
- **Frontend**: Static SPA on GitHub Pages
- **Backend**: Supabase (Edge Functions + PostgreSQL)

## Prerequisites

### Accounts Required

1. **Supabase** - Free tier sufficient for MVP
2. **OpenRouter** - API key for LLM access
3. **Firecrawl** - API key for web scraping
4. **Resend** - API key for email notifications
5. **MapTiler** - API key for geocoding (frontend)

### Tools Required

```bash
# Supabase CLI
npm install -g supabase

# Verify installation
supabase --version
```

---

## Phase 1: Supabase Project Setup

### 1.1 Create Project

1. Go to [supabase.com](https://supabase.com)
2. Create new project: `cojournalist-lite`
3. Select region close to target users (e.g., `eu-central-1`)
4. Save the project URL and keys

### 1.2 Enable Extensions

Run in SQL Editor:

```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_net";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Verify extensions
SELECT * FROM pg_extension;
```

**Note:** pg_cron and pg_net require enabling in Dashboard > Database > Extensions first.

### 1.3 Configure Vault Secrets

Required for pg_cron to call Edge Functions:

```sql
-- Store project URL
SELECT vault.create_secret(
  'project_url',
  'https://YOUR_PROJECT_ID.supabase.co'
);

-- Store service role key
SELECT vault.create_secret(
  'service_role_key',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
);
```

### 1.4 Run Schema Migration

```bash
# Set workdir for Supabase CLI
export SUPABASE_WORKDIR=./src/cojournalist-lite/supabase

# Link to remote project
supabase link --project-ref YOUR_PROJECT_ID

# Push schema
supabase db push
```

Or paste migration SQL directly in SQL Editor.

---

## Phase 2: Edge Functions Deployment

### 2.1 Configure Secrets

In Supabase Dashboard > Settings > Edge Functions > Secrets:

| Name | Value |
|------|-------|
| `OPENROUTER_API_KEY` | `sk-or-...` |
| `FIRECRAWL_API_KEY` | `fc-...` |
| `RESEND_API_KEY` | `re_...` |

### 2.2 Deploy Functions

```bash
# Deploy all functions
supabase functions deploy --workdir ./src/cojournalist-lite/supabase

# Or deploy individually
supabase functions deploy scouts --workdir ./src/cojournalist-lite/supabase
supabase functions deploy execute-scout --workdir ./src/cojournalist-lite/supabase
supabase functions deploy units --workdir ./src/cojournalist-lite/supabase
supabase functions deploy compose --workdir ./src/cojournalist-lite/supabase
supabase functions deploy executions --workdir ./src/cojournalist-lite/supabase
```

### 2.3 Configure Function Settings

In Supabase Dashboard > Edge Functions:

| Function | Verify JWT | Max Duration |
|----------|------------|--------------|
| `scouts` | No | 30s |
| `execute-scout` | No | 120s |
| `units` | No | 30s |
| `compose` | No | 60s |
| `executions` | No | 30s |

**Note:** JWT verification is disabled because we use `x-user-id` header for auth.

---

## Phase 3: pg_cron Configuration

### 3.1 Schedule Scout Dispatch

```sql
-- Dispatch due scouts every 15 minutes
SELECT cron.schedule(
  'dispatch-due-scouts',
  '*/15 * * * *',
  'SELECT dispatch_due_scouts()'
);

-- Verify job created
SELECT * FROM cron.job;
```

### 3.2 Schedule Cleanup

```sql
-- Cleanup expired data daily at 3 AM UTC
SELECT cron.schedule(
  'cleanup-expired-data',
  '0 3 * * *',
  'SELECT cleanup_expired_data()'
);
```

### 3.3 Monitor Jobs

```sql
-- View recent job runs
SELECT
  jobid,
  jobname,
  command,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 20;
```

---

## Phase 4: Frontend Deployment

### 4.1 Environment Variables

Create `.env.local` in Labs root:

```bash
# Supabase
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# MapTiler (for location autocomplete)
VITE_MAPTILER_API_KEY=xxx
```

### 4.2 Build Production

```bash
cd /Users/tom/code/labs

# Build for production
npm run build:production

# Output is in dist/cojournalist-lite/
```

### 4.3 GitHub Pages Deployment

GitHub Actions workflow (`.github/workflows/deploy.yml`):

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
          VITE_MAPTILER_API_KEY: ${{ secrets.VITE_MAPTILER_API_KEY }}
        run: npm run build:production

      - name: Deploy
        uses: JamesIves/github-pages-deploy-action@v4
        with:
          branch: gh-pages
          folder: dist
```

### 4.4 Configure GitHub Secrets

In GitHub Repository > Settings > Secrets and variables > Actions:

| Secret | Value |
|--------|-------|
| `VITE_SUPABASE_URL` | `https://xxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...` |
| `VITE_MAPTILER_API_KEY` | `xxx` |

### 4.5 SPA Routing Fix

Create `public/404.html` for GitHub Pages SPA routing:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Redirecting...</title>
    <script>
      // Redirect to index with route as query param
      const path = window.location.pathname;
      const route = path.replace('/labs/cojournalist-lite', '');
      if (route && route !== '/') {
        window.location.href = '/labs/cojournalist-lite/?route=' + encodeURIComponent(route);
      } else {
        window.location.href = '/labs/cojournalist-lite/';
      }
    </script>
  </head>
  <body>
    Redirecting...
  </body>
</html>
```

---

## Phase 5: Verification

### 5.1 Backend Health Check

```bash
# Test scouts endpoint
curl -X GET "https://YOUR_PROJECT.supabase.co/functions/v1/scouts" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "x-user-id: tester-1"

# Expected: {"data":[]}
```

### 5.2 Database Check

```sql
-- Verify tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public';

-- Verify functions exist
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_type = 'FUNCTION';

-- Verify pg_cron jobs
SELECT * FROM cron.job;
```

### 5.3 Frontend Check

1. Navigate to `https://YOUR_ORG.github.io/labs/cojournalist-lite/`
2. Login with mock user
3. Create test scout
4. Run test execution
5. Verify execution history

### 5.4 End-to-End Test

1. Create scout with criteria and notification email
2. Click "Run Now"
3. Wait for execution to complete
4. Verify email received
5. Check execution in history

---

## Monitoring

### Edge Function Logs

In Supabase Dashboard > Edge Functions > Logs:
- Filter by function name
- Search for errors
- View request/response details

### pg_cron Job History

```sql
-- Recent job runs with errors
SELECT *
FROM cron.job_run_details
WHERE status = 'failed'
ORDER BY start_time DESC
LIMIT 10;
```

### Database Performance

```sql
-- Slow queries
SELECT *
FROM pg_stat_statements
ORDER BY total_time DESC
LIMIT 10;

-- Table sizes
SELECT
  relname AS table,
  pg_size_pretty(pg_total_relation_size(relid)) AS size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
```

---

## Troubleshooting

### Common Issues

#### 1. pg_cron Not Running

**Symptoms:** Scouts not running on schedule

**Check:**
```sql
SELECT * FROM cron.job;
-- Ensure jobs exist and have correct schedule
```

**Fix:**
- Verify pg_cron extension is enabled
- Re-create the scheduled jobs

#### 2. Edge Function Timeout

**Symptoms:** Execution fails with timeout error

**Check:** Edge Function logs for duration

**Fix:**
- Increase function timeout in Dashboard
- Optimize LLM prompts (shorter content)
- Add timeout handling in code

#### 3. Firecrawl Errors

**Symptoms:** Scrape step failing

**Check:** Error message in execution record

**Common errors:**
- 401: Invalid API key
- 429: Rate limited (wait 60s)
- 500: Firecrawl service issue

#### 4. Email Not Sending

**Symptoms:** `notification_sent: false` but no error

**Check:**
- Resend API key valid
- Email address valid
- Resend dashboard for delivery status

#### 5. Duplicate Detection Not Working

**Symptoms:** Same findings triggering notifications

**Check:**
```sql
-- Verify embeddings exist
SELECT id, summary_text, summary_embedding IS NOT NULL AS has_embedding
FROM scout_executions
WHERE scout_id = 'your-scout-id'
ORDER BY created_at DESC
LIMIT 10;
```

**Fix:**
- Ensure OpenRouter embeddings are being generated
- Check cosine similarity threshold (0.85)

---

## Scaling Considerations

### Current Limits (Free Tier)

| Resource | Limit |
|----------|-------|
| Edge Function invocations | 500K/month |
| Database size | 500MB |
| File storage | 1GB |
| Bandwidth | 5GB/month |

### Upgrade Path

1. **More scouts**: Increase pg_cron batch size
2. **More storage**: Upgrade Supabase plan
3. **More executions**: Optimize cleanup frequency
4. **Better performance**: Add database indexes

---

## Rollback Procedure

### Edge Functions

```bash
# List deployed versions
supabase functions list

# Rollback is not directly supported
# Redeploy previous version from git
git checkout <previous-commit>
supabase functions deploy
```

### Database

```bash
# Create backup before migration
supabase db dump -f backup.sql

# Restore from backup
psql -h YOUR_HOST -U postgres -d postgres < backup.sql
```

---

## Security Checklist

- [ ] Supabase anon key has limited permissions (RLS enforced)
- [ ] Service role key only in Vault secrets
- [ ] Edge Function secrets not exposed to frontend
- [ ] RLS policies on all tables
- [ ] No sensitive data in error messages
- [ ] HTTPS only (enforced by Supabase and GitHub Pages)
- [ ] API rate limiting via Supabase
- [ ] Input validation in Edge Functions
