import type { ErrorCode } from '@stride/contract';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Introuvable.') => new HttpError(404, 'not_found', what);
export const invalid = (msg: string) => new HttpError(400, 'invalid', msg);
export const unauthorized = () => new HttpError(401, 'unauthorized', 'Connecte-toi pour continuer.');
export const conflict = (msg: string) => new HttpError(409, 'conflict', msg);
