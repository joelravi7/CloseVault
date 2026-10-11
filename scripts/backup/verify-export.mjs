// Owner verifies locally. Reads identity through age only; never prints its contents.
import { readFile, lstat } from 'node:fs/promises';
import { decryptBackup, privateDestination } from './envelope.mjs';
import { execFileSync } from 'node:child_process';
try {
  if(process.argv.length!==6||process.argv[2]!=='--manifest'||process.argv[4]!=='--identity')throw new Error('Expected manifest and private identity paths.');
  const repository=execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();
  for(const file of [process.argv[3],process.argv[5]]){await privateDestination(file,repository);const s=await lstat(file);if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o777)!==0o600||s.uid!==process.getuid())throw new Error('Private owned regular files required.');}
  const manifest=JSON.parse(await readFile(process.argv[3],'utf8'));
  await privateDestination(manifest.backupFile,repository);
  await decryptBackup({file:manifest.backupFile,identity:process.argv[5],expected:manifest.backup});
  console.log('PASS age decryption, complete archive/hash/metadata integrity. NOT provenance or database restore verification.');
}catch{console.error('STOP: verification failed; private diagnostics withheld.');process.exitCode=1;}
