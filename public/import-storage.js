// Shared by the classic service worker and the app bundle. Only temporary imports live here.
(() => {
  const DOCX =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const PDF = "application/pdf";
  function classifyFile(file) {
    if (!file?.name) throw new Error("Vælg et rejsebilag.");
    const name = file.name.toLowerCase(),
      mime = (file.type ?? "").toLowerCase().split(";")[0].trim();
    const kind = name.endsWith(".docx")
      ? "assistance"
      : name.endsWith(".pdf")
        ? "ticket"
        : null;
    if (!kind) throw new Error("Vælg en DOCX-rejseplan eller en PDF-billet.");
    const generic = [
      "",
      "application/octet-stream",
      "binary/octet-stream",
      "application/unknown",
    ];
    const allowed =
      kind === "assistance"
        ? [DOCX, "application/zip", "application/x-zip-compressed"]
        : [
            PDF,
            "application/x-pdf",
            "application/acrobat",
            "application/vnd.pdf",
            "text/pdf",
          ];
    if (!generic.includes(mime) && !allowed.includes(mime))
      throw new Error("Filendelse og filtype stemmer ikke overens.");
    return kind;
  }
  function createStore(indexedDB = globalThis.indexedDB) {
    async function operation(mode, action) {
      if (!indexedDB) throw new Error("Lokal lagring er ikke tilgængelig.");
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("rejseflex-imports", 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore("pending", { keyPath: "id" });
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      try {
        return await new Promise((resolve, reject) => {
          const tx = db.transaction("pending", mode);
          let value;
          tx.oncomplete = () => resolve(value);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
          try {
            const request = action(tx.objectStore("pending"));
            request.onsuccess = () => {
              value = request.result;
            };
          } catch (error) {
            tx.abort();
            reject(error);
          }
        });
      } finally {
        db.close();
      }
    }
    const store = {
      get: (id) => operation("readonly", (s) => s.get(id)),
      put: (record) => operation("readwrite", (s) => s.put(record)),
      remove: (id) => operation("readwrite", (s) => s.delete(id)),
      async stage(file) {
        const kind = classifyFile(file);
        if (
          !Number.isFinite(file.size) ||
          file.size < 1 ||
          file.size > 20 * 1024 * 1024
        )
          throw new Error("Bilaget skal være mellem 1 byte og 20 MB.");
        let bytes;
        try {
          bytes = await file.arrayBuffer();
        } catch {
          throw new Error("Filen kunne ikke læses. Vælg den igen.");
        }
        if (bytes.byteLength !== file.size)
          throw new Error("Filen kunne ikke læses helt.");
        const record = {
          id: globalThis.crypto.randomUUID(),
          name: file.name,
          kind,
          mime: kind === "assistance" ? DOCX : PDF,
          bytes,
          createdAt: Date.now(),
          step: "choose",
        };
        await store.put(record);
        return record;
      },
    };
    return store;
  }
  async function receiveShare(request, scope, store = createStore()) {
    const redirect = (error) =>
      Response.redirect(`${scope}#import-error=${error}`, 303);
    let files;
    try {
      files = (await request.formData()).getAll("documents");
    } catch {
      return redirect("invalid");
    }
    if (!files.length) return redirect("missing");
    if (files.length !== 1) return redirect("multiple");
    const file = files[0];
    try {
      classifyFile(file);
    } catch {
      return redirect("type");
    }
    if (!file.size || file.size > 20 * 1024 * 1024) return redirect("size");
    try {
      const record = await store.stage(file);
      return Response.redirect(
        `${scope}#import=${encodeURIComponent(record.id)}`,
        303,
      );
    } catch {
      return redirect("storage");
    }
  }
  globalThis.RejseFlexImports = {
    classifyFile,
    createStore,
    receiveShare,
    DOCX,
    PDF,
  };
})();
