const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
fs.mkdirSync(path.join(root,'vendor'),{recursive:true});
fs.mkdirSync(path.join(root,'licenses'),{recursive:true});
for(const [pkg,source,target] of [['echarts','dist/echarts.min.js','echarts.min.js'],['d3','dist/d3.min.js','d3.min.js'],['lucide','dist/umd/lucide.min.js','lucide.min.js']]){
 fs.copyFileSync(path.join(root,'node_modules',pkg,source),path.join(root,'vendor',target));
 for(const name of ['LICENSE','LICENSE.txt','NOTICE']){
  const source=path.join(root,'node_modules',pkg,name);
  if(fs.existsSync(source))fs.copyFileSync(source,path.join(root,'licenses',pkg+'-'+name));
 }
}
require('esbuild').buildSync({
 entryPoints:[path.join(root,'components/peak-relief.js')],bundle:true,minify:true,
 format:'iife',outfile:path.join(root,'vendor/peak-relief.min.js'),legalComments:'inline'
});
fs.copyFileSync(path.join(root,'node_modules/three/LICENSE'),path.join(root,'licenses/three-LICENSE'));
console.log('Pinned browser bundles and license notices copied.');
