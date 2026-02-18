<script lang="ts">
  import { login } from '../stores/auth';
  import { Button, Card } from '@shared/components';
  import { PRESET_USERS } from '../lib/constants';

  let userId = $state('');
  let error = $state('');

  function handleSubmit(e: Event) {
    e.preventDefault();
    error = '';

    if (!userId.trim()) {
      error = 'Bitte geben Sie eine Benutzer-ID ein';
      return;
    }

    try {
      login(userId.trim());
    } catch (err) {
      error = (err as Error).message;
    }
  }

  function selectPreset(id: string) {
    userId = id;
    login(id);
  }
</script>

<div class="login-container">
  <Card shadow="lg" padding="lg">
    {#snippet header()}
      <div class="login-header">
        <h1>DorfKönig</h1>
        <p class="subtitle">Lokales Nachrichten-Monitoring</p>
      </div>
    {/snippet}

    <form onsubmit={handleSubmit} class="login-form">
      <div class="form-group">
        <label for="userId">Benutzer-ID</label>
        <input
          id="userId"
          type="text"
          bind:value={userId}
          placeholder="z.B. journalist-1"
          autocomplete="username"
        />
        {#if error}
          <p class="error">{error}</p>
        {/if}
      </div>

      <Button type="submit" variant="primary" size="lg">
        Anmelden
      </Button>
    </form>

    <div class="presets">
      <p class="presets-label">Oder wählen Sie einen Test-Benutzer:</p>
      <div class="preset-buttons">
        {#each PRESET_USERS as user}
          <button
            type="button"
            class="preset-btn"
            onclick={() => selectPreset(user.id)}
          >
            {user.name}
          </button>
        {/each}
      </div>
    </div>
  </Card>
</div>

<style>
  .login-container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    padding: var(--spacing-lg);
    background: linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%);
  }

  .login-header {
    text-align: center;
    margin-bottom: var(--spacing-lg);
  }

  .login-header h1 {
    margin: 0;
    color: var(--color-primary);
    font-size: 1.75rem;
  }

  .subtitle {
    margin: var(--spacing-xs) 0 0;
    color: var(--color-text-muted);
    font-size: 0.9375rem;
  }

  .login-form {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    min-width: 300px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .form-group label {
    font-weight: 500;
    font-size: 0.875rem;
  }

  .form-group input {
    padding: var(--spacing-sm) var(--spacing-md);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: 1rem;
  }

  .form-group input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(234, 114, 110, 0.12);
  }

  .error {
    color: var(--color-danger);
    font-size: 0.8125rem;
    margin: 0;
  }

  .presets {
    margin-top: var(--spacing-lg);
    padding-top: var(--spacing-lg);
    border-top: 1px solid var(--color-border);
  }

  .presets-label {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    margin: 0 0 var(--spacing-sm);
    text-align: center;
  }

  .preset-buttons {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--spacing-sm);
  }

  .preset-btn {
    padding: var(--spacing-xs) var(--spacing-md);
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--color-primary);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .preset-btn:hover {
    background: var(--color-primary);
    color: white;
  }
</style>
