import { z } from "zod";
import { recoverData, type AppData } from "./model";
import { readPhotoArchive } from "./storage";
import { type Photo, MAX_PHOTO_BYTES, MAX_PHOTOS } from "./photos";
export const MAX_BACKUP_BYTES = 100 * 1024 * 1024;
const metaSchema = z.object({
  id: z.string().min(1).max(100),
  findingId: z.string().min(1).max(100),
  mimeType: z.literal("image/jpeg"),
  timestamp: z.number().int().nonnegative(),
  originalSize: z.number().nonnegative(),
  width: z.number().int().min(1).max(1920),
  height: z.number().int().min(1).max(1920),
  primary: z.boolean(),
  localOnly: z.literal(true),
  base64: z.string().max((4 * MAX_PHOTO_BYTES) / 3 + 4),
  thumbnailBase64: z.string().max(270000),
});
const schema = z.object({
  version: z.literal(2),
  data: z.unknown(),
  photos: z.array(metaSchema).max(10000),
});
async function base64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}
function decode(value: string, max: number) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0)
    throw new Error("Invalid photo encoding");
  const binary = atob(value);
  if (!binary.length || binary.length > max)
    throw new Error("Invalid photo size");
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255)
    throw new Error("Invalid JPEG");
  return new Blob([bytes], { type: "image/jpeg" });
}
export async function exportBackup(data: AppData): Promise<string> {
  const photos = [];
  let size = new Blob([JSON.stringify(data)]).size;
  for (const photo of await readPhotoArchive(data)) {
    const { blob, thumbnail: thumb, ...meta } = photo;
    size += ((blob.size + thumb.size) * 4) / 3 + 1000;
    if (size > MAX_BACKUP_BYTES) throw new Error("Il backup supera 100 MB.");
    photos.push({
      ...meta,
      base64: await base64(blob),
      thumbnailBase64: await base64(thumb),
    });
  }
  const result = JSON.stringify({ version: 2, data, photos });
  if (new Blob([result]).size > MAX_BACKUP_BYTES)
    throw new Error("Il backup supera 100 MB.");
  return result;
}
export function parseBackup(text: string): { data: AppData; photos: Photo[] } {
  if (new Blob([text]).size > MAX_BACKUP_BYTES)
    throw new Error("Il backup supera 100 MB.");
  const raw = JSON.parse(text);
  if (raw.version === 1) return { data: recoverData(raw), photos: [] };
  const parsed = schema.parse(raw),
    data = recoverData(parsed.data);
  const ids = new Set<string>();
  const groups = new Map<string, number[]>();
  const photos = parsed.photos.map((p) => {
    if (ids.has(p.id) || !data.finds.some((f) => f.id === p.findingId))
      throw new Error("Invalid photo relation");
    ids.add(p.id);
    const counts = groups.get(p.findingId) ?? [0, 0];
    counts[0]++;
    counts[1] += Number(p.primary);
    groups.set(p.findingId, counts);
    const { base64, thumbnailBase64, ...meta } = p;
    return {
      ...meta,
      blob: decode(base64, MAX_PHOTO_BYTES),
      thumbnail: decode(thumbnailBase64, 200000),
    };
  });
  for (const [count, primary] of groups.values())
    if (count > MAX_PHOTOS || primary !== 1)
      throw new Error("Invalid primary photo");
  return { data, photos };
}
