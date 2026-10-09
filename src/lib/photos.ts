export const MAX_PHOTOS = 8;
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
export type PhotoMeta = {
  id: string;
  findingId: string;
  mimeType: "image/jpeg";
  timestamp: number;
  originalSize: number;
  width: number;
  height: number;
  primary: boolean;
  localOnly: true;
};
export type Photo = PhotoMeta & { blob: Blob; thumbnail: Blob };
export type PhotoEdit = PhotoMeta & { blob?: Blob; thumbnail?: Blob };
export type PhotoChange =
  { findingId: string; photos: PhotoEdit[] } | { replaceAll: Photo[] };
function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) =>
        b
          ? resolve(b)
          : reject(
              new Error("Foto non elaborata. Prova un’immagine JPEG o PNG."),
            ),
      "image/jpeg",
      quality,
    ),
  );
}
export async function compressPhoto(
  file: File,
  findingId: string,
): Promise<Photo> {
  if (
    !file.type.startsWith("image/") ||
    file.size > MAX_INPUT_BYTES ||
    !file.size
  )
    throw new Error("Foto non valida o troppo grande (massimo 25 MB).");
  const url = URL.createObjectURL(file);
  const img = new Image();
  try {
    img.src = url;
    await img.decode();
    const scale = Math.min(
      1,
      1920 / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const width = Math.max(1, Math.round(img.naturalWidth * scale)),
      height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    let blob = await encode(canvas, 0.86);
    if (blob.size > MAX_PHOTO_BYTES) blob = await encode(canvas, 0.75);
    if (blob.size > MAX_PHOTO_BYTES)
      throw new Error("Foto non valida o troppo grande (massimo 25 MB).");
    const thumb = document.createElement("canvas");
    const ratio = Math.min(1, 320 / Math.max(width, height));
    thumb.width = Math.round(width * ratio);
    thumb.height = Math.round(height * ratio);
    thumb.getContext("2d")!.drawImage(canvas, 0, 0, thumb.width, thumb.height);
    const thumbnail = await encode(thumb, 0.78);
    canvas.width = 0;
    thumb.width = 0;
    return {
      id: crypto.randomUUID(),
      findingId,
      blob,
      thumbnail,
      mimeType: "image/jpeg",
      timestamp: Date.now(),
      originalSize: file.size,
      width,
      height,
      primary: false,
      localOnly: true,
    };
  } catch {
    throw new Error("Foto non elaborata. Prova un’immagine JPEG o PNG.");
  } finally {
    URL.revokeObjectURL(url);
    img.src = "";
  }
}
