// MWP 2026-10-30: device input matrix (kanban/device-input-matrix) for the
// OpenDots face. The /api edge (app.ts) captures the caller's User-Agent
// (the tailscale-serve -> bridge -> container chain preserves headers; the
// true peer IP does not survive it, so x-forwarded-for's first value is
// used when present) and stores it here per request; the remote-agent
// wrapper (platform.ts) stamps it onto every forwarded run so the engine
// (agentic-stack engine/honey_agui.py _resolve_device) classifies
// phone / ipad / laptop / studio from the REAL browser UA - the same
// contract the cockpit edge implements (OpenIntelligentUI owner-device.ts).
import { AsyncLocalStorage } from 'node:async_hooks';

export interface DeviceRequestContext {
  deviceUserAgent: string;
  devicePeer?: string;
}

export const deviceContext = new AsyncLocalStorage<DeviceRequestContext>();
