import { ComputerService } from './computer-service.js';
import { ConnectionService } from './connections.js';
import { PageService, type PageIntelligence } from './page-service.js';
import { randomUUID } from 'node:crypto';
import {
  CopilotKitIntelligence,
  CopilotRuntime,
  createCopilotHonoHandler,
  supportsLocalThreadEndpoints,
  type CopilotHonoApp,
} from '@copilotkit/runtime/v2';
import { createSlackChannel } from './slack-channel.js';
export { slackIdentity } from './slack-channel.js';
import { Store } from './store.js';
import { WorkspaceStore } from './workspace.js';
import { DotAgent } from './dot-agent.js';
import { HttpAgent } from '@ag-ui/client';
import { runThreadTurn } from './headless.js';
import {
  INTELLIGENCE_KEY_MISSING_LABEL,
  setupStatus,
  type PlatformConfig,
} from './platform-config.js';
import { validateRuntimeScope } from './runtime-scope.js';
import { learningSelector } from './learning.js';
import { SetupTelemetry } from './setup-telemetry.js';
export class Platform {
  private channelStartupFailed = false;
  private runtime?: CopilotRuntime;
  readonly setupTelemetry: SetupTelemetry;
  readonly pages: PageService;
  readonly computers: ComputerService;
  readonly connections: ConnectionService;
  readonly intelligence?: CopilotKitIntelligence;
  readonly handler?: CopilotHonoApp;
  constructor(
    readonly store: Store,
    readonly workspace: WorkspaceStore,
    readonly config: PlatformConfig,
  ) {
    this.setupTelemetry = new SetupTelemetry(store);
    this.computers = new ComputerService(
      workspace,
      config,
      () => store.settings().paused,
    );
    this.connections = new ConnectionService(workspace.connections);
    this.pages = new PageService(workspace, () => {
      this.requireReady();
      return this.intelligence ?? this.localPageIntelligence();
    });
    // MWP 2026-10-27 (owner law: self-host first, no third-party platform
    // cloud): CopilotKit Intelligence is opt-in. Without a key the runtime
    // runs its local thread mode — thread data stays in the runtime's local
    // store and nothing is sent to cloud.copilotkit.ai.
    if (config.intelligenceKey) {
      this.intelligence = new CopilotKitIntelligence({
        apiKey: config.intelligenceKey,
        apiUrl: config.intelligenceApiUrl,
        wsUrl: config.intelligenceWsUrl,
        getLearningContainerId: learningSelector(
          workspace,
          config.slackDotId ?? workspace.dots()[0]?.id,
        ),
      });
    }
    const channels = [];
    if (config.slackChannel && config.slackTeam && config.slackUsers.length) {
      const dotId = config.slackDotId ?? workspace.dots()[0].id;
      if (!workspace.dot(dotId))
        throw new Error('SLACK_DOT_ID does not identify an existing Dot.');
      const slack = createSlackChannel({
        name: config.slackChannel,
        config,
        ownerId: workspace.ownerId,
        paused: () => store.settings().paused,
        agent: () =>
          new DotAgent(
            store,
            workspace,
            config,
            dotId,
            true,
            this.setupTelemetry,
          ),
      });
      channels.push(slack);
    }
    const runtimeOptions = {
      telemetryId: this.setupTelemetry.identity,
      telemetryProperties: this.setupTelemetry.metadata,
      identifyUser: async () => ({
        id: workspace.ownerId,
        name: 'OpenDots owner',
      }),
      agents: async () =>
        Object.fromEntries(
          workspace
            .dots()
            .map((dot) => {
              // MWP 2026-10-27: Dots mapped in REMOTE_DOT_AGENTS (matched by
              // lowercased Dot name) run on an external AG-UI agent — the
              // real engine behind the face (Honey -> :8126), same
              // remote-ag-ui pattern OpenBot uses for its Bots.
              const remoteUrl = config.remoteDotAgents?.[dot.name.toLowerCase()];
              return [
                dot.id,
                remoteUrl
                  ? new HttpAgent({ url: remoteUrl, agentId: dot.id })
                  : new DotAgent(
                      store,
                      workspace,
                      config,
                      dot.id,
                      false,
                      this.setupTelemetry,
                    ),
              ];
            }),
        ),
      channels,
      generateThreadNames: true,
    };
    // MWP 2026-10-27: two typed constructions — with the cloud client
    // (opt-in) or in the runtime's SSE mode (no intelligence argument,
    // nothing leaves the machine). SSE mode disallows channels and
    // cloud-generated thread names; the Slack channel lane is therefore
    // cloud-only and disabled here.
    const runtime = this.intelligence
      ? new CopilotRuntime({
          intelligence: this.intelligence,
          ...runtimeOptions,
        })
      : new CopilotRuntime({
          ...runtimeOptions,
          channels: undefined,
          generateThreadNames: undefined,
        });
    this.runtime = runtime;
    this.handler = createCopilotHonoHandler({
      runtime,
      basePath: '/api/copilotkit',
      cors: { origin: [] },
    });
  }
  setup() {
    return setupStatus(
      this.config,
      this.handler?.channels?.status().overall ??
        (this.config.slackChannel ? 'setup_required' : 'not_configured'),
      this.channelStartupFailed,
    );
  }
  requireReady() {
    const missing = this.setup().missing;
    if (missing.length)
      throw new Error(`Setup required: ${missing.join(', ')}.`);
  }

  /**
   * Local thread reads for the no-cloud mode. The runtime's local runner
   * records thread messages as chats run; history survives until process
   * restart (stated limitation of the local mode).
   */
  private localThreadMessages(threadId: string): {
    messages: { role: string; content: unknown }[];
  } {
    const runner = this.runtime?.runner;
    if (!runner || !supportsLocalThreadEndpoints(runner))
      return { messages: [] };
    return {
      messages: runner.getThreadMessages(threadId).map((message) => ({
        role: (message as { role?: string }).role ?? '',
        content: (message as { content?: unknown }).content ?? '',
      })),
    };
  }

  private localPageIntelligence(): PageIntelligence {
    return {
      getOrCreateThread: async (input) => {
        const existing = this.workspace
          .conversations()
          .find((t) => t.id === input.threadId);
        if (!existing)
          this.workspace.bindThread(
            input.threadId,
            input.agentId,
            input.name,
          );
        return { id: input.threadId };
      },
      getThreadMessages: async (input) =>
        this.localThreadMessages(input.threadId),
    };
  }
  async start() {
    this.setupTelemetry.start();
    if (this.handler?.channels) {
      try {
        await this.handler.channels.ready({ timeoutMs: 15000 });
        this.channelStartupFailed = false;
      } catch (error) {
        this.channelStartupFailed = true;
        this.setupTelemetry.capture({
          kind: 'setup_failed',
          step: 'settings',
          error_class: 'channel_start_failed',
        });
        throw error;
      }
    }
  }
  async stop() {
    await this.setupTelemetry.stop();
    await this.handler?.channels?.stop();
  }
  async createConversation(dotId: string, title: string) {
    this.requireReady();
    if (!this.workspace.dot(dotId)) throw new Error('Dot not found.');
    const id = randomUUID();
    if (this.intelligence) {
      try {
        await this.intelligence.createThread({
          threadId: id,
          userId: this.workspace.ownerId,
          agentId: dotId,
          name: title,
        });
      } catch {
        throw new Error(
          'Intelligence could not create this conversation. Check the runtime key and connection.',
        );
      }
    }
    return this.workspace.bindThread(id, dotId, title);
  }
  async history(threadId: string): Promise<string> {
    this.requireReady();
    this.workspace.requireThread(threadId);
    const history = this.intelligence
      ? await this.intelligence.getThreadMessages({
          threadId,
          userId: this.workspace.ownerId,
        })
      : this.localThreadMessages(threadId);
    return history.messages
      .filter((message) => ['user', 'assistant'].includes(message.role))
      .slice(-12)
      .map(
        (message) =>
          `${message.role}: ${typeof message.content === 'string' ? message.content : ''}`,
      )
      .join('\n')
      .slice(-12000);
  }
  async handle(request: Request): Promise<Response> {
    if (!this.handler)
      return Response.json(
        { error: `Setup required: ${INTELLIGENCE_KEY_MISSING_LABEL}.` },
        { status: 503 },
      );
    let body: unknown;
    if (request.method !== 'GET' && request.method !== 'HEAD')
      body = await request
        .clone()
        .json()
        .catch(() => null);
    try {
      validateRuntimeScope(request, this.workspace, body);
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Conversation scope denied.',
        },
        { status: 403 },
      );
    }
    return this.handler.fetch(request);
  }
  async turn(
    threadId: string,
    prompt: string,
    signal: AbortSignal,
    metadata?: Record<string, unknown>,
  ): Promise<string> {
    this.requireReady();
    const thread = this.workspace.requireThread(threadId);
    return runThreadTurn(
      this.config.runtimeUrl,
      this.config.ownerToken
        ? { Authorization: `Bearer ${this.config.ownerToken}` }
        : {},
      thread.dotId,
      threadId,
      prompt,
      signal,
      metadata,
    );
  }
}
