import express from 'express';
import request from 'supertest';
import { makeVersionRouter } from '../../src/provider/routes/version.routes';
import { VersionEntry } from '../../src/types/common';

function makeApp(versionEntry: VersionEntry) {
  const app = express();
  app.use(makeVersionRouter({ versionEntry }));
  return app;
}

describe('Provider — /.well-known/dspace-version', () => {
  const versionEntry: VersionEntry = {
    version: '2025-1',
    path: '/dsp',
    binding: 'HTTPS',
  };
  const app = makeApp(versionEntry);

  it('returns 200 with protocol version info', async () => {
    const res = await request(app).get('/.well-known/dspace-version');

    expect(res.status).toBe(200);
    expect(res.body['@context']).toBeDefined();
    expect(res.body['@type']).toBe('VersionResponse');
  });

  it('includes a protocolVersions array with at least one entry', async () => {
    const res = await request(app).get('/.well-known/dspace-version');

    expect(Array.isArray(res.body.protocolVersions)).toBe(true);
    expect(res.body.protocolVersions.length).toBeGreaterThan(0);
  });

  it('includes the configured version and path', async () => {
    const res = await request(app).get('/.well-known/dspace-version');
    const versions: VersionEntry[] = res.body.protocolVersions;

    const entry = versions.find((v) => v.version === '2025-1');
    expect(entry).toBeDefined();
    expect(entry?.path).toBe('/dsp');
  });
});
