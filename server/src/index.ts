/**
 * Servidor Erosion: serve o client estatico (offline) e expoe o WebSocket
 * que sincroniza o estado da partida entre os navegadores.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import { WebSocketServer, type WebSocket } from "ws";
import { RoomManager, type Room } from "./net/rooms.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8080);

const app = express();
// Client estatico (sem CDNs — tudo local para funcionar offline)
const publicDir = join(__dirname, "..", "public");
app.use(express.static(publicDir));
app.get("/health", (_req, res) => res.json({ ok: true }));

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const rooms = new RoomManager();

interface ClientMsg {
  type: string;
  roomCode?: string;
  name?: string;
  action?: "call" | "raise" | "fold" | "check" | "allin";
  amount?: number;
  tokenIds?: string[];
  startingLives?: number;
}

interface SocketCtx {
  playerId: string;
  room?: Room;
}

wss.on("connection", (ws: WebSocket) => {
  const ctx: SocketCtx = { playerId: randomUUID() };

  const send = (obj: unknown) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  };
  const err = (message: string) => send({ type: "error", message });

  ws.on("message", (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return err("Mensagem inválida.");
    }

    switch (msg.type) {
      case "create": {
        const room = rooms.createRoom(msg.startingLives);
        ctx.room = room;
        room.engine.addPlayer(ctx.playerId, msg.name?.trim() || "Jogador");
        room.connections.set(ctx.playerId, { ws, playerId: ctx.playerId, roomCode: room.code });
        send({ type: "joined", roomCode: room.code, playerId: ctx.playerId });
        room.broadcast();
        break;
      }

      case "config": {
        if (!ctx.room) return err("Entre em uma sala primeiro.");
        if (typeof msg.startingLives !== "number") return err("Valor inválido.");
        const e = ctx.room.engine.setStartingLives(ctx.playerId, msg.startingLives);
        if (e) return err(e);
        ctx.room.broadcast();
        break;
      }

      case "join": {
        const room = rooms.getRoom((msg.roomCode ?? "").toUpperCase());
        if (!room) return err("Sala não encontrada.");
        if (room.engine.state.phase !== "lobby" && !room.engine.getPlayer(ctx.playerId)) {
          return err("A partida já começou.");
        }
        ctx.room = room;
        if (!room.engine.getPlayer(ctx.playerId)) {
          room.engine.addPlayer(ctx.playerId, msg.name?.trim() || "Jogador");
        }
        room.connections.set(ctx.playerId, { ws, playerId: ctx.playerId, roomCode: room.code });
        send({ type: "joined", roomCode: room.code, playerId: ctx.playerId });
        room.broadcast();
        break;
      }

      case "start": {
        if (!ctx.room) return err("Entre em uma sala primeiro.");
        if (ctx.room.engine.state.ownerId && ctx.room.engine.state.ownerId !== ctx.playerId) {
          return err("Apenas o dono da sala pode iniciar a partida.");
        }
        if (ctx.room.engine.state.players.filter((p) => p.connected).length < 2) {
          return err("São necessários pelo menos 2 jogadores.");
        }
        ctx.room.engine.startRound();
        ctx.room.broadcast();
        break;
      }

      case "bet": {
        if (!ctx.room || !msg.action) return err("Ação inválida.");
        const e = ctx.room.engine.bet(ctx.playerId, msg.action, msg.amount ?? 0);
        if (e) return err(e);
        ctx.room.engine.checkGameOver();
        ctx.room.broadcast();
        break;
      }

      case "swap": {
        if (!ctx.room || !msg.tokenIds) return err("Troca inválida.");
        const e = ctx.room.engine.swap(ctx.playerId, msg.tokenIds);
        if (e) return err(e);
        ctx.room.broadcast();
        break;
      }

      case "nextRound": {
        if (!ctx.room) return err("Entre em uma sala primeiro.");
        if (ctx.room.engine.checkGameOver()) {
          ctx.room.broadcast();
          return;
        }
        ctx.room.engine.startRound();
        ctx.room.broadcast();
        break;
      }

      default:
        err("Tipo de mensagem desconhecido.");
    }
  });

  ws.on("close", () => {
    if (ctx.room) {
      ctx.room.engine.removePlayer(ctx.playerId);
      ctx.room.connections.delete(ctx.playerId);
      ctx.room.broadcast();
      // Limpa salas vazias.
      if (ctx.room.connections.size === 0) {
        rooms.removeRoom(ctx.room.code);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Erosion rodando em http://localhost:${PORT}`);
});
