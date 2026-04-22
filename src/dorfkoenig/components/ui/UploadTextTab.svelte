<script lang="ts">
  interface Props {
    text: string;
    publicationDate: string;
    ontextchange: (text: string) => void;
    onpublicationdatechange: (date: string) => void;
  }

  let { text, publicationDate, ontextchange, onpublicationdatechange }: Props = $props();
</script>

<div class="form-group">
  <label for="upload-text">Text</label>
  <textarea
    id="upload-text"
    value={text}
    oninput={(e) => ontextchange(e.currentTarget.value)}
    placeholder="Text eingeben oder einfügen..."
    rows="5"
  ></textarea>
  <p class="hint-text">KI extrahiert automatisch Fakten aus dem Text</p>
</div>

<div class="form-group">
  <label for="upload-text-pubdate">Publikationsdatum</label>
  <input
    id="upload-text-pubdate"
    type="date"
    value={publicationDate}
    oninput={(e) => onpublicationdatechange(e.currentTarget.value)}
    required
  />
  <p class="hint-text">Wird als Anker für Einheiten ohne eigenes Datum verwendet</p>
</div>

<style>
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .form-group label {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-text);
  }

  .form-group textarea,
  .form-group input[type="date"] {
    width: 100%;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 0.375rem;
    background: var(--color-background, #f9fafb);
    color: var(--color-text, #111827);
    font-family: inherit;
    resize: vertical;
  }

  .form-group textarea:focus,
  .form-group input[type="date"]:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(234, 114, 110, 0.15);
  }

  .hint-text {
    font-size: 0.75rem;
    color: var(--color-text-muted, #6b7280);
    margin: 0;
    line-height: 1.4;
  }
</style>
