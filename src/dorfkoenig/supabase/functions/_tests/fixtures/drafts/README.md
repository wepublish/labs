# Draft benchmark fixtures

Frozen unit-pool + gold-output snapshots for `bench:dorfkoenig` (see `specs/DRAFT_QUALITY.md` §4.1).

Each JSON file is one edition. Format:

```json
{
  "fixture_id": "arlesheim-2026-04-20",
  "village_id": "arlesheim",
  "village_name": "Arlesheim",
  "edition_date": "2026-04-20",
  "units": [ /* information_units rows available on that date */ ],
  "gold": {
    "bullets": [ /* manual editor's published bullets */ ],
    "rejected_units": [ /* units editor deliberately dropped + reason */ ]
  },
  "notes": "Source: Feedback Dorfkönig.md row N"
}
```

When a village is added to `bajour_pilot_villages_list`, add at least one fixture here within 7 days.

To run:

```bash
npm run bench:dorfkoenig
npm run bench:dorfkoenig -- --fixture arlesheim-2026-04-20
```
