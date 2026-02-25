<script lang="ts">
  import type { Snippet } from 'svelte';
  import { auth, logout } from '../stores/auth';
  import { showScoutModal, showUploadModal, showDraftModal } from '../stores/ui';
  import ScoutModal from './ui/ScoutModal.svelte';
  import UploadModal from './ui/UploadModal.svelte';
  import { Radar, Newspaper, Plus, Upload, FileEdit, LogOut } from 'lucide-svelte';

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();

  // Reactive hash for nav active states
  let currentHash = $state(window.location.hash || '#/');

  $effect(() => {
    const onHashChange = () => { currentHash = window.location.hash || '#/'; };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  });

  // Display user name (falls back to ID for legacy sessions)
  let displayName = $derived($auth.user?.name ?? $auth.user?.id ?? '');

  function handleNewScout() {
    showScoutModal.set(true);
  }

  function handleUpload() {
    showUploadModal.set(true);
  }

  function handleDraft() {
    showDraftModal.set(true);
  }
</script>

<div class="layout">
  <nav class="navbar">
    <div class="nav-brand">
      <a href="#/">
        <!-- Dorf König symbol: crown + village + signal waves -->
        <svg class="brand-symbol" width="28" height="28" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 4 Q26 8 26 14" stroke="var(--color-primary)" stroke-width="1.5" fill="none" stroke-linecap="round" opacity="0.35"/>
          <path d="M20 4 Q30 10 30 18" stroke="var(--color-primary)" stroke-width="1.5" fill="none" stroke-linecap="round" opacity="0.2"/>
          <path d="M12 18 L14 11 L17 15 L20 9 L23 15 L26 11 L28 18 Z" fill="var(--color-primary)"/>
          <rect x="13" y="20" width="14" height="10" rx="1.5" fill="var(--color-primary)" opacity="0.6"/>
          <rect x="17" y="18" width="6" height="12" rx="1" fill="var(--color-primary)" opacity="0.8"/>
          <rect x="19" y="14" width="2" height="4" fill="var(--color-primary)" opacity="0.8"/>
          <rect x="15" y="23" width="2.5" height="2.5" rx="0.5" fill="white" opacity="0.8"/>
          <rect x="22.5" y="23" width="2.5" height="2.5" rx="0.5" fill="white" opacity="0.8"/>
          <rect x="18.5" y="26" width="3" height="4" rx="0.75" fill="white" opacity="0.8"/>
          <line x1="8" y1="30" x2="32" y2="30" stroke="var(--color-primary)" stroke-width="1.5" stroke-linecap="round" opacity="0.3"/>
        </svg>
        <span class="brand-text">Dorf<span class="brand-accent">König</span></span>
      </a>
    </div>

    <div class="nav-center">
      <a href="#/manage" class:active={currentHash === '#/' || currentHash === '' || currentHash === '#/manage'}>
        <Radar size={16} />
        <span>Verwalten</span>
      </a>
      <a href="#/feed" class:active={currentHash === '#/feed'}>
        <Newspaper size={16} />
        <span>Feed</span>
      </a>

      <button class="new-scout-btn" onclick={handleNewScout}>
        <Plus size={15} strokeWidth={2.5} />
        <span>Neuer Scout</span>
      </button>

      <button class="upload-btn" onclick={handleUpload}>
        <Upload size={15} strokeWidth={2.5} />
        <span>Hochladen</span>
      </button>

      {#if import.meta.env.VITE_FEATURE_BAJOUR === 'true'}
        <button class="draft-btn" onclick={handleDraft}>
          <FileEdit size={15} strokeWidth={2.5} />
          <span>Entwurf</span>
        </button>
      {/if}
    </div>

    <div class="nav-user">
      <span class="user-name">{displayName}</span>
      <button class="btn-logout" onclick={logout} title="Abmelden">
        <LogOut size={15} />
      </button>
    </div>
  </nav>

  <main class="main-content">
    {@render children()}
  </main>

  <ScoutModal open={$showScoutModal} onclose={() => showScoutModal.set(false)} />
  <UploadModal open={$showUploadModal} onclose={() => showUploadModal.set(false)} />

  {#if import.meta.env.VITE_FEATURE_BAJOUR === 'true'}
    <!-- DraftModal will be mounted here in Task 13 -->
  {/if}
</div>

<style>
  .layout {
    height: 100vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: var(--color-background);
  }

  .navbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1.25rem;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    position: sticky;
    top: 0;
    z-index: 100;
    gap: 1rem;
  }

  /* Brand */
  .nav-brand a {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    text-decoration: none;
    flex-shrink: 0;
  }

  .brand-symbol {
    flex-shrink: 0;
  }

  .brand-text {
    font-family: var(--font-display);
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text);
    letter-spacing: -0.01em;
  }

  .brand-accent {
    color: var(--color-primary);
  }

  /* Centered nav */
  .nav-center {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .nav-center a {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--color-text-muted);
    text-decoration: none;
    font-weight: 500;
    font-size: 0.875rem;
    padding: 0.375rem 0.75rem;
    border-radius: var(--radius-sm);
    background: transparent;
    transition: color 0.15s, background 0.15s;
  }

  .nav-center a:hover {
    color: var(--color-text);
    background: rgba(234, 114, 110, 0.06);
  }

  .nav-center a:active {
    background: rgba(234, 114, 110, 0.12);
  }

  .nav-center a.active {
    color: var(--color-primary-dark);
    background: rgba(234, 114, 110, 0.1);
  }

  .nav-center a.active:hover {
    background: rgba(234, 114, 110, 0.15);
  }

  .nav-center a.active:active {
    background: rgba(234, 114, 110, 0.2);
  }

  /* New Scout button — prominent, coral-inspired CTA */
  .new-scout-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.875rem;
    margin-left: 0.5rem;
    border: none;
    border-radius: var(--radius-sm);
    background: var(--color-primary);
    color: white;
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .new-scout-btn:hover {
    background: var(--color-primary-dark);
    box-shadow: 0 2px 8px rgba(234, 114, 110, 0.3);
  }

  /* Upload button — outline variant */
  .upload-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.875rem;
    margin-left: 0.25rem;
    border: 1.5px solid var(--color-primary);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-primary);
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .upload-btn:hover {
    background: rgba(234, 114, 110, 0.08);
  }

  /* Draft button (Bajour) — outline variant like upload */
  .draft-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.875rem;
    margin-left: 0.25rem;
    border: 1.5px solid var(--color-primary);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-primary);
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .draft-btn:hover {
    background: rgba(234, 114, 110, 0.08);
  }

  /* User area */
  .nav-user {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    flex-shrink: 0;
  }

  .user-name {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    font-weight: 500;
  }

  .btn-logout {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-light);
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-logout:hover {
    border-color: var(--color-danger);
    color: var(--color-danger);
    background: rgba(239, 68, 68, 0.04);
  }

  .main-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    width: 100%;
  }

  @media (max-width: 768px) {
    .navbar {
      flex-wrap: wrap;
      padding: 0.5rem 0.75rem;
    }

    .nav-center {
      order: 3;
      width: 100%;
      justify-content: center;
    }

    .user-name {
      display: none;
    }

    .new-scout-btn span,
    .upload-btn span,
    .draft-btn span {
      display: none;
    }

    .new-scout-btn {
      margin-left: 0.25rem;
      padding: 0.375rem;
    }

    .upload-btn {
      margin-left: 0.125rem;
      padding: 0.375rem;
    }

    .draft-btn {
      margin-left: 0.125rem;
      padding: 0.375rem;
    }
  }
</style>
