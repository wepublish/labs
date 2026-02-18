# coJournalist-Lite: Web Scout Pipeline Migration Design

**Date:** 2026-02-18
**Scope:** Migrate Manage panel, Feed panel, and SetupWebScout modal from coJournalist to coJournalist-lite

## Decisions

- All new components stay local to `src/cojournalist-lite/` (no shared directory)
- Status pills derive from latest `scout_executions` row per scout
- "Run now on creation" triggered by frontend calling `POST /scouts/{id}/run` after create
- Full rename: Dashboard->Manage, Compose->Feed (files, routes, nav labels)

## 1. Renames

| Current | New |
|---------|-----|
| `routes/Dashboard.svelte` | `routes/Manage.svelte` |
| `routes/Compose.svelte` | `routes/Feed.svelte` |
| `App.svelte` routes `#/dashboard` | `#/manage` |
| `App.svelte` routes `#/compose` | `#/feed` |
| `Layout.svelte` nav labels | "Manage" / "Feed" |
| Default route fallback | `#/manage` |

History and ScoutDetail routes unchanged.

## 2. PanelFilterBar Component

New file: `components/ui/PanelFilterBar.svelte`

Shared filter component used by both Manage and Feed panels. Ported from original coJournalist's `PanelFilterBar.svelte`.

**Props:**
- `filterMode: 'location' | 'topic'` - mode toggle
- `locationOptions / topicOptions` - dropdown option arrays `{ value, label, count? }`
- `selectedLocation / selectedTopic` - current selections
- `typeFilter / typeOptions` - scout type filter
- `onModeChange, onLocationChange, onTopicChange, onTypeChange` - callbacks
- `loading` - loading state
- Optional: `showSearch`, `searchQuery`, `searchPlaceholder`, `onSearch`, `isSearching`
- Optional: `showScoutFilter`, `scoutOptions`, `selectedScout`, `onScoutChange`
- Named slot: `toolbar` - for toolbar items below filters

**Sub-components (also new):**
- `components/ui/ModeToggle.svelte` - location/topic toggle switch
- `components/ui/FilterSelect.svelte` - icon + dropdown select

## 3. Manage Panel (formerly Dashboard)

### ScoutCard.svelte changes

**Add status pills** in card footer:
- Pill 1 (Execution status): Green "Ran OK" / Red "Failed" / Gray "Pending"
- Pill 2 (Criteria status): Green "Match" / Red "No match" / Gray "No changes" / Gray "Pending"
- Derived from latest `scout_executions` row via `getCriteriaStatusDisplay()` function

**Add delete** with inline confirm strip:
- Trash icon button
- On click: shows confirm strip (X cancel + check confirm) with red background
- Confirm calls `scouts.delete(id)` and refreshes list

**Keep** existing run/test/edit buttons.

### Manage.svelte changes

- Add PanelFilterBar at top
- Derive locationOptions from scouts' locations
- Derive topicOptions from scouts' criteria (client-side)
- Client-side filtering by location, topic, type
- Remove "Letzte Ausfuhrungen" section (History route handles this)

### Backend: scouts edge function

Modify `listScouts` to include latest execution status per scout. Add a subquery or left join on `scout_executions` to return:
- `last_execution_status: 'completed' | 'failed' | null`
- `last_criteria_matched: boolean | null`
- `last_change_status: string | null`
- `last_summary_text: string | null`

## 4. Feed Panel (formerly Compose)

### Feed.svelte (route) changes

- Rename from Compose.svelte
- Update page header to "Feed"

### ComposePanel.svelte refactor -> FeedPanel.svelte

Replace current two-column layout with:
- PanelFilterBar at top (location/topic mode toggle, type filter, semantic search)
- Full-width UnitList below with selection toggles
- Selection bar at bottom (count + "Generate Draft" button)
- Draft generation stays wired up but no changes (per user instruction)

**Filter flow:**
- On mount: load locations from `units/locations`, load initial units
- Location/topic mode toggle switches between filter dropdowns
- Location/topic selection triggers server-side filtered fetch
- Type filter applied client-side
- Semantic search calls existing `units/search` endpoint

### Backend: units edge function

Add topic support:
- New endpoint `GET /units/topics` returning distinct topics from unused units
- Or derive topics client-side from loaded units (simpler, no backend change)

Decision: derive topics client-side from loaded units to avoid backend changes.

## 5. ScoutForm Modal Upgrade

### ScoutForm.svelte changes

**Add criteria mode toggle:**
- Toggle between "Any Change" (Bell icon) and "Specific Criteria" (Filter icon)
- CSS toggle switch matching original's `.criteria-toggle` pattern
- When "any": criteria textarea hidden, criteria stored as empty string
- Backend already treats empty criteria as "any change" mode

**Add extract_baseline toggle:**
- "Import current page data" toggle in same CSS pattern
- Maps to `extract_units` param on the run call

**Add scope section:**
- Location: city text input (keep simple, no geocoding for now)
- Topic: text input (optional)

**Run now on creation:**
- After successful `scouts.create()`, call `scouts.run(newScout.id, { extract_units: extractBaseline })`
- Show loading state during both create and initial run

## Data Flow Summary

```
Scout Creation:
  ScoutForm submit -> scouts.create() -> POST /scouts
  -> scouts.run(id, { extract_units }) -> POST /scouts/{id}/run -> 202
  -> Redirect to Manage panel

Manage Panel Load:
  Manage mount -> scouts.load() -> GET /scouts (with latest execution join)
  -> Render ScoutCards with status pills from execution data
  -> PanelFilterBar filters client-side

Feed Panel Load:
  Feed mount -> units.loadLocations() + units.load()
  -> PanelFilterBar for location/topic/type filtering
  -> UnitList with selection
  -> Draft generation (unchanged)
```

## Out of Scope

- Draft generation changes (Feed panel keeps existing flow)
- MapTiler geocoding integration (location stays as text input)
- Pulse and Alerts scout types (only Web scouts for now)
- i18n (German hardcoded strings acceptable for now)
- Credits/billing validation
