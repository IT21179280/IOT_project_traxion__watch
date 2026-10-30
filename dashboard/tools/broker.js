// tools/broker.js
//
// Small local MQTT broker used for development, demos and screenshots.
// The dashboard normally talks to the broker on 192.168.1.3 - you do NOT need
// this file if that broker is already running.
//
// Usage:
//   npm run broker
//   BROKER_PORT=1883 BROKER_HOST=127.0.0.1 npm run broker
//
// Then point the dashboard and the mock publisher at it:
//   $env:MQTT_BROKER_URL = "mqtt://127.0.0.1:1883"
//   npm start

const net = require('net');
const aedes = require('aedes')();

const PORT = Number(process.env.BROKER_PORT || 1883);
const HOST = process.env.BROKER_HOST || '127.0.0.1';

const server = net.createServer(aedes.handle);

aedes.on('client', (client) => {
  console.log(`[broker] client connected: ${client.id}`);
});

aedes.on('clientDisconnect', (client) => {
  console.log(`[broker] client disconnected: ${client.id}`);
});

aedes.on('publish', (packet, client) => {
  // client is null for messages published by the broker itself
  if (client) {
    console.log(`[broker] ${client.id} -> ${packet.topic}`);
  }
});

aedes.on('clientError', (client, err) => {
  console.error(`[broker] client error: ${err.message}`);
});

server.listen(PORT, HOST, () => {
  console.log(`[broker] listening on mqtt://${HOST}:${PORT}`);
});

function shutdown() {
  console.log('\n[broker] shutting down');
  aedes.close(() => server.close(() => process.exit(0)));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
