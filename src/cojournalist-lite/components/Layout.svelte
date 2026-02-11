<script lang="ts">
  import type { Snippet } from 'svelte';
  import { auth, logout } from '../stores/auth';

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();
</script>

<div class="layout">
  <nav class="navbar">
    <div class="nav-brand">
      <a href="#/">coJournalist-Lite</a>
    </div>
    <div class="nav-links">
      <a href="#/dashboard" class:active={location.hash === '#/' || location.hash === '#/dashboard'}>
        Dashboard
      </a>
      <a href="#/history" class:active={location.hash === '#/history'}>
        Verlauf
      </a>
      <a href="#/compose" class:active={location.hash === '#/compose'}>
        Komponieren
      </a>
    </div>
    <div class="nav-user">
      <span class="user-name">{$auth.user?.name}</span>
      <button class="btn-logout" onclick={logout}>Abmelden</button>
    </div>
  </nav>

  <main class="main-content">
    {@render children()}
  </main>
</div>

<style>
  .layout {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--color-background);
  }

  .navbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-md) var(--spacing-lg);
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .nav-brand a {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-primary);
    text-decoration: none;
  }

  .nav-links {
    display: flex;
    gap: var(--spacing-lg);
  }

  .nav-links a {
    color: var(--color-text-muted);
    text-decoration: none;
    font-weight: 500;
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sm);
    transition: color 0.15s, background 0.15s;
  }

  .nav-links a:hover {
    color: var(--color-text);
  }

  .nav-links a.active {
    color: var(--color-primary);
    background: rgba(99, 102, 241, 0.1);
  }

  .nav-user {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
  }

  .user-name {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .btn-logout {
    padding: var(--spacing-xs) var(--spacing-sm);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-logout:hover {
    border-color: var(--color-danger);
    color: var(--color-danger);
  }

  .main-content {
    flex: 1;
    padding: var(--spacing-lg);
    max-width: 1400px;
    margin: 0 auto;
    width: 100%;
  }

  @media (max-width: 768px) {
    .navbar {
      flex-wrap: wrap;
      gap: var(--spacing-sm);
    }

    .nav-links {
      order: 3;
      width: 100%;
      justify-content: center;
    }

    .user-name {
      display: none;
    }
  }
</style>
