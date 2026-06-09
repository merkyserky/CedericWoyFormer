export async function onRequest(context) {
  const { request, env } = context;
  
  // Handle OPTIONS CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Upgrade",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const upgradeHeader = request.headers.get("Upgrade");
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
    return new Response("Expected Upgrade: websocket", { 
      status: 426,
      headers: { "Access-Control-Allow-Origin": "*" }
    });
  }

  const url = new URL(request.url);
  const roomName = url.searchParams.get("room") || "default";

  if (!env.MULTIPLAYER_ROOM) {
    return new Response("Durable Object binding 'MULTIPLAYER_ROOM' not found.", { 
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" }
    });
  }

  const id = env.MULTIPLAYER_ROOM.idFromName(roomName);
  const stub = env.MULTIPLAYER_ROOM.get(id);

  return stub.fetch(request);
}

// Cloudflare Durable Object Class for Multiplayer Sync
export class MultiplayerRoom {
  constructor(state, env) {
    this.state = state;
    this.sessions = [];
  }

  async fetch(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    await this.handleSession(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: {
        "Access-Control-Allow-Origin": "*",
      }
    });
  }

  async handleSession(webSocket) {
    webSocket.accept();
    
    // Store WebSocket context
    const session = {
      webSocket,
      id: null,
      room: null,
      name: "Anonymous",
      sex: "male",
      color: "#00f2fe",
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      facingDir: 1,
      isDashing: false,
      squishX: 1,
      squishY: 1,
      isAlive: true
    };
    
    this.sessions.push(session);

    webSocket.addEventListener("message", (msg) => {
      try {
        const data = JSON.parse(msg.data);
        
        // 1. JOIN ROOM
        if (data.type === "join") {
          session.id = data.id || crypto.randomUUID();
          session.room = data.room || "default";
          session.name = data.name || "Anonymous";
          session.sex = data.sex || "male";
          session.color = data.color || "#00f2fe";
          
          // Reply with join confirmation
          webSocket.send(JSON.stringify({
            type: "join_success",
            id: session.id
          }));

          // Send current occupants to the new joiner
          const playersInRoom = [];
          for (const other of this.sessions) {
            if (other.room === session.room && other.id && other !== session) {
              playersInRoom.push({
                id: other.id,
                name: other.name,
                sex: other.sex,
                color: other.color,
                x: other.x,
                y: other.y,
                facingDir: other.facingDir,
                isDashing: other.isDashing
              });
            }
          }
          
          if (playersInRoom.length > 0) {
            webSocket.send(JSON.stringify({
              type: "room_players",
              players: playersInRoom
            }));
          }

          // Broadcast join event
          this.broadcastToRoom(session, {
            type: "player_joined",
            id: session.id,
            name: session.name,
            sex: session.sex,
            color: session.color
          });
        }
        
        // 2. MOVEMENT SNAPSHOT
        else if (data.type === "move") {
          session.x = data.x;
          session.y = data.y;
          session.vx = data.vx;
          session.vy = data.vy;
          session.facingDir = data.facingDir;
          session.isDashing = data.isDashing;
          session.squishX = data.squishX || 1;
          session.squishY = data.squishY || 1;
          session.isAlive = data.isAlive !== undefined ? data.isAlive : true;

          this.broadcastToRoom(session, {
            type: "player_moved",
            id: session.id,
            x: session.x,
            y: session.y,
            vx: session.vx,
            vy: session.vy,
            facingDir: session.facingDir,
            isDashing: session.isDashing,
            squishX: session.squishX,
            squishY: session.squishY,
            isAlive: session.isAlive
          });
        }
        
        // 3. SHOOT PROJECTILE
        else if (data.type === "shoot") {
          this.broadcastToRoom(session, {
            type: "player_shot",
            id: session.id,
            x: data.x,
            y: data.y,
            vx: data.vx,
            vy: data.vy,
            color: session.color
          });
        }
        
        // 4. BLOCK DESTRUCTION
        else if (data.type === "block_break") {
          this.broadcastToRoom(session, {
            type: "block_broken",
            r: data.r,
            c: data.c
          });
        }
        
        // 5. BEAVER CO-OP ACTIONS
        else if (data.type === "beaver_action") {
          this.broadcastToRoom(session, {
            type: "beaver_action",
            actionType: data.actionType,
            id: data.id,
            x: data.x,
            y: data.y,
            vx: data.vx,
            vy: data.vy
          });
        }
      } catch (err) {
        console.error("Durable Object JSON error:", err);
      }
    });

    const closeHandler = () => {
      this.closeSession(session);
    };

    webSocket.addEventListener("close", closeHandler);
    webSocket.addEventListener("error", closeHandler);
  }

  broadcastToRoom(sender, payload) {
    const msgStr = JSON.stringify(payload);
    for (const session of this.sessions) {
      if (session.room === sender.room && session !== sender) {
        try {
          session.webSocket.send(msgStr);
        } catch (e) {
          // session closed or errored, handled by event listeners
        }
      }
    }
  }

  closeSession(session) {
    const idx = this.sessions.indexOf(session);
    if (idx > -1) {
      this.sessions.splice(idx, 1);
    }
    if (session.id) {
      this.broadcastToRoom(session, {
        type: "player_left",
        id: session.id
      });
    }
  }
}
