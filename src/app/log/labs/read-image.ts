/**
 * Reads the text in lab screenshots on the device with tesseract.js. The library (and its engine
 * and English language files, fetched from its CDN) loads only when this is called, never in the
 * main bundle; the images themselves are never uploaded or stored.
 */
/** One text per screenshot, in order (each is read on its own: see parseLabTexts). */
export async function readImageText(
  files: readonly File[],
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const texts: string[] = [];
    for (const [i, file] of files.entries()) {
      onProgress?.(i, files.length);
      const { data } = await worker.recognize(file);
      texts.push(data.text);
    }
    onProgress?.(files.length, files.length);
    return texts;
  } finally {
    await worker.terminate();
  }
}
