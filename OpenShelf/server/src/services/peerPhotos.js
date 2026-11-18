import path from 'node:path';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { coverExtension } from './adminUploads.js';
export const MAX_PEER_PHOTO_BYTES = 4 * 1024 * 1024;
export const peerPhotoRoot = () => path.resolve(process.env.PEER_PHOTO_ROOT || path.join(process.cwd(), 'peer-photo-uploads'));
export function inspectPeerPhoto(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12 || buffer.length > MAX_PEER_PHOTO_BYTES) return null;
  return coverExtension(buffer);
}
export async function savePeerPhoto(id, buffer) {
  const ext = inspectPeerPhoto(buffer);
  if (!ext) { const error = new Error('Upload a valid JPG, PNG or WebP image under 4 MiB.'); error.status = 400; throw error; }
  const root = peerPhotoRoot();
  await mkdir(root, { recursive: true });
  const destination = path.join(root, `${id}.${ext}`);
  await writeFile(destination, buffer, { mode: 0o600 });
  return ext;
}
export async function readPeerPhoto(id, ext) { return readFile(path.join(peerPhotoRoot(), `${id}.${ext}`)); }
export async function deletePeerPhoto(id, ext) {
  if (['jpg', 'png', 'webp'].includes(ext)) await unlink(path.join(peerPhotoRoot(), `${id}.${ext}`)).catch(error => { if (error.code !== 'ENOENT') throw error; });
}
