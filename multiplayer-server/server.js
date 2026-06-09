import { WebSocketServer } from 'ws';
import { createServer } from 'http';

const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Cederic WoyFormer Multiplayer Server Online\n');
});

const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 8080;

// Registry of all connected clients
// socket -> clientInfo
const clients = new Map();

wss.on('connection', (ws) => {
  console.log('New client connection established');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      // 1. JOIN ROOM
      if (data.type === 'join') {
        const id = data.id || crypto.randomUUID();
        const clientInfo = {
          ws,
          id,
          name: data.name || 'Anonymous',
          room: data.room || 'default',
          sex: data.sex || 'male',
          color: data.color || '#00f2fe',
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
        
        clients.set(ws, clientInfo);
        console.log(`Client ${clientInfo.name} joined room [${clientInfo.room}]`);

        // Send confirmation back to joiner with their own resolved ID
        ws.send(JSON.stringify({
          type: 'join_success',
          id: id
        }));

        // Send existing players in room to the new joiner
        const playersInRoom = [];
        for (const [otherWs, info] of clients.entries()) {
          if (info.room === clientInfo.room && otherWs !== ws) {
            playersInRoom.push({
              id: info.id,
              name: info.name,
              sex: info.sex,
              color: info.color,
              x: info.x,
              y: info.y,
              facingDir: info.facingDir,
              isDashing: info.isDashing
            });
          }
        }
        if (playersInRoom.length > 0) {
          ws.send(JSON.stringify({
            type: 'room_players',
            players: playersInRoom
          }));
        }

        // Notify other players in room
        broadcastToRoom(ws, clientInfo.room, {
          type: 'player_joined',
          id: id,
          name: clientInfo.name,
          sex: clientInfo.sex,
          color: clientInfo.color
        });
      }

      // 2. MOVE UPDATE
      else if (data.type === 'move') {
        const info = clients.get(ws);
        if (info) {
          info.x = data.x;
          info.y = data.y;
          info.vx = data.vx;
          info.vy = data.vy;
          info.facingDir = data.facingDir;
          info.isDashing = data.isDashing;
          info.squishX = data.squishX || 1;
          info.squishY = data.squishY || 1;
          info.isAlive = data.isAlive !== undefined ? data.isAlive : true;
          
          broadcastToRoom(ws, info.room, {
            type: 'player_moved',
            id: info.id,
            x: info.x,
            y: info.y,
            vx: info.vx,
            vy: info.vy,
            facingDir: info.facingDir,
            isDashing: info.isDashing,
            squishX: info.squishX,
            squishY: info.squishY,
            isAlive: info.isAlive
          });
        }
      }

      // 3. LASER FIRE
      else if (data.type === 'shoot') {
        const info = clients.get(ws);
        if (info) {
          broadcastToRoom(ws, info.room, {
            type: 'player_shot',
            id: info.id,
            x: data.x,
            y: data.y,
            vx: data.vx,
            vy: data.vy,
            color: info.color
          });
        }
      }

      // 4. DESTRUCTIBLE BLOCK BREAK
      else if (data.type === 'block_break') {
        const info = clients.get(ws);
        if (info) {
          broadcastToRoom(ws, info.room, {
            type: 'block_broken',
            r: data.r,
            c: data.c
          });
        }
      }

      // 5. BEAVER INTERACTIONS
      else if (data.type === 'beaver_action') {
        const info = clients.get(ws);
        if (info) {
          broadcastToRoom(ws, info.room, {
            type: 'beaver_action',
            actionType: data.actionType, // 'pickup', 'drop', 'throw'
            id: data.id,
            x: data.x,
            y: data.y,
            vx: data.vx,
            vy: data.vy
          });
        }
      }

    } catch (err) {
      console.error('Error parsing client message:', err);
    }
  });

  ws.on('close', () => {
    const info = clients.get(ws);
    if (info) {
      console.log(`Client ${info.name} disconnected`);
      broadcastToRoom(ws, info.room, {
        type: 'player_left',
        id: info.id
      });
      clients.delete(ws);
    }
  });
});

// Broadcast helper (sends message to everyone in the room except the sender)
function broadcastToRoom(senderWs, room, payload) {
  const msgStr = JSON.stringify(payload);
  for (const [ws, info] of clients.entries()) {
    if (info.room === room && ws !== senderWs && ws.readyState === 1) { // 1 = OPEN
      ws.send(msgStr);
    }
  }
}

server.listen(PORT, () => {
  console.log(`Multiplayer server running on port ${PORT}`);
});
