# Web Scouts -- Website-Ueberwachung

## What is a Web Scout?

A Web Scout monitors a specific URL for content changes. When the page content changes and matches the scout's criteria, the system extracts information units (Informationseinheiten) -- atomic facts that feed into the newsletter draft pipeline.

Web Scouts are the primary data source for Dorfkoenig. Each village typically has one or more scouts watching local government websites, news portals, or community pages.

## Creating a Web Scout

In the **Manage** view, click the button to create a new scout. You need to provide:

| Field | Required | Description |
|-------|----------|-------------|
| Name | Yes | A descriptive name (e.g., "Gemeinde Riehen -- Aktuelles") |
| URL | Yes | The web page to monitor (must start with `http://` or `https://`) |
| Kriterien | Yes | What to look for (e.g., "Neuigkeiten zu Bauvorhaben oder Gemeindeversammlungen"). Leave empty for "any change" mode. |
| Standort (Location) | Conditional | Village assignment (at least one of Standort or Thema is required) |
| Thema (Topic) | Conditional | Topic tags, comma-separated (at least one of Standort or Thema is required) |
| Haeufigkeit (Frequency) | Yes | How often to check |
| Benachrichtigungs-E-Mail | No | Email address for alert notifications |

### Frequency Options

| Option | German label | Schedule |
|--------|-------------|----------|
| `daily` | Taeglich | Every day |
| `weekly` | Woechentlich | Once per week |
| `biweekly` | Alle 2 Wochen | Every two weeks |
| `monthly` | Monatlich | Once per month |

Scouts are checked every 15 minutes by the scheduler, which determines if a scout is due based on its frequency and last run time.

## The 9-Step Pipeline

When a Web Scout runs (on schedule or manually), it executes this pipeline:

### 1. Scrape

The system fetches the URL content using Firecrawl, converting the page to clean markdown text. The scraping provider is auto-detected on the first test run.

### 2. Check Changes

Compares the current content to the previous version. If nothing changed, the execution ends early (status: "Unveraendert"). Two detection methods exist:

- **Firecrawl changeTracking** -- The default. Firecrawl tracks per-scout baselines and reports diffs.
- **Hash-based** -- For sites where Firecrawl baselines do not persist. Uses SHA-256 hashes of the normalized content. The provider is auto-detected during the first test.

### 3. Analyze Criteria

An LLM (GPT-4o-mini) checks whether the changed content matches the scout's criteria. It returns a match decision, a short summary (max 150 characters), and key findings. If no criteria are set ("any change" mode), the content is summarized instead.

### 4. Check Duplicates

If criteria matched, the system generates an embedding of the summary and compares it against the last 30 days of executions using cosine similarity (threshold: 0.85). This prevents the same story from being reported multiple times.

### 5. Store Execution

The execution record is saved with all results: change status, criteria match, summary, embedding, duplicate flag, and scrape duration.

### 6. Extract Units

If criteria matched and the scout has a location or topic set, the system extracts atomic information units. Each unit is:

- A single, self-contained statement (e.g., "Die Hauptstrasse wird naechste Woche gesperrt.")
- Typed as `Fakt`, `Ereignis`, or `Aktualisierung`
- Tagged with entities (people, organizations, places)
- Deduplicated within the batch (0.75 similarity threshold)

Up to 8 units are extracted per execution.

### 7. Send Notification

If criteria matched, the finding is not a duplicate, and a notification email is configured, the system sends an alert email with the summary and key findings.

### 8. Update Scout

The scout's `last_run_at` is updated and `consecutive_failures` is reset to 0.

### 9. Finalize

The execution status is set to "Abgeschlossen" and results are returned.

## Change Detection: Provider Auto-Detection

When you first test a scout (via the Test button in Scout Detail), the system runs a "double-probe": two sequential scrapes to detect whether Firecrawl persists baselines for that URL. The result is stored as the scout's provider:

- **firecrawl** -- Baselines persist. The system uses Firecrawl's built-in change tracking.
- **firecrawl_plain** -- Baselines are dropped. The system falls back to hash-based change detection.

You do not need to configure this manually. It happens automatically on the first test.

## Failure Handling

If a scout execution fails (scrape timeout, API error, etc.):

- The scout's `consecutive_failures` counter increments by 1
- After **3 consecutive failures**, the scout is automatically excluded from scheduled dispatch
- The scout remains visible in the Manage view and can be reactivated by running it manually (which resets the failure counter on success)

Check the **History** view or the Scout Detail to see why executions failed.

## Information Units

Information units are the building blocks of newsletter drafts. They are:

- Extracted from matched scout content
- Stored with vector embeddings for semantic search and deduplication
- Assigned to the scout's village/location
- Available in the Feed panel for manual or automated draft composition
- Marked as "used" once included in a draft
- Auto-expire after 90 days (extended by 60 days if used in an article)

## Notification Emails

If a scout has a `Benachrichtigungs-E-Mail` configured, it sends an alert email whenever:

1. Content changes
2. Criteria match
3. The finding is not a duplicate

The email includes the summary, key findings, and a link to the source URL.

## Testing a Scout

Before relying on a scout for production data, use the **Test** button in the Scout Detail view. This runs the scrape and criteria analysis without storing results or sending notifications. The test shows:

- Whether the page can be scraped
- Whether the criteria would match
- A preview of the summary and key findings
- The detected provider (firecrawl or firecrawl_plain)
