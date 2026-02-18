import { defineConfig } from 'vite';
import { resolve } from 'path';
import { globSync } from 'glob';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ mode }) => {

  // Discover all apps (Windows-safe path handling)
  const appEntries = globSync('src/*/index.html', {
    ignore: ['src/shared/**', 'src/_template/**']
  }).map((file) => {
    const normalizedPath = file.replace(/\\/g, '/'); // Handle Windows paths
    const appName = normalizedPath.split('/')[1];
    return [appName, resolve(__dirname, file)];
  });

  // Discover slide sub-decks (src/slides/*/index.html)
  const slideEntries = globSync('src/slides/*/index.html').map((file) => {
    const normalizedPath = file.replace(/\\/g, '/');
    const parts = normalizedPath.split('/');
    return [`${parts[1]}/${parts[2]}`, resolve(__dirname, file)];
  });

  return {
    // Conditional base: /labs/ for prod, / for dev
    base: mode === 'production' ? '/labs/' : '/',

    root: resolve(__dirname, 'src'),
    envDir: resolve(__dirname),
    publicDir: resolve(__dirname, 'public'),

    plugins: [
      svelte(),
      basicSsl(),
      {
        name: 'fix-favicon-base',
        transformIndexHtml(html) {
          if (mode === 'production') {
            return html.replace('href="/favicon.svg"', 'href="/labs/favicon.svg"');
          }
          return html;
        }
      }
    ],

    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@': resolve(__dirname, 'src')
      },
      // Ensure browser conditions are used for jose and other packages
      conditions: ['browser', 'import', 'module', 'default']
    },

    build: {
      outDir: resolve(__dirname, 'dist'),
      emptyOutDir: true,
      rollupOptions: {
        input: Object.fromEntries([...appEntries, ...slideEntries]),
        output: {
          // Shared vendor chunks to reduce duplication
          manualChunks: {
            'vendor-supabase': ['@supabase/supabase-js'],
            'vendor-jose': ['jose']
          }
        }
      }
    },

    server: {
      open: true,
      port: 3200,
      https: {},
      host: '0.0.0.0'
    },

    preview: {
      port: 3200
    }
  };
});
