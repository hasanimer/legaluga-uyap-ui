import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allowed = new Set(['/demo/','/demo/index.html','/demo/demo.css','/demo/panel.css','/demo/demo.js','/indirme-panel.js']);
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8'};
export function createDemoServer() {return http.createServer((req,res) => {
  const name = new URL(req.url,'http://127.0.0.1').pathname;
  if (!allowed.has(name) || req.method!=='GET') {res.writeHead(404);res.end();return;}
  const file = path.join(root,name==='/demo/'?'demo/index.html':name);
  res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  fs.createReadStream(file).pipe(res);
});}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const server=createDemoServer();
  server.listen(4173,'127.0.0.1',() => console.log('Sentetik demo: http://127.0.0.1:4173/demo/'));
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal,() => server.close());
}
