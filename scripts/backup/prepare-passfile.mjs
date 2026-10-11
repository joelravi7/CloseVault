// Operator-only private terminal input. Never executed with production credentials by Codex.
import { stdin, stdout } from 'node:process';
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { project, host } from './hosted-export.mjs';
import { privateDestination } from './envelope.mjs';
try {
  if(process.argv.length!==4||!stdin.isTTY||!stdout.isTTY||!/^([a-z_][a-z0-9_]{0,62})$/.test(process.argv[3]))throw new Error('Private interactive terminal required.');
  const repository=execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();
  const target=await privateDestination(process.argv[2],repository);
  stdout.write(`Database password for approved project ${project} (hidden): `);
  stdin.setRawMode(true);stdin.setEncoding('utf8'); let password='';
  try { password=await new Promise((resolve,reject)=>{ const onData=chunk=>{for(const c of chunk){if(c==='\u0003'){stdin.off('data',onData);reject(new Error('Cancelled'));return;}if(c==='\r'||c==='\n'){stdin.off('data',onData);resolve(password);return;}if(c==='\u007f'||c==='\b')password=password.slice(0,-1);else if(c>=' '&&password.length<4096)password+=c;}};stdin.on('data',onData);}); }
  finally {stdin.setRawMode(false);stdin.pause();stdout.write('\n');}
  if(!password)throw new Error('Empty password');
  const escaped=password.replace(/\\/g,'\\\\').replace(/:/g,'\\:');
  await writeFile(target,`${host}:5432:postgres:${process.argv[3]}:${escaped}\n`,{mode:0o600,flag:'wx'}); password='';
  console.log('Private scoped passfile created. Do not share, commit or upload it.');
}catch{if(stdin.isTTY)stdin.setRawMode(false);console.error('STOP: private passfile preparation failed; no password printed.');process.exitCode=1;}
