import { useEffect, useRef, useState } from "react";
import { readPhotoBlob } from "../lib/storage";
import type { PhotoEdit, PhotoMeta } from "../lib/photos";
import { usePreferences } from "../hooks/usePreferences";
import { Modal } from "./Modal";
export function PhotoImage({
  photo,
  full = false,
}: {
  photo: PhotoEdit;
  full?: boolean;
}) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const { tr } = usePreferences();
  useEffect(() => {
    let alive = true;
    let objectUrl = "";
    let started = false;
    setUrl("");
    setFailed(false);
    const load = async () => {
      if (started) return;
      started = true;
      try {
        const blob =
          (full ? photo.blob : photo.thumbnail) ??
          (await readPhotoBlob(photo.id, !full));
        if (!blob) throw new Error("Missing");
        if (alive) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      } catch {
        if (alive) setFailed(true);
      }
    };
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (entries) => {
              if (entries.some((e) => e.isIntersecting)) {
                void load();
                observer?.disconnect();
              }
            },
            { rootMargin: "150px" },
          );
    if (full || !observer) void load();
    else if (ref.current) observer.observe(ref.current);
    return () => {
      alive = false;
      observer?.disconnect();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo.id, photo.blob, photo.thumbnail, full]);
  return (
    <span ref={ref} className={full ? "photo-full" : "photo-thumb"}>
      {url && !failed ? (
        <img
          src={url}
          alt={tr("Foto del ritrovamento")}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span>{tr(failed ? "Foto non disponibile" : "Caricamento foto…")}</span>
      )}
    </span>
  );
}
export function FindingPhotos({ photos }: { photos: PhotoMeta[] }) {
  const { tr } = usePreferences();
  const [selected, setSelected] = useState<PhotoMeta | null>(null);
  return (
    <>
      <div className="photo-strip">
        {[...photos]
          .sort((a, b) => Number(b.primary) - Number(a.primary))
          .map((p, i) => (
            <button
              key={p.id}
              type="button"
              className="photo-open"
              aria-label={`${tr("Apri foto")} ${i + 1}`}
              onClick={() => setSelected(p)}
            >
              <PhotoImage photo={p} />
              {p.primary && <small>{tr("Principale")}</small>}
            </button>
          ))}
      </div>
      {selected && (
        <Modal
          title={tr("Foto del ritrovamento")}
          onClose={() => setSelected(null)}
        >
          <PhotoImage photo={selected} full />
        </Modal>
      )}
    </>
  );
}
