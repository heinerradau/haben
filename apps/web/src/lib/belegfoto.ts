/*
 * Belegfotos vor dem Hochladen: Das Handy liefert Fotos oft als HEIC (iPhone) und in voller Sensorauflösung, mehrere
 * Megabyte je Quittung. Der Browser des Handys kann beides lesen; er wandelt das Foto deshalb selbst in ein JPEG um,
 * das überall anzeigbar und auslesbar ist, und verkleinert es auf eine Größe, bei der eine A4-Seite noch gut lesbar
 * bleibt (rund 170 dpi). PDFs, E-Rechnungen und kleine Bilder gehen unverändert hoch. Kann der Browser ein Bild nicht
 * lesen, geht ebenfalls das Original hoch: lieber ein Beleg ohne Vorschau als keiner.
 */

/** Längere Kante des umgewandelten Fotos in Pixeln: A4 hochkant mit rund 170 dpi, ein Kassenbon bleibt gut lesbar */
export const FOTO_MAX_KANTE = 2000;
/** JPEG-Qualität: Text bleibt scharf, ein fotografierter Bon liegt bei einigen hundert Kilobyte */
export const FOTO_QUALITAET = 0.75;
/** Bis zu dieser Größe bleibt ein Bild, das schon überall lesbar ist, wie es ist */
export const FOTO_UNVERAENDERT_BIS = 800_000;

const HEIC = /\.(heic|heif)$/i;
const BILD = /^image\/(jpeg|png|webp)$/;

export function istHeic(file: { type: string; name: string }): boolean {
  return file.type === "image/heic" || file.type === "image/heif" || HEIC.test(file.name);
}

/** Ob das Foto vor dem Hochladen umgewandelt wird: HEIC immer, andere Bilder nur, wenn sie groß sind */
export function sollUmwandeln(file: { type: string; name: string; size: number }): boolean {
  if (istHeic(file)) return true;
  return BILD.test(file.type) && file.size > FOTO_UNVERAENDERT_BIS;
}

/** Zielgröße: längere Kante höchstens `max`, Seitenverhältnis bleibt, nie vergrößern */
export function fotoZiel(breite: number, hoehe: number, max = FOTO_MAX_KANTE): { breite: number; hoehe: number } {
  const laenger = Math.max(breite, hoehe);
  if (laenger <= max || laenger === 0) return { breite, hoehe };
  const faktor = max / laenger;
  return { breite: Math.max(1, Math.round(breite * faktor)), hoehe: Math.max(1, Math.round(hoehe * faktor)) };
}

/** Dateiname des umgewandelten Fotos: derselbe Name mit der Endung .jpg */
export function fotoName(name: string): string {
  const ohne = name.replace(/\.[A-Za-z0-9]{1,5}$/, "");
  return `${ohne || "beleg"}.jpg`;
}

/**
 * Wandelt ein Belegfoto im Browser in ein JPEG passender Größe um. Gibt das Original zurück, wenn nichts zu tun ist,
 * der Browser das Bild nicht lesen kann oder das Ergebnis größer wäre als ein schon lesbares Original.
 */
export async function belegfoto(file: File): Promise<File> {
  if (!sollUmwandeln(file) || typeof createImageBitmap !== "function") return file;
  let bild: ImageBitmap | null = null;
  try {
    // Die Drehung aus den Bilddaten (EXIF) anwenden, sonst liegt ein Hochformat-Foto quer
    bild = await createImageBitmap(file, { imageOrientation: "from-image" });
    const ziel = fotoZiel(bild.width, bild.height);
    const canvas = document.createElement("canvas");
    canvas.width = ziel.breite;
    canvas.height = ziel.hoehe;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // Durchsichtige Flächen (PNG) würden im JPEG schwarz
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, ziel.breite, ziel.hoehe);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bild, 0, 0, ziel.breite, ziel.hoehe);
    const blob = await new Promise<Blob | null>((fertig) => canvas.toBlob(fertig, "image/jpeg", FOTO_QUALITAET));
    if (!blob || blob.size === 0) return file;
    if (!istHeic(file) && blob.size >= file.size) return file;
    return new File([blob], fotoName(file.name), { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    bild?.close();
  }
}
