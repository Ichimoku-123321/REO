import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

function debugSnapshotPlugin(): Plugin {
  return {
    name: 'debug-snapshot-middleware',
    configureServer(server) {
      server.middlewares.use('/__debug_snapshot', (req, res) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk.toString();
          });
          req.on('end', () => {
            try {
              const snapshotData = JSON.parse(body);
              const logDir = path.resolve(process.cwd(), '.debug_logs');
              if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
              }

              const timestamp = snapshotData.timestamp || Date.now();
              const action = (snapshotData.action || 'SNAPSHOT').replace(/[^a-zA-Z0-9_-]/g, '_');
              const filename = `snap_${timestamp}_${action}.json`;
              const filePath = path.join(logDir, filename);
              const latestPath = path.join(logDir, 'latest_snapshot.json');

              const jsonString = JSON.stringify(snapshotData, null, 2);
              fs.writeFileSync(filePath, jsonString, 'utf-8');
              fs.writeFileSync(latestPath, jsonString, 'utf-8');

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ status: 'ok', file: filename }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        } else {
          res.statusCode = 405;
          res.end('Method Not Allowed');
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), debugSnapshotPlugin()],
  server: {
    port: 3000,
    host: true,
  },
});
