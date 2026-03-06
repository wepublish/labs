// Shared LLM prompt templates for Dorfkoenig edge functions

/** Writing guidelines for article draft generation (compose endpoint) */
export const COMPOSE_GUIDELINES = `SCHREIBRICHTLINIEN:
- Beginne JEDEN Abschnitt mit der wichtigsten Tatsache — kein Vorgeplänkel
- Erster Satz jedes Abschnitts = die Nachricht. Kontext kommt danach.
- Fette **wichtige Zahlen, Namen, Daten und Daten** mit Markdown
- Sätze: KURZ und PRÄGNANT. Maximal 15-20 Wörter pro Satz.
- Absätze: Maximal 2-3 Sätze. Eine Idee pro Absatz.
- Beginne Aufzählungszeichen IMMER mit Emojis: 📊 (Daten) 📅 (Termine) 👤 (Personen) 🏢 (Organisationen) ⚠️ (Bedenken) ✅ (Fortschritt) 📍 (Orte)
- Beispiel: '📊 **42%** Anstieg der Wohnkosten [srf.ch]'
- Zitiere Quellen inline im Format [quelle.ch]
- Fakten aus mehreren Quellen sind glaubwürdiger — erwähne wenn verfügbar
- Füge eine "gaps"-Liste hinzu: was fehlt, wen interviewen, welche Daten verifizieren
- Priorisiere: Zahlen > Daten > Zitate > allgemeine Aussagen`;

/** Writing guidelines for Bajour village newsletter generation */
export const BAJOUR_NEWSLETTER_GUIDELINES = `SCHREIBRICHTLINIEN:
- Newsletter-Format: Kurz, prägnant, informativ
- Beginne mit der wichtigsten Nachricht der Woche
- Fette **wichtige Namen, Zahlen, Daten**
- Sätze: Max 15-20 Wörter, aktive Sprache
- Zitiere Quellen inline [quelle.ch]
- Absätze: 2-3 Sätze pro Nachricht
- Gesamtlänge: 800-1200 Wörter
- Tonalität: Nahbar, lokal, vertrauenswürdig
- Schliesse mit einem Ausblick auf kommende Ereignisse`;
