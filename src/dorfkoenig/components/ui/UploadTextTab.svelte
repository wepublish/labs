<script lang="ts">
  interface Props {
    text: string;
    ontextchange: (text: string) => void;
  }

  let { text, ontextchange }: Props = $props();
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

  .form-group textarea {
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

  .form-group textarea:focus {
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
