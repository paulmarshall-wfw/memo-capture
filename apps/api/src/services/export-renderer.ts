import { Buffer } from "node:buffer";
import { MEMO_CAPTURE_EXPORT_SCHEMA_VERSION } from "@memo-capture/domain";
import type { ExportBatchRecord, ExportSnapshotForGeneration } from "../repositories/exports.js";
import type { AppUserRecord } from "../repositories/rows.js";

export interface RenderedExportArtifacts {
  manifestJson: string;
  itemsJsonl: string;
  combinedMarkdown: string;
  itemMarkdownFiles: {
    acceptedSnapshotId: string;
    relativePath: string;
    body: string;
  }[];
  bundleZip: Buffer;
}

export function renderExportArtifacts(input: {
  batch: ExportBatchRecord;
  snapshots: ExportSnapshotForGeneration[];
  createdBy: AppUserRecord | null;
}): RenderedExportArtifacts {
  const itemMarkdownFiles = input.snapshots.map((snapshot) => {
    const relativePath = `markdown/${snapshot.project.slug}/${snapshot.workItemId}-${slugify(snapshot.title)}.md`;
    return {
      acceptedSnapshotId: snapshot.acceptedSnapshotId,
      relativePath,
      body: renderMarkdownItem(input.batch.id, snapshot)
    };
  });
  const itemsJsonl = input.snapshots.map((snapshot) => JSON.stringify(toJsonlItem(input.batch.id, snapshot))).join("\n");
  const manifest = {
    schemaVersion: MEMO_CAPTURE_EXPORT_SCHEMA_VERSION,
    exportBatchId: input.batch.id,
    createdAt: input.batch.createdAt,
    createdBy:
      input.createdBy === null
        ? null
        : {
            userId: input.createdBy.id,
            email: input.createdBy.email,
            displayName: input.createdBy.displayName
          },
    itemCount: input.snapshots.length,
    filterContext: input.batch.filterContext,
    artifacts: {
      itemsJsonl: "items.jsonl",
      combinedMarkdown: "combined.md",
      markdownDirectory: "markdown/"
    }
  };
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
  const combinedMarkdown = itemMarkdownFiles
    .map((file) => `<!-- ${file.relativePath} -->\n\n${file.body}`)
    .join("\n\n---\n\n");
  const bundleFiles = [
    { path: "manifest.json", body: manifestJson },
    { path: "items.jsonl", body: itemsJsonl === "" ? "" : `${itemsJsonl}\n` },
    { path: "combined.md", body: `${combinedMarkdown}\n` },
    ...itemMarkdownFiles.map((file) => ({ path: file.relativePath, body: file.body }))
  ];

  return {
    manifestJson,
    itemsJsonl: itemsJsonl === "" ? "" : `${itemsJsonl}\n`,
    combinedMarkdown: `${combinedMarkdown}\n`,
    itemMarkdownFiles,
    bundleZip: createStoreZip(bundleFiles)
  };
}

function toJsonlItem(exportBatchId: string, snapshot: ExportSnapshotForGeneration): Record<string, unknown> {
  return {
    schemaVersion: MEMO_CAPTURE_EXPORT_SCHEMA_VERSION,
    exportBatchId,
    acceptedSnapshotId: snapshot.acceptedSnapshotId,
    workItemId: snapshot.workItemId,
    sourceMemoId: snapshot.sourceMemoId,
    title: snapshot.title,
    body: snapshot.body,
    project: snapshot.project,
    contributor: snapshot.contributor,
    tags: snapshot.tags,
    source: snapshot.source,
    snapshotCreatedAt: snapshot.snapshotCreatedAt
  };
}

function renderMarkdownItem(exportBatchId: string, snapshot: ExportSnapshotForGeneration): string {
  const frontmatter = [
    "---",
    `schema_version: ${MEMO_CAPTURE_EXPORT_SCHEMA_VERSION}`,
    `export_batch_id: ${exportBatchId}`,
    `accepted_snapshot_id: ${snapshot.acceptedSnapshotId}`,
    `work_item_id: ${snapshot.workItemId}`,
    `source_memo_id: ${snapshot.sourceMemoId}`,
    `project_slug: ${snapshot.project.slug}`,
    `project_name: ${yamlString(snapshot.project.name)}`,
    `contributor: ${snapshot.contributor === null ? "null" : yamlString(snapshot.contributor.text)}`,
    "tags:",
    ...(snapshot.tags.length === 0 ? ["  []"] : snapshot.tags.map((tag) => `  - ${yamlString(tag)}`)),
    `snapshot_created_at: ${yamlString(snapshot.snapshotCreatedAt)}`,
    "---"
  ].join("\n");

  return `${frontmatter}\n\n# ${snapshot.title}\n\n${snapshot.body.trim()}\n`;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug === "" ? "untitled" : slug;
}

function createStoreZip(files: { path: string; body: string | Buffer }[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.path, "utf8");
    const body = Buffer.isBuffer(file.body) ? file.body : Buffer.from(file.body, "utf8");
    const crc = crc32(body);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(body.byteLength, 18);
    localHeader.writeUInt32LE(body.byteLength, 22);
    localHeader.writeUInt16LE(name.byteLength, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, body);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(body.byteLength, 20);
    centralHeader.writeUInt32LE(body.byteLength, 24);
    centralHeader.writeUInt16LE(name.byteLength, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);

    offset += localHeader.byteLength + name.byteLength + body.byteLength;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.byteLength, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff]!;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = Array.from({ length: 256 }, (_unused, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});
