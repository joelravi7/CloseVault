// OWNER-OPERATED ONLY after separate hosted-access approval. Never called by tests.
import { readFile, lstat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { runExport, project } from './hosted-export.mjs';
import { privateDestination } from './envelope.mjs';
try {
  if (process.argv.length !== 6 || process.argv[2] !== '--config' || process.argv[4] !== '--confirm-export' || process.argv[5] !== project) throw new Error('Explicit operator confirmation required.');
  const repository=execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();
  await privateDestination(process.argv[3],repository);
  const stat=await lstat(process.argv[3]);if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o777)!==0o600||stat.uid!==process.getuid()||stat.size>16384)throw new Error('Private bounded regular operator configuration required.');
  const config=JSON.parse(await readFile(process.argv[3],'utf8'));
  const manifest=await runExport(config,repository);
  console.log(`Encrypted export written. SHA-256: ${manifest.backup.encryptedSha256}`);
  console.log('NOT decryption/restore verified; retain independent integrity evidence and verify privately.');
} catch { console.error('STOP: export failed/incomplete. No verified backup claimed; sensitive diagnostics withheld.'); process.exitCode=1; }
