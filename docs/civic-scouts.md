# Civic Scouts -- Gemeinderatsueberwachung

## What is a Civic Scout?

A Civic Scout monitors council meeting documents (Gemeinderatsprotokolle) for a municipality. Unlike Web Scouts, which track a single URL for content changes, Civic Scouts track one or two index pages that link to meeting documents (PDFs and web pages). When new documents appear, the system extracts political promises and commitments made by the council, tracks their due dates, and generates information units for the newsletter pipeline.

## How It Differs from Web Scouts

| Aspect | Web Scout | Civic Scout |
|--------|-----------|-------------|
| Monitors | A single URL for content changes | Index pages linking to council documents |
| Detects | Content changes on the page | New document links appearing on the index page |
| Extracts | Information units (facts, events) | Political promises + information units |
| Tracks | Nothing beyond the facts | Promise status and due dates over time |
| Change detection | Firecrawl changeTracking or hash-based | Hash-based only (across all tracked URLs) |

## Creating a Civic Scout

In the **Manage** view, create a new scout and select the "Civic" type. You need to provide:

| Field | Required | Description |
|-------|----------|-------------|
| Name | Yes | Descriptive name (e.g., "Gemeinderat Riehen") |
| Root Domain | Yes | The domain to scan for documents (e.g., `riehen.ch`) |
| Tracked URLs | Yes | 1--2 index page URLs where meeting documents are linked (max 2) |
| Kriterien | No | Optional focus criteria (e.g., "Bauvorhaben, Verkehr"). If empty, all promises are extracted. |
| Standort (Location) | Yes | Village assignment |
| Benachrichtigungs-E-Mail | No | Email for notifications when new promises are found |

## The Civic Pipeline

When a Civic Scout runs, it executes these steps:

### 1. Fetch Tracked URLs

The system fetches the raw HTML of all tracked index pages and extracts all links from them.

### 2. Check Changes (Hash-Based)

A SHA-256 hash is computed over the combined HTML of all tracked pages. If the hash matches the stored hash, nothing has changed and the execution ends early.

### 3. Classify Document Links

An LLM classifies extracted links to identify which ones point to council meeting documents (protocols, agendas, decisions). Non-meeting links are discarded.

### 4. Filter Already-Processed URLs

Links that were already processed in previous runs are skipped. The scout maintains a list of processed URLs (up to 200).

### 5. Cap at Max Documents Per Run

To respect API rate limits and avoid excessive processing, only a limited number of new documents are processed per run.

### 6. Parse Documents and Extract Promises

For each new document:
- The document is fetched and converted to markdown
- An LLM extracts political promises and commitments
- Information units are also extracted (for the newsletter Feed)

Each extracted promise includes:
- **Promise text** -- What was promised (e.g., "Der Gemeinderat wird bis Ende 2026 einen neuen Verkehrsplan vorlegen.")
- **Context** -- Background information from the document
- **Source URL and title** -- Where it was found
- **Meeting date** -- Extracted from the document URL
- **Due date** -- When the promise should be fulfilled (if mentioned)
- **Date confidence** -- How confident the system is about the extracted date (high/medium/low)

### 7. Store Promises

Promises are saved to the `promises` table with initial status `new`.

### 8. Update Scout

The scout's content hash and processed URL list are updated.

### 9. Send Notification

If new promises were found and a notification email is configured, an alert is sent listing the extracted promises and their due dates.

### 10. Finalize

The execution is marked as completed with a summary of findings.

## Promise Tracking

Promises extracted by Civic Scouts are stored in the `promises` table and can be tracked over time.

### Promise Statuses

| Status | Meaning |
|--------|---------|
| `new` | Just extracted, not yet reviewed |
| `in_progress` | The council is working on it |
| `fulfilled` | The promise was kept |
| `broken` | The promise was not kept |
| `notified` | A due date notification was sent |

### Due Date Monitoring

The system checks for approaching due dates daily at 08:00 UTC:

- **7 days before due date** -- A reminder notification is sent
- **On the due date** -- A notification is sent that the promise is now due

Notifications are sent via email to the scout's `Benachrichtigungs-E-Mail` address.

## Viewing Promises

Promises can be viewed in the Supabase Dashboard:

**Dashboard URL:** [https://supabase.com/dashboard/project/ayksajwtwyjhvpqngvcb](https://supabase.com/dashboard/project/ayksajwtwyjhvpqngvcb)

Navigate to **Table Editor > promises**. Key columns:

| Column | Description |
|--------|-------------|
| `promise_text` | The promise statement |
| `context` | Background context |
| `source_url` | Link to the source document |
| `meeting_date` | When the meeting took place |
| `due_date` | When the promise should be fulfilled |
| `status` | Current tracking status |
| `date_confidence` | How reliable the extracted date is |

You can filter by `scout_id` to see promises for a specific municipality, or by `status` to find overdue promises.
