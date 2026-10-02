/**
 * Gestao de salas: cada sala tem uma GameEngine e um conjunto de conexoes.
 */
import type { WebSocket } from "ws";
import { GameEngine } from "../game/engine.js";

export interface Connection {
  ws: WebSocket;
  playerId: string;
  roomCode: string;
}

export class Room {
  code: string;
  engine: GameEngine;
  connections = new Map<string, Connection>(); // playerId -> conn

  constructor(code: string, startingLives?: number) {
    this.code = code;
    this.engine = new GameEngine(code, startingLives);
  }

  broadcast(): void {
    for (const [playerId, conn] of this.connections) {
      if (conn.ws.readyState === conn.ws.OPEN) {
        const view = this.engine.viewFor(playerId);
        conn.ws.send(JSON.stringify({ type: "state", state: view }));
      }
    }
  }
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  createRoom(startingLives?: number): Room {
    let code = this.generateCode();
    while (this.rooms.has(code)) code = this.generateCode();
    const room = new Room(code, startingLives);
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  removeRoom(code: string): void {
    this.rooms.delete(code);
  }

  private generateCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }
}
