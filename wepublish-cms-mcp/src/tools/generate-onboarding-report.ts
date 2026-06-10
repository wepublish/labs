import { buildEnvelope } from '../envelope.js';
import { runScopedTool, tenantInput } from './helpers.js';
import {
  collectSetup,
  overallReadiness,
  type AreaResult,
} from './aggregate.js';
import type { ToolDefinition } from './types.js';

const STATUS_ICON: Record<string, string> = {
  ok: '✅',
  incomplete: '⚠️',
  not_found: '⚠️',
  error: '❌',
};

function renderReport(
  tenant: string,
  overall: string,
  results: AreaResult[]
): string {
  const lines: string[] = [];
  lines.push(`# Onboarding report — ${tenant}`);
  lines.push('');
  lines.push(
    `**Overall:** ${overall === 'ready' ? 'READY ✅' : 'NEEDS WORK ⚠️'}`
  );
  lines.push('');
  for (const r of results) {
    const icon = STATUS_ICON[r.status] ?? '•';
    const tag = r.required ? '' : ' _(optional)_';
    lines.push(`## ${icon} ${r.label}${tag} — ${r.status}`);
    if (r.nextChecks.length > 0) {
      for (const c of r.nextChecks) lines.push(`- [ ] ${c}`);
    } else {
      lines.push('- OK');
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

export const generateOnboardingReportTool: ToolDefinition = {
  name: 'cms_generate_onboarding_report',
  title: 'Generate onboarding report',
  description:
    'Produce a human-readable onboarding/launch-readiness report for the newsroom ' +
    '(markdown), suitable to paste into a Linear issue or ingest as a reviewed summary.',
  inputShape: tenantInput,
  handler(args, ctx) {
    return runScopedTool(
      'cms_generate_onboarding_report',
      args,
      ctx,
      async (tenant, base) => {
        const results = await collectSetup(args, ctx);
        const overall = overallReadiness(results);
        const report = renderReport(tenant, overall, results);

        return buildEnvelope({
          ...base,
          apiVersion: 'v2',
          status: overall === 'ready' ? 'ok' : 'incomplete',
          findings: {
            overall,
            report,
            areas: Object.fromEntries(results.map(r => [r.area, r.status])),
          },
          nextChecks: results
            .filter(r => r.status !== 'ok')
            .flatMap(r => r.nextChecks),
        });
      }
    );
  },
};
