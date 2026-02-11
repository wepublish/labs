#!/usr/bin/env node

/**
 * Create a new app from the _template directory.
 *
 * Usage: pnpm new-app <app-name>
 *
 * Example: pnpm new-app my-cool-app
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const srcDir = join(rootDir, 'src');
const templateDir = join(srcDir, '_template');

// Get app name from command line
const appName = process.argv[2];

if (!appName) {
  console.error('Error: Please provide an app name');
  console.error('Usage: pnpm new-app <app-name>');
  console.error('Example: pnpm new-app my-cool-app');
  process.exit(1);
}

// Validate app name
const validNameRegex = /^[a-z][a-z0-9-]*$/;
if (!validNameRegex.test(appName)) {
  console.error(`Error: Invalid app name "${appName}"`);
  console.error('App name must:');
  console.error('  - Start with a lowercase letter');
  console.error('  - Contain only lowercase letters, numbers, and hyphens');
  console.error('Example: my-cool-app');
  process.exit(1);
}

// Check for reserved names
const reservedNames = ['shared', '_template', 'node_modules', 'dist'];
if (reservedNames.includes(appName)) {
  console.error(`Error: "${appName}" is a reserved name`);
  process.exit(1);
}

const appDir = join(srcDir, appName);

// Check if app already exists
if (existsSync(appDir)) {
  console.error(`Error: App "${appName}" already exists at ${appDir}`);
  process.exit(1);
}

// Check if template exists
if (!existsSync(templateDir)) {
  console.error(`Error: Template directory not found at ${templateDir}`);
  process.exit(1);
}

// Format app name for display
function formatAppName(name) {
  return name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const displayName = formatAppName(appName);

// Copy directory recursively
function copyDir(src, dest, replacements) {
  mkdirSync(dest, { recursive: true });

  const entries = readdirSync(src);

  for (const entry of entries) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const stat = statSync(srcPath);

    if (stat.isDirectory()) {
      copyDir(srcPath, destPath, replacements);
    } else {
      let content = readFileSync(srcPath, 'utf-8');

      // Apply replacements
      for (const [placeholder, value] of Object.entries(replacements)) {
        content = content.replace(new RegExp(placeholder, 'g'), value);
      }

      writeFileSync(destPath, content);
    }
  }
}

// Copy template with replacements
console.log(`Creating app "${appName}"...`);

const replacements = {
  '__APP_NAME__': displayName,
  '__APP_DESCRIPTION__': `${displayName} - A Labs application`,
  '__app-name__': appName
};

copyDir(templateDir, appDir, replacements);

console.log(`
App created successfully!

  ${appDir}

Next steps:

  1. Start the dev server:
     pnpm dev

  2. Open in browser:
     https://localhost:3200/${appName}/

  3. Edit the app:
     ${appDir}/App.svelte

Happy coding!
`);
