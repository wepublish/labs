<script lang="ts">
  import { X, Camera } from 'lucide-svelte';

  interface Props {
    file: File | null;
    filePreviewUrl: string | null;
    description: string;
    onfileselect: (e: Event) => void;
    onfileremove: () => void;
    ondescriptionchange: (description: string) => void;
  }

  let {
    file,
    filePreviewUrl,
    description,
    onfileselect,
    onfileremove,
    ondescriptionchange,
  }: Props = $props();
</script>

<div class="form-group">
  <label for="upload-photo">Foto</label>
  {#if file && filePreviewUrl}
    <div class="file-preview">
      <img src={filePreviewUrl} alt="Vorschau" class="image-preview" />
      <button class="file-remove" onclick={onfileremove}>
        <X size={14} />
      </button>
    </div>
  {:else}
    <label class="file-drop" for="upload-photo-input">
      <Camera size={24} />
      <span>Foto auswählen</span>
      <span class="file-drop-hint">JPEG, PNG, WebP — max 50 MB</span>
    </label>
    <input
      id="upload-photo-input"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      onchange={onfileselect}
      class="file-input-hidden"
    />
  {/if}
</div>
<div class="form-group">
  <label for="upload-photo-desc">Beschreibung</label>
  <textarea
    id="upload-photo-desc"
    value={description}
    oninput={(e) => ondescriptionchange(e.currentTarget.value)}
    placeholder="Was zeigt dieses Foto?"
    rows="3"
  ></textarea>
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

  .file-input-hidden {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    overflow: hidden;
  }

  .file-drop {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1.5rem;
    border: 2px dashed var(--color-border, #e5e7eb);
    border-radius: 0.5rem;
    background: var(--color-background, #f9fafb);
    color: var(--color-text-muted);
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
    text-align: center;
  }

  .file-drop:hover {
    border-color: var(--color-primary);
    background: rgba(234, 114, 110, 0.04);
  }

  .file-drop span {
    font-size: 0.875rem;
    font-weight: 500;
  }

  .file-drop-hint {
    font-size: 0.75rem !important;
    font-weight: 400 !important;
    color: var(--color-text-light);
  }

  .file-preview {
    position: relative;
    border-radius: 0.5rem;
    overflow: hidden;
    border: 1px solid var(--color-border);
  }

  .image-preview {
    display: block;
    width: 100%;
    max-height: 200px;
    object-fit: cover;
  }

  .file-remove {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border: none;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.5);
    color: white;
    cursor: pointer;
    transition: background 0.15s;
  }

  .file-remove:hover {
    background: rgba(0, 0, 0, 0.7);
  }
</style>
