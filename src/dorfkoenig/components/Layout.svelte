<script lang="ts">
  import type { Snippet } from 'svelte';
  import { auth, logout } from '../stores/auth';
  import { showScoutModal, showUploadModal } from '../stores/ui';
  import ScoutModal from './ui/ScoutModal.svelte';
  import UploadModal from './ui/UploadModal.svelte';
  import { Radar, Newspaper, Plus, LogOut } from 'lucide-svelte';

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
</script>

<div class="layout">
  <nav class="navbar">
    <!-- Left: Brand + Neuer Scout -->
    <div class="nav-left">
      <a href="#/" class="brand">
        <svg class="brand-symbol" width="26" height="26" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
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

      <span class="nav-divider"></span>

      <button class="btn-new-scout" onclick={handleNewScout}>
        <Plus size={14} strokeWidth={2.5} />
        <span>Neuer Scout</span>
      </button>
    </div>

    <!-- Center: Pill segment control (absolutely centered) -->
    <div class="nav-center">
      <a href="#/manage" class:active={currentHash === '#/' || currentHash === '' || currentHash === '#/manage'}>
        <Radar size={14} />
        <span>Verwalten</span>
      </a>
      <a href="#/feed" class:active={currentHash === '#/feed'}>
        <Newspaper size={14} />
        <span>Feed</span>
      </a>
    </div>

    <!-- Right: User only -->
    <div class="nav-right">
      <span class="user-name">{displayName}</span>
      <button class="btn-logout" onclick={logout} title="Abmelden">
        <LogOut size={14} />
      </button>
    </div>
  </nav>

  <main class="main-content">
    {@render children()}
  </main>

  <ScoutModal open={$showScoutModal} onclose={() => showScoutModal.set(false)} />
  <UploadModal open={$showUploadModal} onclose={() => showUploadModal.set(false)} />
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
    padding: 0 1.25rem;
    height: 56px;
    background: var(--color-surface);
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    position: sticky;
    top: 0;
    z-index: var(--z-sticky);
  }

  /* Left cluster: Brand + divider + Neuer Scout */
  .nav-left {
    display: flex;
    align-items: center;
    gap: 1.25rem;
    flex-shrink: 0;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    text-decoration: none;
    flex-shrink: 0;
  }

  .brand-symbol { flex-shrink: 0; }

  .brand-text {
    font-family: var(--font-display);
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text);
    letter-spacing: -0.01em;
  }

  .brand-accent { color: var(--color-primary); }

  .nav-divider {
    width: 1px;
    height: 24px;
    background: var(--color-border);
  }

  .btn-new-scout {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.875rem 0.375rem 0.625rem;
    background: var(--color-primary);
    color: white;
    border: none;
    border-radius: var(--radius-full);
    font-size: var(--text-base-sm);
    font-weight: 600;
    font-family: var(--font-body);
    cursor: pointer;
    transition: all var(--transition-base);
    white-space: nowrap;
  }

  .btn-new-scout:hover {
    background: var(--color-primary-dark);
    box-shadow: 0 2px 10px rgba(234, 114, 110, 0.35);
    transform: translateY(-0.5px);
  }

  .btn-new-scout:active {
    background: var(--color-primary-dark);
    transform: translateY(0);
  }

  /* Center nav: pill segment control, absolutely centered */
  .nav-center {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    background: var(--color-surface-muted);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    padding: 3px;
    gap: 2px;
  }

  .nav-center a {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.3125rem 1rem;
    font-size: var(--text-base-sm);
    font-weight: 500;
    color: var(--color-text-muted);
    text-decoration: none;
    border-radius: var(--radius-full);
    transition: all var(--transition-base);
  }

  .nav-center a:hover {
    color: var(--color-text);
  }

  .nav-center a.active {
    background: var(--color-surface);
    color: var(--color-text);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);
  }

  .nav-center a :global(svg) {
    opacity: 0.5;
  }

  .nav-center a.active :global(svg) {
    opacity: 0.8;
  }

  /* Right: user only */
  .nav-right {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.625rem;
    flex-shrink: 0;
  }

  .user-name {
    font-size: var(--text-base-sm);
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
    transition: all var(--transition-base);
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
      height: auto;
      padding: 0.5rem 0.75rem;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .nav-center {
      position: static;
      transform: none;
      order: 3;
      width: 100%;
      justify-content: center;
    }

    .user-name { display: none; }

    .btn-new-scout span { display: none; }
    .btn-new-scout { padding: 0.375rem; }
  }
</style>
