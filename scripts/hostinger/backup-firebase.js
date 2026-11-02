"use strict";

// Executado dentro do container functions. Gera uma cópia consistente de leitura
// do RTDB e dos objetos do Storage; nunca grava no Firebase e nunca restaura.
const fs = require("node:fs");
const fsp = fs.promises;
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const { pipeline } = require("node:stream/promises");
const { getApps, initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { getStorage } = require("firebase-admin/storage");

function safeTarget(root, name) {
  const hash = crypto.createHash("sha256").update(name).digest("hex");
  return path.join(root, "storage-objects", hash.slice(0, 2), hash);
}

async function main() {
  const output = path.resolve(process.argv[2] || "");
  if (!process.argv[2] || !output.startsWith(path.resolve("/backups") + path.sep)) {
    throw new Error("Informe um destino dentro de /backups.");
  }
  const incomplete = output + ".incomplete";
  if (fs.existsSync(output) || fs.existsSync(incomplete)) throw new Error("O destino do backup já existe.");
  await fsp.mkdir(incomplete, { recursive: true, mode: 0o700 });

  if (!getApps().length) initializeApp();
  const startedAt = new Date().toISOString();
  const dbFile = path.join(incomplete, "rtdb.json.gz");
  const snapshot = await getDatabase().ref("/").once("value");
  const json = JSON.stringify(snapshot.val() || {});
  await pipeline(
    require("node:stream").Readable.from([json]),
    zlib.createGzip({ level: 9 }),
    fs.createWriteStream(dbFile, { mode: 0o600 })
  );

  const bucket = getStorage().bucket(process.env.FIREBASE_STORAGE_BUCKET);
  const objects = [];
  let query = { autoPaginate: false, maxResults: 100 };
  do {
    const [files, nextQuery] = await bucket.getFiles(query);
    for (const file of files) {
      const target = safeTarget(incomplete, file.name);
      await fsp.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await file.download({ destination: target, validation: "crc32c" });
      const [metadata] = await file.getMetadata();
      objects.push({
        name: file.name,
        object: path.relative(incomplete, target).replaceAll(path.sep, "/"),
        generation: metadata.generation || null,
        size: Number(metadata.size || 0),
        md5Hash: metadata.md5Hash || null,
        contentType: metadata.contentType || null,
      });
    }
    query = nextQuery || null;
  } while (query);

  const manifest = {
    format: 1,
    project: process.env.GCLOUD_PROJECT || null,
    databaseUrl: process.env.FIREBASE_DATABASE_URL || null,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || null,
    startedAt,
    completedAt: new Date().toISOString(),
    rtdb: { file: "rtdb.json.gz", uncompressedBytes: Buffer.byteLength(json) },
    storage: { count: objects.length, objects },
  };
  await fsp.writeFile(path.join(incomplete, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  await fsp.rename(incomplete, output);
  console.log(JSON.stringify({ ok: true, output, rtdbBytes: manifest.rtdb.uncompressedBytes, storageObjects: objects.length }));
}

main().catch(async (error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});

