import type { FastifyReply, FastifyRequest } from 'fastify';
import { extensionFor } from './imageProcessing.js';

/**
 * The 422 body schema of the image-upload routes. A missing file sends `{ error }` while a rejected one goes
 * through `replyForOutcome` and sends `{ error, details }`, so neither `errorResponseSchema` (it would strip
 * `details`) nor `validationErrorResponseSchema` (it requires `details`) fits: `details` stays optional.
 */
export const uploadErrorResponseSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: { type: 'string' },
    details: { type: 'array', items: { type: 'string' } },
  },
};

export interface UploadedFile {
  buffer: Buffer;
  mimeType: string;
  originalExt: string;
}

/** The multipart request's file, read fully into memory; `undefined` when the request carried none. */
export async function readUploadedFile(request: FastifyRequest): Promise<UploadedFile | undefined> {
  const file = await request.file();
  if (!file) return undefined;
  return { buffer: await file.toBuffer(), mimeType: file.mimetype, originalExt: extensionFor(file.mimetype) };
}

export function sendNoFileUploaded(reply: FastifyReply): FastifyReply {
  return reply.code(422).send({ error: 'no file uploaded' });
}
