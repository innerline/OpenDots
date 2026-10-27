import type { WebConfig } from './parallel.js';
import type { SetupStatus } from '../shared/types.js';

// `copilotkit project select` writes the CLI name and deletes the template name.
const INTELLIGENCE_API_KEY_ENV_NAMES = [
  'CPK_INTELLIGENCE_API_KEY',
  'INTELLIGENCE_API_KEY',
] as const;
export const INTELLIGENCE_KEY_MISSING_LABEL = `${INTELLIGENCE_API_KEY_ENV_NAMES[1]} (or ${INTELLIGENCE_API_KEY_ENV_NAMES[0]})`;

export function intelligenceApiKeyFromEnv(
  env: Record<string, string | undefined>,
): string | undefined {
  return firstNonEmptyEnvValue(env, INTELLIGENCE_API_KEY_ENV_NAMES);
}

export function intelligenceWsUrlFromEnv(
  env: Record<string, string | undefined>,
): string | undefined {
  return firstNonEmptyEnvValue(env, [
    'INTELLIGENCE_GATEWAY_WS_URL',
    'INTELLIGENCE_WS_URL',
  ]);
}

function firstNonEmptyEnvValue(
  env: Record<string, string | undefined>,
  names: readonly string[],
): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

// MWP 2026-10-27: remote-agent Dots. Maps a Dot NAME (lowercased) to an
// external AG-UI endpoint, so a Dot can be the FACE of a real agent engine
// that lives elsewhere (e.g. Honey -> the OpenCode honey adapter on :8126,
// the same remote-ag-ui pattern OpenBot uses). Format, comma-separated:
//   REMOTE_DOT_AGENTS="Honey=http://127.0.0.1:8126/,Scout=http://127.0.0.1:8130/"
// A mapped Dot skips this template's own TanStack agent entirely; its name,
// avatar, and Spaces remain the presentation layer only.
export function remoteDotAgentsFromEnv(
  env: Record<string, string | undefined>,
): Record<string, string> | undefined {
  const raw = env.REMOTE_DOT_AGENTS?.trim();
  if (!raw) return undefined;
  const map: Record<string, string> = {};
  for (const pair of raw.split(',')) {
    const entry = pair.trim();
    if (!entry) continue;
    const eq = entry.indexOf('=');
    const name = eq > 0 ? entry.slice(0, eq).trim().toLowerCase() : '';
    const url = eq > 0 ? entry.slice(eq + 1).trim() : '';
    if (!name || !/^https?:\/\/\S+$/.test(url)) {
      console.warn(`REMOTE_DOT_AGENTS: skipping malformed entry "${entry}"`);
      continue;
    }
    map[name] = url;
  }
  return Object.keys(map).length ? map : undefined;
}

export interface PlatformConfig extends WebConfig {
  intelligenceKey?: string;
  intelligenceApiUrl?: string;
  intelligenceWsUrl?: string;
  model?: string;
  apiKey?: string;
  baseUrl: string;
  remoteDotAgents?: Record<string, string>;
  computerSupervisorUrl?: string;
  computerSupervisorToken?: string;
  computerToken?: string;
  computerNamespace?: string;
  browserUrl?: string;
  browserSecret?: string;
  voiceKey?: string;
  voiceModel?: string;
  voiceName: string;
  slackChannel?: string;
  slackTeam?: string;
  slackUsers: string[];
  slackDotId?: string;
  runtimeUrl: string;
  ownerToken?: string;
}
export function setupStatus(
  config: PlatformConfig,
  slack = 'not_configured',
  activationFailed = false,
): SetupStatus {
  const missing = [
    !config.intelligenceKey && INTELLIGENCE_KEY_MISSING_LABEL,
    !config.apiKey && 'OPENAI_API_KEY',
    !config.model && 'OPENAI_MODEL',
  ].filter((item): item is string => !!item);
  const declaredSlack = !!(
    config.slackChannel &&
    config.slackTeam &&
    config.slackUsers.length
  );
  slack = declaredSlack
    ? activationFailed && slack !== 'online'
      ? 'activation_failed'
      : slack
    : config.slackChannel || config.slackTeam || config.slackUsers.length
      ? 'setup_required'
      : 'not_configured';
  return {
    intelligence: !!config.intelligenceKey,
    model: !!(config.apiKey && config.model),
    browser: !!(config.browserUrl && config.browserSecret),
    voice: !!(config.voiceKey && config.voiceModel && !missing.length),
    slack,
    missing,
  };
}
