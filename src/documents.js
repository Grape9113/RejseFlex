const types = {
  assistance: {
    extension: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  ticket: { extension: "pdf", mime: "application/pdf" },
};
export async function prepareDocument(file, kind, journeyId) {
  const type = types[kind];
  if (!type || !file.name.toLowerCase().endsWith(`.${type.extension}`))
    throw new Error(
      `Vælg en ${type?.extension.toUpperCase() ?? "understøttet"}-fil.`,
    );
  if (!file.size || file.size > 20 * 1024 * 1024)
    throw new Error("Dokumentet skal være mellem 1 byte og 20 MB.");
  const bytes = await file.arrayBuffer();
  if (kind === "ticket") {
    if (!new TextDecoder().decode(bytes.slice(0, 1024)).includes("%PDF-"))
      throw new Error("Filen er ikke en gyldig PDF.");
  } else {
    try {
      const { default: JSZip } = await import("jszip");
      const zip = await JSZip.loadAsync(bytes);
      if (!zip.file("word/document.xml")) throw new Error("missing");
      const expandedSize = Object.values(zip.files).reduce(
        (size, entry) => size + (entry._data?.uncompressedSize ?? 0),
        0,
      );
      if (expandedSize > 60 * 1024 * 1024) throw new Error("large");
      const xml = await zip.file("word/document.xml").async("string");
      if (!xml.includes("document")) throw new Error("invalid");
    } catch {
      throw new Error(
        "DOCX-filen kan ikke læses. Vælg et gyldigt Word-dokument under 60 MB udpakket.",
      );
    }
  }
  return {
    id: crypto.randomUUID(),
    journeyId,
    kind,
    name: file.name,
    mime: type.mime,
    bytes,
    updatedAt: new Date().toISOString(),
  };
}
export function withDocumentReference(plan, kind, document) {
  const updated = {
    ...plan,
    documentReferences: (plan.documentReferences ?? []).filter(
      (reference) => reference.kind !== kind,
    ),
  };
  if (document)
    updated.documentReferences.push({
      id: document.id,
      kind,
      name: document.name,
    });
  return updated;
}
export async function openDocument(document, stored) {
  if (!stored?.bytes)
    throw new Error("Dokumentet findes ikke på denne enhed. Upload det igen.");
  const dialog = document.createElement("dialog");
  dialog.className = "document-dialog";
  dialog.setAttribute("aria-label", stored.name);
  const toolbar = document.createElement("div");
  toolbar.className = "document-toolbar";
  const title = document.createElement("strong");
  title.textContent = stored.name;
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Luk ×";
  close.className = "secondary-button";
  const content = document.createElement("div");
  content.className = "document-content";
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.textContent = "Åbner dokument…";
  toolbar.append(title, close);
  content.append(status);
  dialog.append(toolbar, content);
  document.body.append(dialog);
  const previousFocus = document.activeElement;
  let disposed = false,
    loadingTask;
  let dismiss;
  const closed = new Promise((resolve) => {
    dismiss = resolve;
  });
  const cleanup = () => {
    disposed = true;
    dismiss();
    loadingTask?.destroy().catch(() => {});
    dialog.remove();
    previousFocus?.focus();
  };
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", cleanup, { once: true });
  dialog.showModal();
  try {
    if (stored.kind === "ticket") {
      const pdfjs = await import("pdfjs-dist");
      const { default: workerUrl } = await import(
        "pdfjs-dist/build/pdf.worker.min.mjs?url"
      );
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      if (disposed) return;
      loadingTask = pdfjs.getDocument({
        data: new Uint8Array(stored.bytes.slice(0)),
        isEvalSupported: false,
        useSystemFonts: true,
      });
      const pdf = await loadingTask.promise;
      if (disposed) return;
      let zoom = 1;
      const tools = document.createElement("div");
      tools.className = "pdf-tools";
      const zoomLabel = document.createElement("span");
      zoomLabel.textContent = "100%";
      const zoomButton = (label, text, delta) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "secondary-button";
        button.textContent = text;
        button.setAttribute("aria-label", label);
        button.addEventListener("click", () => {
          zoom = Math.max(1, Math.min(3, zoom + delta));
          zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
          content
            .querySelectorAll(".pdf-page")
            .forEach(
              (page) =>
                (page.style.width = `${(content.clientWidth - 32) * zoom}px`),
            );
        });
        return button;
      };
      tools.append(
        zoomButton("Zoom ud", "−", -0.25),
        zoomLabel,
        zoomButton("Zoom ind", "+", 0.25),
      );
      toolbar.insertBefore(tools, close);
      status.textContent = `${pdf.numPages} ${pdf.numPages === 1 ? "side" : "sider"}`;
      for (let number = 1; number <= pdf.numPages && !disposed; number++) {
        const page = await pdf.getPage(number);
        if (disposed) return;
        const section = document.createElement("section");
        section.className = "pdf-page";
        section.style.width = `${content.clientWidth - 32}px`;
        section.setAttribute("aria-label", `Side ${number}`);
        const canvas = document.createElement("canvas");
        canvas.setAttribute("aria-hidden", "true");
        const viewport = page.getViewport({ scale: 1.5 });
        canvas.style.width = "100%";
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        section.append(canvas);
        content.append(section);
        await page.render({ canvasContext: canvas.getContext("2d"), viewport })
          .promise;
        if (disposed) return;
        // Accessible text accompanies every rendered page (including multi-page files).
        const text = await page.getTextContent();
        const transcript = document.createElement("details");
        const caption = document.createElement("summary");
        caption.textContent = `Tekst på side ${number}`;
        const body = document.createElement("p");
        body.textContent = text.items.map((item) => item.str).join(" ");
        transcript.append(caption, body);
        section.append(transcript);
      }
    } else if (stored.kind === "assistance") {
      const { renderAsync } = await import("docx-preview");
      if (disposed) return;
      const frame = document.createElement("iframe");
      frame.title = "Assistanceplan";
      frame.className = "docx-frame";
      frame.setAttribute("sandbox", "allow-same-origin");
      const ready = new Promise((resolve) =>
        frame.addEventListener("load", resolve, { once: true }),
      );
      // No remote images, fonts, embedded content or scripts from uploaded documents.
      frame.srcdoc =
        '<!doctype html><html lang="da"><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: blob:; font-src data: blob:; style-src \'unsafe-inline\'"><style>body{margin:0;background:#eef1f5;font-family:Arial,sans-serif}.docx-wrapper{padding:16px!important}section.docx{max-width:100%;box-sizing:border-box}a{pointer-events:none}</style></head><body><div id="styles"></div><main id="pages"></main></body></html>';
      content.append(frame);
      await Promise.race([ready, closed]);
      if (disposed) return;
      const inner = frame.contentDocument;
      inner.addEventListener("keydown", (event) => {
        if (event.key === "Escape") dialog.close();
      });
      await renderAsync(
        stored.bytes.slice(0),
        inner.querySelector("#pages"),
        inner.querySelector("#styles"),
        {
          inWrapper: true,
          ignoreWidth: true,
          ignoreHeight: true,
          useBase64URL: true,
          renderAltChunks: false,
          renderComments: false,
          renderChanges: false,
        },
      );
      if (disposed) return;
      const readerStyle = inner.createElement("style");
      readerStyle.textContent =
        ".docx-wrapper{padding:8px!important;background:#eef1f5!important}section.docx{width:100%!important;max-width:850px!important;padding:24px!important;margin:0 auto 16px!important;box-shadow:none!important;min-height:0!important}@media(min-width:700px){section.docx{padding:48px!important}}";
      inner.head.append(readerStyle);
      inner.querySelectorAll("a").forEach((link) => {
        link.removeAttribute("href");
        link.removeAttribute("target");
      });
      status.textContent =
        "Assistanceplan · originalens layout kan variere i browseren";
    } else throw new Error("Formatet understøttes ikke.");
  } catch {
    if (!disposed) {
      content.replaceChildren();
      status.textContent =
        "Dokumentet kunne ikke åbnes. Filen kan være beskadiget eller adgangskodebeskyttet. Du kan hente originalen eller erstatte filen.";
      status.className = "inline-error";
      content.append(status);
    }
  }
}
export function downloadDocument(document, stored) {
  if (!stored?.bytes)
    throw new Error("Dokumentet findes ikke på denne enhed. Upload det igen.");
  const url = URL.createObjectURL(
    new Blob([stored.bytes], { type: stored.mime }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = stored.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
