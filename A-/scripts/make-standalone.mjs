import {readFile,writeFile,mkdir} from 'node:fs/promises';
const dist=new URL('../dist/',import.meta.url),output=new URL('../outputs/',import.meta.url);
let html=await readFile(new URL('index.html',dist),'utf8');
for(const match of [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)]){
 const js=(await readFile(new URL(match[1],dist),'utf8')).replace(/<\/script/gi,'<\\/script');
 html=html.replace(match[0],()=>'<script type="module">'+js+'</script>');
}
for(const match of [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)]){const css=await readFile(new URL(match[1],dist),'utf8');html=html.replace(match[0],()=>'<style>'+css+'</style>');}
const snapshot=(await readFile(new URL('data/latest.json',dist),'utf8')).replace(/</g,'\\u003c');
html=html.replace('<head>',()=>'<head><script id="bootstrap-market" type="application/json">'+snapshot+'</script>');
const favicon='data:image/svg+xml,'+encodeURIComponent(await readFile(new URL('favicon.svg',dist),'utf8'));html=html.replace('./favicon.svg',()=>favicon);
await mkdir(output,{recursive:true});await writeFile(new URL('index.html',output),html);
console.log('Standalone public-data site created (no server or provider key).');
