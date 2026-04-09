# Erste Schritte -- Dorfkoenig

## What is Dorfkoenig?

Dorfkoenig is an automated local news monitoring system for 10 Basel-area villages. It monitors websites and council documents for newsworthy content, extracts structured information units, and generates daily AI newsletter drafts (KI-Entwuerfe) that are verified by local correspondents via WhatsApp before publication.

## Access

Open the following URL in your browser:

```
https://wepublish.github.io/labs/dorfkoenig/?token=493c6d51531c7444365b0ec094bc2d67
```

The token authenticates you as the "We.Publish Redaktion" user. Bookmark this URL for quick access.

## Covered Villages

Dorfkoenig monitors these 10 municipalities in the Basel region:

| Village | Canton |
|---------|--------|
| Aesch | BL |
| Allschwil | BL |
| Arlesheim | BL |
| Binningen | BL |
| Bottmingen | BL |
| Muenchenstein | BL |
| Muttenz | BL |
| Pratteln | BL |
| Reinach | BL |
| Riehen | BS |

## Main Sections

The app has four sections, accessible via the navigation bar:

### Manage (Scout-Liste)

The default view. Lists all configured Scouts -- both Web Scouts (website monitors) and Civic Scouts (Gemeinderats-Ueberwachung). From here you can:

- View each scout's status (active/inactive, last run result)
- Create new scouts
- Edit or delete existing scouts
- Manually trigger a scout run or test

### Feed (Informationseinheiten + Entwuerfe)

The working area for newsletter production. Contains:

- **Information units** -- atomic facts extracted by scouts, filterable by village and topic
- **KI-Entwurf generation** -- select units (manually or via AI) and generate a newsletter draft
- **Entwuerfe panel** -- view all drafts, their verification status (ausstehend/bestaetigt/abgelehnt), and send them for WhatsApp verification

### History (Ausfuehrungsprotokoll)

A chronological log of all scout executions. Shows whether content changed, criteria matched, units were extracted, and notifications were sent. Useful for troubleshooting when a scout seems inactive.

### Scout Detail

Accessed by clicking a scout in the Manage view. Shows the scout's configuration, execution history, and allows editing its settings.

## How It Works

The daily workflow follows this cycle:

1. **Scouts monitor websites** -- Web Scouts check configured URLs on schedule (daily, weekly, biweekly, or monthly). Civic Scouts check council meeting document pages. When content changes and matches the scout's criteria, the system proceeds.

2. **Information units are extracted** -- The system breaks matched content into atomic facts (Informationseinheiten) -- individual statements like "Der Gemeinderat hat den Neubau am Bahnhof genehmigt."

3. **AI generates newsletter drafts** -- Every day at 18:00 Zurich time, the auto-draft pipeline selects the most relevant recent units for each village and generates a KI-Entwurf.

4. **Correspondents verify via WhatsApp** -- Each draft is sent to local correspondents (Korrespondenten) who can confirm (bestaetigt) or reject (abgelehnt) the draft via WhatsApp buttons.

5. **Confirmed drafts are published** -- At 22:00, the CMS queries the News API for all confirmed drafts and publishes them.

If no correspondent responds within 2 hours, the draft is automatically confirmed (auto-bestaetigt) at 21:00.

## Related Documentation

- [Automatische Entwuerfe -- Taeglicher Ablauf](auto-draft-pipeline.md)
- [Web Scouts -- Website-Ueberwachung](web-scouts.md)
- [Civic Scouts -- Gemeinderatsueberwachung](civic-scouts.md)
- [Korrespondenten -- WhatsApp-Verifizierung](correspondents.md)
- [News API -- CMS Integration](news-api.md)
