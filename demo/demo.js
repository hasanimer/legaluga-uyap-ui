(() => {
  'use strict';
  const listeners = new Set();
  const state = {id:'demo-plan',fileKey:'demo-file',rec:{dosyaNo:'DEMO/001',birimAdi:'Sentetik dosya'},status:'paused',phase:'idle',saved:200,total:10840,partCount:2,inPart:0,partBytes:0,elapsedMs:120000,lastPart:null,currentTitle:'',error:''};
  let timer;
  const emit = () => {for (const fn of listeners) fn([structuredClone(state)]);};
  const manager = {
    list: () => [structuredClone(state)],
    subscribe(fn) {listeners.add(fn);fn(this.list());return () => listeners.delete(fn);},
    async pause() {clearInterval(timer);state.status='paused';state.phase='idle';emit();},
    async resume() {
      clearInterval(timer);state.status='running';state.phase='fetching';emit();
      timer=setInterval(() => {
        state.inPart+=10;state.partBytes=state.inPart*1024;state.elapsedMs+=500;state.currentTitle='Sentetik rapor';
        if (state.inPart>=100) {state.saved=Math.min(state.saved+100,state.total);state.partCount++;state.inPart=0;state.partBytes=0;}
        if (state.saved>=state.total) {clearInterval(timer);state.status='complete';state.phase='idle';}
        emit();
      },500);
    }
  };
  globalThis.UHDBulkPanel.mount(document.querySelector('#panel'),{manager,openFile:async () => {document.querySelector('#message').textContent='Demo dosyası; gerçek dosya açılmaz.';}});
  window.addEventListener('pagehide',() => clearInterval(timer),{once:true});
})();
