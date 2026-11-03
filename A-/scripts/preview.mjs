import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/'){res.writeHead(302,{Location:'/A-/'});res.end();return;}
 if(url.pathname==='/standalone/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await readFile(new URL('../outputs/index.html',import.meta.url)));return;}
 if(!url.pathname.startsWith('/A-/'))throw Error('Not Found');
 const relative=decodeURIComponent(url.pathname.slice(4)||'index.html'),file=path.resolve(root,relative);
 if(!file.startsWith(path.resolve(root)+path.sep))throw Error('Not Found');
 res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(await readFile(file));
}catch{res.writeHead(404);res.end('Not Found');}}).listen(4174,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:4174/A-/'));
