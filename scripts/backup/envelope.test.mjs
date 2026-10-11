import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, chmod, readFile, readdir, rm, symlink, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { encryptBackup, decryptBackup, generateIdentity, ageVersion, processStream } from './envelope.mjs';
const dump = Buffer.from('PGDMP fictional archive fixture');
const metadata = { schema: 2, scope: 'public,closevault_private', sourceVersion: '17.6', dumpVersion: 'pg_dump 17.6', nodeVersion: process.version, ageVersion: ageVersion(), createdAt: '2026-10-11T00:00:00.000Z', migrations: {} };
const source = bytes => ({ readable: Readable.from([bytes]), done: Promise.resolve() });
async function fixture(run) {
  const dir = await mkdtemp(join(tmpdir(), 'cv-age-test-')); await chmod(dir, 0o700);
  try {
    const identity = join(dir, 'identity.txt'), recipient = await generateIdentity(identity, process.cwd()), file = join(dir, 'fixture.age');
    const encrypt = (options = {}) => encryptBackup({ file, repository: process.cwd(), recipient, metadata, source: source(dump), ...options });
    await run({ dir, identity, recipient, file, encrypt });
  } finally { await rm(dir, { recursive: true }); }
}
test('official age round trip retains framed metadata and exact archive', () => fixture(async ({ identity, file, encrypt }) => {
  const expected = await encrypt(), chunks = [];
  const writable = new Writable({ write(chunk, _encoding, callback) { chunks.push(chunk); callback(); } });
  await decryptBackup({ file, identity, expected, destination: { writable, done: Promise.resolve() } });
  assert.deepEqual(Buffer.concat(chunks), dump); assert.equal(expected.format, 'age-encryption.org/v1');
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.ok((await readFile(file)).subarray(0, 22).toString().startsWith('age-encryption.org/v1'));
}));
test('wrong/missing identity, corruption and truncation fail', () => fixture(async ({ dir, identity, file, encrypt }) => {
  const expected = await encrypt(), wrong = join(dir, 'wrong.txt'); await generateIdentity(wrong, process.cwd());
  await assert.rejects(decryptBackup({ file, identity: wrong, expected }));
  await assert.rejects(decryptBackup({ file, identity: join(dir, 'absent'), expected }));
  const original = await readFile(file), corrupt = Buffer.from(original); corrupt[corrupt.length - 10] ^= 1;
  for (const bytes of [corrupt, original.subarray(0, original.length - 10), Buffer.from('plaintext')]) {
    await writeFile(file, bytes); await assert.rejects(decryptBackup({ file, identity, expected }));
  }
}));
test('atomic publication never overwrites and cleans incomplete files', () => fixture(async ({ dir, file, encrypt }) => {
  await encrypt(); const original = await readFile(file);
  await assert.rejects(encrypt()); assert.deepEqual(await readFile(file), original);
  assert.deepEqual((await readdir(dir)).sort(), ['fixture.age','identity.txt']);
}));
test('repository, broad-permission and symlink targets refused', () => fixture(async ({ dir, encrypt }) => {
  await assert.rejects(encrypt({ file: join(process.cwd(), 'forbidden.age') }));
  await chmod(dir, 0o755); await assert.rejects(encrypt()); await chmod(dir, 0o700);
  await symlink(dir, join(dir, 'alias')); await assert.rejects(encrypt({ file: join(dir, 'alias','fixture.age') }));
}));
test('nonarchive, source failure and failing child never publish backups', () => fixture(async ({ dir, encrypt }) => {
  await assert.rejects(encrypt({ source: source(Buffer.from('not an archive')) }));
  await assert.rejects(encrypt({ source: { readable: Readable.from((async function* () { yield dump; throw new Error('fictional source failure'); })()), done: Promise.resolve() } }));
  await assert.rejects(encrypt({ source: processStream(process.execPath, ['-e','process.exit(7)']) }));
  assert.deepEqual(await readdir(dir), ['identity.txt']);
}));
test('incompatible metadata and mismatched trusted hashes rejected', () => fixture(async ({ identity, file, encrypt }) => {
  const expected = await encrypt();
  await assert.rejects(decryptBackup({ file, identity, expected: { ...expected, metadata: { ...metadata, sourceVersion: '17.11' } } }));
  await assert.rejects(decryptBackup({ file, identity, expected: { ...expected, dumpSha256: '0'.repeat(64) } }));
  await assert.rejects(decryptBackup({ file, identity, expected: { ...expected, encryptedSha256: '0'.repeat(64) } }));
  await assert.rejects(encrypt({ metadata: { ...metadata, sourceVersion: '16.1' } }));
}));
test('preflight rejection stops an already-started source without artifacts', () => fixture(async ({ dir, encrypt }) => {
  let killed = false; const input = { ...source(dump), kill() { killed = true; } };
  await assert.rejects(encrypt({ metadata: { ...metadata, sourceVersion: '16.1' }, source: input }));
  assert.equal(killed, true); assert.equal(input.readable.destroyed, true);
  assert.deepEqual(await readdir(dir), ['identity.txt']);
}));
test('multi-chunk stream with slow sink uses backpressure without whole-dump buffering', () => fixture(async ({ identity, file, encrypt }) => {
  let yielded = 0, received = 0;
  const readable = Readable.from((async function* () { yield Buffer.from('PGDMP'); for (let i=0;i<128;i++) { yielded++; yield Buffer.alloc(65536,i); } })(), { highWaterMark: 2 });
  const expected = await encrypt({ source: { readable, done: Promise.resolve() } });
  const writable = new Writable({ highWaterMark: 1024, write(chunk, _encoding, callback) { received += chunk.length; setTimeout(callback, 1); } });
  await decryptBackup({ file, identity, expected, destination: { writable, done: Promise.resolve() } });
  assert.equal(yielded,128); assert.equal(received,5+128*65536); assert.ok(readable.readableHighWaterMark <= 2);
}));
