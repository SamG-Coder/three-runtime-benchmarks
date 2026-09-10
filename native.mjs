import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { config, machine, save } from './common.mjs';
import { runSuite } from './suite.mjs';
const root=process.env.THREEBROWSER_ROOT;
if(!root) throw new Error('Set THREEBROWSER_ROOT to the ThreeBrowser repository directory');
process.env.THREEBROWSER_RUNTIME_ADDON ||= resolve(root,'ThreeBrowserRuntime/build/bin/three_browser_runtime.node');
const host=await import(pathToFileURL(resolve(root,'ThreeBrowserRuntime/runtime/browser-host.mjs')));
try {
  const T=host.loadThreeShim(resolve(root,'host/ThreeBrowser/web/three'));
  const revision=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const dirty=!!execFileSync('git',['-C',root,'status','--porcelain'],{encoding:'utf8'}).trim();
  const result=await runSuite(T,config,{...machine,environment:'ThreeBrowserRuntime native facade',revision,dirty,threeRevision:T.REVISION,statsBefore:host.native.stats()},()=>globalThis.__TN.cmd.submit());
  result.metadata.statsAfter=host.native.stats();
  await save(process.argv[2]||'results/runtime.json',result);
} finally {host.stop();}
