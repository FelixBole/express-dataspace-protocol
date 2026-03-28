import { Request, Response, NextFunction } from 'express';
import { DSP_CONTEXT } from '../types/common';

export interface DspError extends Error {
  statusCode?: number;
}

export function errorHandler(
  err: DspError,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const statusCode = err.statusCode ?? 500;
  res.status(statusCode).json({
    '@context': [DSP_CONTEXT],
    '@type': 'Error',
    code: String(statusCode),
    reason: [err.message ?? 'Internal Server Error'],
  });
}
