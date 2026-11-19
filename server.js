import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';

const PORT = process.env.PORT || 10000;
const ADMIN_MASTER_KEY = process.env.ADMIN_MASTER_KEY || 'ADMIN_MASTER_SECRET_KEY_9981';
const KEEP_ALIVE_URL = process.env.KEEP_ALIVE_URL || '';

const app = express();
app.use(cors());
app.use(express.json());

// Server metrics
const startTime = Date.now();
let totalMessagesRouted = 0;
let totalBytesRelayed = 0;

// Device & Client Registries
// devices: Map<deviceId, { ws, info, registeredAt, lastSeen }>
const devices = new Map();

// clients: Map<clientId, { ws, deviceId, role, registeredAt, lastSeen }>
const clients = new Map();

// HTTP Health & Status Endpoints (For Render Health Checks & UptimeRobot)
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Remote File Explorer WebSocket & HTTP Relay',
    version: '1.0.0',
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    activeHosts: devices.size,
    activeClients: clients.size,
    totalMessagesRouted,
    totalBytesRelayed,
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Device discovery endpoint
app.get('/api/devices', (req, res) => {
  const list = [];
  for (const [id, dev] of devices.entries()) {
    list.push({
      deviceId: id,
      deviceName: dev.info.deviceName || 'Android Device',
      online: dev.ws.readyState === WebSocket.OPEN,
      lastSeen: dev.lastSeen,
      uptimeSeconds: Math.floor((Date.now() - dev.registeredAt) / 1000)
    });
  }
  res.json({ success: true, count: list.length, devices: list });
});

// Create HTTP and WebSocket Server
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  let boundDeviceId = null;
  let boundClientId = null;
  let boundRole = null; // 'device' | 'client' | 'admin' | 'user'

  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  ws.on('message', (message, isBinary) => {
    try {
      if (isBinary) {
        // Handle raw binary chunk relay if needed
        totalBytesRelayed += message.length;
        if (boundDeviceId && devices.has(boundDeviceId)) {
          const dev = devices.get(boundDeviceId);
          if (dev.ws.readyState === WebSocket.OPEN && dev.ws !== ws) {
            dev.ws.send(message, { binary: true });
          }
        }
        return;
      }

      const str = message.toString();
      totalBytesRelayed += str.length;
      totalMessagesRouted++;

      const data = JSON.parse(str);
      const { type } = data;

      // 1. Heartbeat Ping / Pong
      if (type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
        if (boundDeviceId && devices.has(boundDeviceId)) {
          devices.get(boundDeviceId).lastSeen = Date.now();
        }
        if (boundClientId && clients.has(boundClientId)) {
          clients.get(boundClientId).lastSeen = Date.now();
        }
        return;
      }

      // 2. Register Device Host (Android Phone)
      if (type === 'REGISTER_DEVICE' || (type === 'REGISTER' && (data.role === 'device' || data.role === 'host'))) {
        const deviceId = data.deviceId;
        if (!deviceId) {
          ws.send(JSON.stringify({ type: 'ERROR', error: 'Missing deviceId' }));
          return;
        }

        boundDeviceId = deviceId;
        boundRole = 'device';

        devices.set(deviceId, {
          ws,
          info: {
            deviceName: data.deviceName || 'Android Host',
            pairCode: data.pairCode || data.pairingCode || '',
            ip: clientIp
          },
          registeredAt: Date.now(),
          lastSeen: Date.now()
        });

        console.log(`[Relay] Host Device Registered: ${deviceId} from ${clientIp}`);
        ws.send(JSON.stringify({
          type: 'REGISTERED',
          role: 'device',
          deviceId,
          message: 'Device successfully registered to Render Relay'
        }));

        // Notify waiting clients targeting this device
        for (const [cId, client] of clients.entries()) {
          if (client.deviceId === deviceId && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify({
              type: 'DEVICE_STATUS',
              deviceId,
              online: true,
              deviceName: data.deviceName
            }));
          }
        }
        return;
      }

      // 3. Register Client Controller (Flutter User/Admin App)
      if (type === 'REGISTER_CLIENT' || (type === 'REGISTER' && (data.role === 'client' || data.role === 'user' || data.role === 'admin'))) {
        const deviceId = data.deviceId;
        const clientId = data.clientId || `client_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        
        boundClientId = clientId;
        boundDeviceId = deviceId;
        boundRole = data.role || 'client';

        clients.set(clientId, {
          ws,
          deviceId,
          role: boundRole,
          registeredAt: Date.now(),
          lastSeen: Date.now()
        });

        console.log(`[Relay] Client Registered: ${clientId} (${boundRole}) for Device: ${deviceId}`);
        
        const isDeviceOnline = devices.has(deviceId) && devices.get(deviceId).ws.readyState === WebSocket.OPEN;
        ws.send(JSON.stringify({
          type: 'REGISTERED',
          role: boundRole,
          clientId,
          deviceId,
          deviceOnline: isDeviceOnline
        }));
        return;
      }

      // 4. Command Forwarding (Client -> Device)
      if (type === 'COMMAND') {
        const targetDeviceId = data.deviceId || boundDeviceId;
        const target = devices.get(targetDeviceId);

        if (!target || target.ws.readyState !== WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'RESPONSE',
            cmdId: data.cmdId,
            success: false,
            error: `Device ${targetDeviceId} is offline on Render Relay`,
            timestamp: Date.now()
          }));
          return;
        }

        // Attach client routing tag so we know who to reply to
        data._originClientId = boundClientId;
        target.ws.send(JSON.stringify(data));
        return;
      }

      // 5. Response Forwarding (Device -> Client)
      if (type === 'RESPONSE') {
        const originClientId = data._originClientId;
        if (originClientId && clients.has(originClientId)) {
          const client = clients.get(originClientId);
          if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify(data));
            return;
          }
        }

        // Broadcast to all clients watching this device if originClientId is unknown
        const devId = boundDeviceId || data.deviceId;
        for (const [cId, client] of clients.entries()) {
          if (client.deviceId === devId && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify(data));
          }
        }
        return;
      }

      // 6. WebRTC Signaling Relay (Offer, Answer, ICE Candidate)
      if (type === 'SIGNAL' || type === 'OFFER' || type === 'ANSWER' || type === 'CANDIDATE') {
        const targetDeviceId = data.targetDeviceId || data.deviceId || boundDeviceId;
        
        if (boundRole === 'device') {
          // Send to matching client(s)
          for (const [cId, client] of clients.entries()) {
            if (client.deviceId === targetDeviceId && client.ws.readyState === WebSocket.OPEN) {
              client.ws.send(JSON.stringify(data));
            }
          }
        } else {
          // Send from client to device
          const target = devices.get(targetDeviceId);
          if (target && target.ws.readyState === WebSocket.OPEN) {
            target.ws.send(JSON.stringify(data));
          }
        }
        return;
      }

      // 7. Binary/Base64 File Chunk Relay
      if (type === 'CHUNK' || type === 'TRANSFER_CHUNK') {
        const targetDeviceId = data.deviceId || boundDeviceId;
        if (boundRole === 'device') {
          // Forward chunk to client
          const originClientId = data._originClientId;
          if (originClientId && clients.has(originClientId)) {
            clients.get(originClientId).ws.send(JSON.stringify(data));
          } else {
            for (const [cId, client] of clients.entries()) {
              if (client.deviceId === targetDeviceId && client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(JSON.stringify(data));
              }
            }
          }
        } else {
          // Forward chunk to device
          const target = devices.get(targetDeviceId);
          if (target && target.ws.readyState === WebSocket.OPEN) {
            target.ws.send(JSON.stringify(data));
          }
        }
        return;
      }

    } catch (err) {
      console.error('[Relay] Error handling message:', err.message);
    }
  });

  ws.on('close', () => {
    if (boundRole === 'device' && boundDeviceId) {
      devices.delete(boundDeviceId);
      console.log(`[Relay] Device Disconnected: ${boundDeviceId}`);
      // Notify clients
      for (const [cId, client] of clients.entries()) {
        if (client.deviceId === boundDeviceId && client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify({
            type: 'DEVICE_STATUS',
            deviceId: boundDeviceId,
            online: false
          }));
        }
      }
    } else if (boundClientId) {
      clients.delete(boundClientId);
      console.log(`[Relay] Client Disconnected: ${boundClientId}`);
    }
  });

  ws.on('error', (err) => {
    console.warn('[Relay] WebSocket client error:', err.message);
  });
});

// Self-ping to prevent Render 15-minute sleep (Optional)
if (KEEP_ALIVE_URL) {
  console.log(`[Relay] Self-ping active for URL: ${KEEP_ALIVE_URL}`);
  setInterval(() => {
    try {
      fetch(`${KEEP_ALIVE_URL}/health`)
        .then(r => console.log(`[Relay] Keep-alive ping sent: ${r.status}`))
        .catch(e => console.warn(`[Relay] Keep-alive ping error: ${e.message}`));
    } catch (_) {}
  }, 13 * 60 * 1000); // Every 13 minutes
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🚀 Remote File Explorer Relay Server is Running!`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌐 Health Check: http://localhost:${PORT}/health`);
  console.log(`⚡ WebSocket URL: ws://localhost:${PORT}`);
  console.log(`=======================================================`);
});
