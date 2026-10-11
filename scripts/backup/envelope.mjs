// Official age format. Local-only streams; no custom cryptographic primitives.
import { Buffer } from 'node:buffer';
import { createHash, randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { open, link, unlink, lstat, realpath, chmod } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
const magic = Buffer.from('CVPGAGE1');
const metadataSchema = z.object({ schema: z.literal(2), scope: z.literal('public,closevault_private'), sourceVersion: z.string().regex(/^17\./), dumpVersion: z.string().regex(/17\./), nodeVersion: z.string(), ageVersion: z.string(), createdAt: z.iso.datetime(), migrations: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)), sourceProject: z.string().optional(), sourceKind: z.enum(['isolated-fixture','hosted-owner-operated']).optional(), recipientFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(), sourceSchemaFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(), migrationVersions: z.array(z.string().regex(/^\d{14}$/)).optional() }).strict();
const discard = () => new Writable({ write(_chunk, _encoding, callback) { callback(); } });
export function ageVersion() {
  const p = spawnSync('age', ['--version'], { encoding: 'utf8', timeout: 10_000 });
  if (p.error || p.status !== 0) throw new Error('Official age CLI unavailable; no fallback.');
  return p.stdout.trim();
}
export async function privateDestination(file, repository) {
  const parent = await realpath(dirname(resolve(file))), root = await realpath(repository);
  const rel = relative(root, parent), stat = await lstat(dirname(resolve(file)));
  if (!(rel === '..' || rel.startsWith('../') || isAbsolute(rel))) throw new Error('Artifact must be outside repository.');
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw new Error('Artifact directory must be private and not a symlink.');
  return resolve(parent, file.split('/').at(-1));
}
export async function generateIdentity(file, repository) {
  const target = await privateDestination(file, repository);
  const p = spawnSync('age-keygen', ['--output', target], { stdio: ['ignore', 'ignore', 'ignore'], timeout: 10_000 });
  if (p.error || p.status !== 0) throw new Error('Disposable age identity generation failed.');
  await chmod(target, 0o600);
  const recipient = spawnSync('age-keygen', ['-y', target], { encoding: 'utf8', timeout: 10_000 });
  if (recipient.error || recipient.status !== 0) throw new Error('Age recipient derivation failed.');
  return recipient.stdout.trim();
}
export function processStream(command, args, input, { env = process.env } = {}) {
  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'ignore'], timeout: 120_000, env });
  const done = new Promise((resolveDone, reject) => {
    child.on('error', () => reject(new Error('Backup subprocess failed; diagnostics withheld.')));
    child.on('close', code => code === 0 ? resolveDone() : reject(new Error('Backup subprocess failed; diagnostics withheld.')));
  });
  done.catch(() => undefined);
  child.stdin.on('error', () => undefined);
  if (input !== undefined) child.stdin.end(input);
  return { readable: child.stdout, writable: child.stdin, done, kill: () => child.kill() };
}
function archiveHash() {
  const hash = createHash('sha256'); let first = Buffer.alloc(0), bytes = 0;
  const stream = new Transform({ transform(chunk, _encoding, callback) {
    if (first.length < 5) { first = Buffer.concat([first, chunk.subarray(0, 5 - first.length)]); if (first.length === 5 && first.toString() !== 'PGDMP') return callback(new Error('Invalid archive.')); }
    hash.update(chunk); bytes += chunk.length; callback(null, chunk);
  }, flush(callback) { callback(bytes < 5 ? new Error('Truncated archive.') : undefined); } });
  return { stream, result: () => ({ dumpSha256: hash.digest('hex'), dumpBytes: bytes }) };
}
export async function encryptBackup({ file, repository, recipient, metadata, source }) {
  let handle, age, partial;
  const archive = archiveHash(), ciphertext = createHash('sha256'); let bytes = 0;
  try {
    const target = await privateDestination(file, repository); partial = `${target}.${randomBytes(8).toString('hex')}.partial`;
    if (!/^age1[0-9a-z]+$/.test(recipient)) throw new Error('Invalid age recipient.');
    const meta = metadataSchema.parse(metadata), json = Buffer.from(JSON.stringify(meta));
    if (json.length > 65536) throw new Error('Oversized metadata.');
    const length = Buffer.alloc(4); length.writeUInt32BE(json.length);
    handle = await open(partial, 'wx', 0o600);
    age = processStream('age', ['--encrypt', '--recipient', recipient]);
    const sourcePipeline = pipeline(source.readable, archive.stream);
    const input = Readable.from((async function* () { yield magic; yield length; yield json; for await (const chunk of archive.stream) yield chunk; })());
    const output = new Transform({ transform(chunk, _encoding, callback) { ciphertext.update(chunk); bytes += chunk.length; callback(null, chunk); } });
    const sink = new Writable({ write(chunk, _encoding, callback) { handle.writeFile(chunk).then(() => callback(), callback); } });
    await Promise.all([sourcePipeline, pipeline(input, age.writable), pipeline(age.readable, output, sink), source.done, age.done]);
    await handle.sync(); await handle.close(); handle = undefined;
    await link(partial, target);
    const directory = await open(dirname(target), 'r'); try { await directory.sync(); } finally { await directory.close(); }
    return { format: 'age-encryption.org/v1', encryptedSha256: ciphertext.digest('hex'), bytes, ...archive.result(), metadata: meta, status: 'encrypted-not-restore-verified' };
  } catch { source.kill?.(); source.readable.destroy(); archive.stream.destroy(); age?.kill(); throw new Error('Encrypted backup failed; no completed artifact published.'); }
  finally { await handle?.close(); if (partial) await unlink(partial).catch(() => undefined); }
}
function decodeArchive(expected) {
  let pending = Buffer.alloc(0), metadata, archive; const hash = createHash('sha256'); let bytes = 0, first = Buffer.alloc(0);
  return new Transform({ transform(chunk, _encoding, callback) {
    try {
      if (!metadata) {
        pending = Buffer.concat([pending, chunk]);
        if (pending.length < 12) return callback();
        if (!pending.subarray(0, 8).equals(magic)) throw new Error('Unknown archive framing.');
        const n = pending.readUInt32BE(8); if (n > 65536) throw new Error('Oversized metadata.');
        if (pending.length < 12 + n) return callback();
        metadata = metadataSchema.parse(JSON.parse(pending.subarray(12, 12 + n).toString()));
        if (JSON.stringify(metadata) !== JSON.stringify(metadataSchema.parse(expected.metadata))) throw new Error('Incompatible metadata.');
        archive = pending.subarray(12 + n); pending = Buffer.alloc(0);
      } else archive = chunk;
      if (first.length < 5) { first = Buffer.concat([first, archive.subarray(0, 5 - first.length)]); if (first.length === 5 && first.toString() !== 'PGDMP') throw new Error('Invalid archive.'); }
      hash.update(archive); bytes += archive.length; callback(null, archive);
    } catch { callback(new Error('Backup framing or compatibility check failed.')); }
  }, flush(callback) {
    callback(!metadata || bytes < 5 || bytes !== expected.dumpBytes || hash.digest('hex') !== expected.dumpSha256 ? new Error('Incomplete archive or integrity failure.') : undefined);
  } });
}
export async function decryptBackup({ file, identity, expected, destination = { writable: discard(), done: Promise.resolve() } }) {
  const age = processStream('age', ['--decrypt', '--identity', identity]);
  const hash = createHash('sha256'); let bytes = 0;
  const ciphertext = new Transform({ transform(chunk, _encoding, callback) { hash.update(chunk); bytes += chunk.length; callback(null, chunk); } });
  try {
    await Promise.all([pipeline(createReadStream(file), ciphertext, age.writable), pipeline(age.readable, decodeArchive(expected), destination.writable), age.done, destination.done]);
    if (bytes !== expected.bytes || hash.digest('hex') !== expected.encryptedSha256) throw new Error('Ciphertext mismatch.');
  } catch { age.kill(); destination.kill?.(); throw new Error('Age decryption/integrity failed; destination must be discarded if used.'); }
}
