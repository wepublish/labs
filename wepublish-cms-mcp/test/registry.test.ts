import { describe, it, expect } from 'vitest';
import { tools } from '../src/tools/registry.js';

const EXPECTED = [
  'cms_get_site_profile',
  'cms_check_payment_setup',
  'cms_check_member_plans',
  'cms_check_subscription_setup',
  'cms_check_peering_status',
  'cms_check_navigation_domain_branding',
  'cms_get_setup_status',
  'cms_generate_onboarding_report',
];

describe('tool registry', () => {
  it('exposes exactly the eight read tools', () => {
    expect(tools.map(t => t.name).sort()).toEqual([...EXPECTED].sort());
  });

  it('has unique names and required metadata', () => {
    const names = tools.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of tools) {
      expect(t.name).toMatch(/^cms_/);
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.inputShape).toHaveProperty('newsroom');
    }
  });
});
