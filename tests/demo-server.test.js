const {test}=require('node:test');
const assert=require('node:assert/strict');
test('README demo komutu panel CSS ve betikleri sunar, kaynak deposunu açmaz',async()=>{
  const {createDemoServer}=await import('../scripts/serve-demo.mjs');
  const server=createDemoServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+server.address().port;
  try{
    const home=await fetch(url+'/demo/');assert.equal(home.status,200);assert.match(await home.text(),/href="panel.css"/);
    const css=await fetch(url+'/demo/panel.css');assert.equal(css.status,200);assert.match(css.headers.get('content-type'),/text\/css/);
    assert.equal(await css.text(),require('../src/extension/indirme-panel.js').CSS);
    for (const asset of ['/demo/demo.js','/src/extension/indirme-panel.js']){
      const result=await fetch(url+asset);assert.equal(result.status,200);assert.match(result.headers.get('content-type'),/javascript/);assert.equal(result.headers.get('x-content-type-options'),'nosniff');
    }
    for (const asset of ['/.git/config','/README.md','/src/extension/vault-crypto.js','/../LICENSE'])assert.equal((await fetch(url+asset)).status,404);
    assert.equal((await fetch(url+'/demo/',{method:'POST'})).status,404);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
