import { Router } from 'express';
import { VersionResponse, DSP_CONTEXT } from '../../types/common';

export interface VersionRouteOptions {
  versionEntry: import('../../types/common').VersionEntry;
}

export function makeVersionRouter(options: VersionRouteOptions): Router {
  const router = Router();

  const response: VersionResponse = {
    '@context': [DSP_CONTEXT],
    '@type': 'VersionResponse',
    protocolVersions: [options.versionEntry],
  };

  // §4.3 — MUST be unauthenticated and unversioned
  router.get('/.well-known/dspace-version', (_req, res) => {
    res.status(200).json(response);
  });

  return router;
}
