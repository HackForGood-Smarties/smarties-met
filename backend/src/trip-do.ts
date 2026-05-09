import { DurableObject } from "cloudflare:workers";
import type { Env } from "./types";
import { STAGES } from "./types";

interface State {
  stage: number;
  status: string;
  driver: { name: string; vehicle: string; plate: string } | null;
  escort: { name: string } | null;
  arrivesAt: string | null;
  updatedAt: string;
}

interface AdvancePayload {
  stage?: number;
  note?: string;
}

const FINAL_STAGE = STAGES.length - 1;

// One TripRoom instance per trip id. Keeps current stage in storage so the
// caregiver dashboard sees a consistent view across reloads, and fans out
// updates over WebSocket so the UI feels live.
export class TripRoom extends DurableObject<Env> {
  private sockets = new Set<WebSocket>();
  private autoTimerId: number | null = null;

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (req.headers.get("Upgrade") === "websocket") {
      return this.handleSocket();
    }
    switch (url.pathname) {
      case "/state":
        return Response.json(await this.getState());
      case "/advance":
        return Response.json(
          await this.advance((await req.json().catch(() => ({}))) as AdvancePayload),
        );
      case "/auto-start":
        await this.startAutoAdvance();
        return Response.json({ ok: true, mode: "auto" });
      case "/auto-stop":
        this.stopAutoAdvance();
        return Response.json({ ok: true, mode: "manual" });
      case "/hydrate":
        return Response.json(await this.hydrate(await req.json()));
    }
    return new Response("not found", { status: 404 });
  }

  // ───────────────────────── state ─────────────────────────

  private async getState(): Promise<State> {
    const stored = await this.ctx.storage.get<State>("state");
    return (
      stored ?? {
        stage: 0,
        status: "pending",
        driver: null,
        escort: null,
        arrivesAt: null,
        updatedAt: new Date().toISOString(),
      }
    );
  }

  // Called once when the trip is created or the worker wants to seed the room
  // from D1. Idempotent — only writes if storage is empty.
  private async hydrate(payload: unknown): Promise<{ hydrated: boolean }> {
    const existing = await this.ctx.storage.get<State>("state");
    if (existing) return { hydrated: false };
    const next = payload as Partial<State>;
    const seed: State = {
      stage: clampStage(next.stage ?? 0),
      status: next.status ?? "pending",
      driver: next.driver ?? null,
      escort: next.escort ?? null,
      arrivesAt: next.arrivesAt ?? null,
      updatedAt: new Date().toISOString(),
    };
    await this.ctx.storage.put("state", seed);
    return { hydrated: true };
  }

  private async advance(payload: AdvancePayload): Promise<State> {
    const current = await this.getState();
    const target =
      payload.stage !== undefined
        ? clampStage(payload.stage)
        : Math.min(FINAL_STAGE, current.stage + 1);

    const status =
      target === 0
        ? "pending"
        : target >= FINAL_STAGE
          ? "in_progress" // finishes the booked-leg; "completed" is set at end-of-trip elsewhere
          : "confirmed";

    const next: State = {
      ...current,
      stage: target,
      status,
      updatedAt: new Date().toISOString(),
    };
    await this.ctx.storage.put("state", next);
    this.broadcast({ type: "stage", state: next, note: payload.note });
    return next;
  }

  // ───────────────────────── websockets ─────────────────────────

  private handleSocket(): Response {
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();
    this.sockets.add(server);

    this.getState().then((state) => {
      server.send(JSON.stringify({ type: "snapshot", state }));
    });

    server.addEventListener("close", () => this.sockets.delete(server));
    server.addEventListener("error", () => this.sockets.delete(server));

    return new Response(null, { status: 101, webSocket: client });
  }

  private broadcast(message: unknown): void {
    const payload = JSON.stringify(message);
    for (const ws of this.sockets) {
      try {
        ws.send(payload);
      } catch {
        this.sockets.delete(ws);
      }
    }
  }

  // ───────────────────────── auto-advance (demo) ─────────────────────────
  // The prototype walks the stepper every 6s; mirror that on the backend
  // for the on-stage demo. Toggle from the driver/admin app via /auto-start.

  private async startAutoAdvance(): Promise<void> {
    this.stopAutoAdvance();
    const everyMs =
      Number.parseInt(this.env.DEMO_AUTO_ADVANCE_SECONDS, 10) * 1000 || 6000;
    const tick = async () => {
      const state = await this.getState();
      if (state.stage >= FINAL_STAGE) {
        this.stopAutoAdvance();
        return;
      }
      await this.advance({ note: "demo auto-advance" });
      this.autoTimerId = setTimeout(tick, everyMs) as unknown as number;
    };
    this.autoTimerId = setTimeout(tick, everyMs) as unknown as number;
  }

  private stopAutoAdvance(): void {
    if (this.autoTimerId !== null) {
      clearTimeout(this.autoTimerId);
      this.autoTimerId = null;
    }
  }
}

function clampStage(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(FINAL_STAGE, Math.floor(n)));
}
