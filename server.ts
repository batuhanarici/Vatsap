import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // API Proxy for OpenWA local services (Hardened against SSRF)
  app.all('/api/openwa-proxy', async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) {
      return res.status(400).json({ error: 'url parametresi zorunludur.' });
    }

    // SSRF Allowlist: Only allow local loopback hosts (127.0.0.1, localhost) or OpenWA docker hosts
    try {
      const parsed = new URL(targetUrl);
      const isAllowedHost =
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname === 'localhost' ||
        parsed.hostname === 'host.docker.internal';

      if (!isAllowedHost) {
        return res.status(403).json({
          error: 'Erişim engellendi: Yalnızca yerel OpenWA sunucularına (127.0.0.1, localhost) izin verilir.',
        });
      }
    } catch {
      return res.status(400).json({ error: 'Geçersiz hedef URL formatı.' });
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      const apiKey = (req.headers['x-api-key'] || req.headers['api-key']) as string | undefined;
      if (apiKey) {
        headers['X-API-Key'] = apiKey;
        headers['api-key'] = apiKey;
      }

      const fetchOptions: RequestInit = {
        method: req.method,
        headers,
      };

      if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body && Object.keys(req.body).length > 0) {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const response = await fetch(targetUrl, fetchOptions);
      const data = await response.json().catch(() => null);

      res.status(response.status).json(data || { status: response.statusText });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Bağlantı hatası';
      res.status(502).json({
        error: 'OpenWA servisine ulaşılamadı.',
        details: errMsg,
      });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on port ${port}`);
  });
}

startServer();
