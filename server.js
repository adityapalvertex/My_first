'use strict';
const http = require('node:http');
const { WebSocketServer, WebSocket } = require('ws');
const PORT = Number(process.env.PORT || 10000);
const clients = new Map();
const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, service: 'CHOMU HIDE signaling', connectedClients: clients.size }));
  }
  res.writeHead(404); res.end('Not found');
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024, perMessageDeflate: false });
server.on('upgrade', (req, socket, head) => {
  let u;
  try { u = new URL(req.url, `http://${req.headers.host || 'localhost'}`); } catch { socket.destroy(); return; }
  if (u.pathname !== '/peerjs') { socket.write('HTTP/1.1 404 Not Found\r\n\r\n'); socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req, u));
});
function send(ws, obj) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }
wss.on('connection', (ws, req, u) => {
  const id = (u.searchParams.get('id') || '').trim();
  if (!id || id.length > 120) { send(ws, { type: 'ERROR', message: 'Missing/invalid id' }); ws.close(1008, 'Invalid id'); return; }
  const prior = clients.get(id);
  // Same ID reconnects are expected for the host after a mobile socket drop.
  if (prior && prior.readyState === WebSocket.OPEN) {
    send(prior, { type: 'REPLACED' });
    try { prior.close(4001, 'Reconnected from another socket'); } catch {}
  }
  clients.set(id, ws);
  ws._hideId = id;
  send(ws, { type: 'OPEN', id });
  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    if (!m || typeof m.type !== 'string') return;
    if (m.type === 'HEARTBEAT') { send(ws, { type: 'HEARTBEAT' }); return; }
    const dst = typeof m.dst === 'string' ? m.dst : '';
    if (!dst) return;
    const target = clients.get(dst);
    if (!target || target.readyState !== WebSocket.OPEN) {
      // The client already knows how to handle EXPIRE as a missing room.
      send(ws, { type: 'EXPIRE', dst: id, payload: m.payload || {} });
      return;
    }
    // Preserve CHOMU HIDE's custom OFFER/ANSWER/CANDIDATE payload shape.
    const packet = { ...m, src: id };
    delete packet.token;
    send(target, packet);
  });
  ws.on('close', () => { if (clients.get(id) === ws) clients.delete(id); });
  ws.on('error', () => { if (clients.get(id) === ws) clients.delete(id); });
});
const cleanup = setInterval(() => {
  for (const [id, ws] of clients) if (ws.readyState >= WebSocket.CLOSING) clients.delete(id);
}, 30000);
cleanup.unref();
server.listen(PORT, '0.0.0.0', () => console.log(`CHOMU HIDE signaling listening on ${PORT}`));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { clearInterval(cleanup); for (const ws of clients.values()) { try { ws.close(1001, 'Server shutting down'); } catch {} } server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 5000).unref(); });
