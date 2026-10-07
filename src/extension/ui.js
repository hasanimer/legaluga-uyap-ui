// Arama arayüzü: hem eklenti popup'ında hem UYAP sayfasındaki yan panelde aynı kod kullanılır.
(() => {
  if (globalThis.UHD.mountUI) return;
  const { search, passFilter, fileNoQuery, fmtTrDate, fmtNum, fmtDate, norm, detectMyName, myKeys, isClient, nameKey, BRAND, csvCell, csvDosyaNo, unseenEvrak, trDateTs, lastEvrak, personFiles, trTitle, cleanDurum, cleanBirim, kunyeOf, evrakTakipAcik, CBS, ILLER, ilAdi, BACKUP_APP, BACKUP_FORMAT, BACKUP_KEYS, checkBackup, todayIso, daysLeft, upcomingDurusmalar, durusmaCakismalari, CAKISMA_DK, durusmaIcs } = globalThis.UHD;
  const LIMIT = 60;
  const RECENT_MAX = 10;
  const RUN_STALE_MS = 90000;
  const REMIND_DAYS = 7;
  const TARAF_V = 2;

  const CSS = `
.uhd{--navy:${BRAND.primary};--navy2:${BRAND.primaryDark};--deep:${BRAND.deep};--soft:${BRAND.soft};--bord:${BRAND.border};--focus:${BRAND.focus};
  --shadow:0 2px 8px #182b4010;--accent-text:#0b6663;
  --bg:#f5f7fb;--card:#fff;--text:#1d2939;--text2:#344054;--muted:#667085;--line:#e3e8f2;--line2:#cfd6e4;
  --green:#12805c;--green-bg:#e7f6ef;--grey:#98a2b3;--grey-bg:#eef0f3;--amber:#b54708;--amber-bg:#fef0c7;--blue:#356b91;--blue-bg:#edf4f8;--red:#b42318;
  --note-bg:#fffbea;--note-bd:#f2c94c;--note-red:#b42318;--ev-bg:#f0f5ff;--ev-bd:#528bff;--ev-tx:#1849a9;--warn-bg:#fff4e5;--warn-tx:#7a4b00;
  --tur-bg:#f3efff;--tur-tx:#5b3cc4;--err-bg:#fdecea;--err-tx:#8a1f17;--mark:#ffe58a;
  font:13px/1.5 "Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif;color:var(--text);background:var(--bg);
  display:flex;flex-direction:column;height:100%;min-height:0;box-sizing:border-box;color-scheme:light;container-type:inline-size}
.uhd[data-theme=dark]{--soft:#173d39;--bord:#428d83;--shadow:0 2px 8px #0002;--accent-text:#8ae0d2;--focus:#7fd6cc;
  --bg:#0f1720;--card:#18222d;--text:#e6edf3;--text2:#c9d3de;--muted:#98a2b3;--line:#2a3644;--line2:#3a4756;
  --green:#4fd1a5;--green-bg:#0f2e25;--grey:#667085;--grey-bg:#25303c;--amber:#f5b04c;--amber-bg:#33260f;--blue:#86b7da;--blue-bg:#1b2d3d;--red:#f97066;
  --note-bg:#2b2716;--note-bd:#b38f1f;--note-red:#ff9292;--ev-bg:#16233a;--ev-bd:#528bff;--ev-tx:#9ec1ff;--warn-bg:#33270f;--warn-tx:#f5c26b;
  --tur-bg:#261e3f;--tur-tx:#c9bbff;--err-bg:#3a1714;--err-tx:#f7a8a1;--mark:#6b5a12;color-scheme:dark}
.uhd[data-theme=dark] :is(.onboard b,.ib:hover,.ib.on,.pmore,.pname:hover,.lnk:hover,.rolein:not(.other),.dayhead:not(.today),.durrow .t,.tag:not(.auto)){color:#7fd6cc}
.uhd *{box-sizing:border-box}
.uhd [hidden]{display:none!important}
.uhd :focus-visible{outline:2px solid var(--focus);outline-offset:2px}
.uhd button{font:inherit;color:inherit}
.uhd svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}
.uhd header{display:flex;flex-shrink:0;align-items:center;gap:8px;padding:10px 16px;background:var(--card);color:var(--text)}
.uhd header strong{font-size:14px;font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:-.2px}
.uhd .brand-mark{display:block;width:30px;height:30px;flex:none;fill:none;stroke:none}
.uhd .settings-toggle{flex:none}
.uhd .settings-toggle.on{background:var(--soft);color:var(--accent-text);border-color:var(--bord)}
.uhd .x{background:none;border:0;color:var(--muted);font-size:22px;line-height:1;cursor:pointer;width:32px;height:32px;border-radius:8px}
.uhd .x:hover{background:var(--grey-bg)}
.uhd .search{position:relative;padding:0 14px 10px;background:var(--card)}
.uhd .q{width:100%;border:1px solid var(--line2);border-radius:10px;padding:10px 72px 10px 13px;font:inherit;font-size:14px;outline:none;background:var(--bg);color:var(--text);transition:border-color .15s,box-shadow .15s}
.uhd .q::-webkit-search-cancel-button{display:none}
.uhd .q:focus{border-color:var(--focus);box-shadow:0 0 0 3px var(--soft)}
.uhd .q::placeholder{color:var(--muted);opacity:1}
.uhd .sbtn{position:absolute;top:5px;width:32px;height:32px;border:0;background:none;border-radius:6px;color:var(--muted);cursor:pointer;display:flex;align-items:center;justify-content:center}
.uhd .sbtn:hover{background:var(--grey-bg);color:var(--text)}
.uhd .sbtn.clear{right:52px}
.uhd .sbtn.help{right:18px}
.uhd .views{display:flex;gap:4px;padding:0 14px 8px;background:var(--card);border-bottom:1px solid var(--line)}
.uhd .view{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;min-height:36px;padding:6px;border:0;border-radius:8px;color:var(--muted);background:none;font-weight:600;cursor:pointer;font-size:12px}
.uhd .view:hover{background:var(--bg);color:var(--text)}
.uhd .view{min-width:0}
.uhd .view.ftoggle{flex:none;min-width:40px;padding:6px 8px;gap:4px}
.uhd .view.ftoggle[aria-expanded=true]{background:var(--bg);color:var(--text)}
.uhd .view.on{background:var(--soft);color:var(--accent-text)}
.uhd .view small{font-size:11px;padding:0 5px;border-radius:5px;background:var(--bg);color:var(--muted)}
.uhd .filters{display:flex;flex-direction:column;gap:8px;padding:8px 14px 0}
.uhd .filters:empty{display:none}
.uhd .filter-top{display:flex;gap:8px;align-items:center;justify-content:space-between}
.uhd .filter-summary{color:var(--muted);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
.uhd .filter-body{display:flex;flex-direction:column;gap:8px;padding:10px;background:var(--card);border:1px solid var(--line);border-radius:10px}
.uhd .cbs-filters{display:grid;gap:6px}
.uhd .cbs-filters label{display:flex;flex-direction:column;gap:3px;font-size:11px;color:var(--muted)}
.uhd .cbs-filters select{width:100%;max-width:100%}
.uhd .frow{display:flex;flex-wrap:wrap;gap:5px;align-items:center}
.uhd .frow .lbl{font-size:11px;color:var(--muted);margin-right:2px}
.uhd .filter-pin{display:inline-flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;white-space:nowrap}
.uhd .chip{border:1px solid var(--line2);background:var(--card);color:var(--text2);border-radius:7px;min-height:30px;padding:4px 10px;font-size:12px;cursor:pointer}
.uhd .chip:hover{border-color:var(--focus)}
.uhd .chip.on{background:var(--navy);border-color:var(--navy);color:#fff}
.uhd .chip.client.on{background:var(--deep);border-color:var(--deep)}
.uhd .chip.new{border-color:var(--ev-bd);color:var(--ev-tx)}
.uhd .chip.new.on{background:#1849a9;border-color:#1849a9;color:#fff}
.uhd .chip.dur.on{background:var(--text2);border-color:var(--text2);color:var(--card)}
.uhd .notice{margin:8px 10px 0;padding:8px 10px;border-radius:8px;background:var(--warn-bg);color:var(--warn-tx);font-size:12px;display:flex;gap:8px;align-items:center}
.uhd .notice.err{background:var(--err-bg);color:var(--err-tx)}
.uhd .notice>span{flex:1;min-width:0;overflow-wrap:anywhere}
.uhd .notice button{flex:none;border:1px solid currentColor;background:none;color:inherit;border-radius:6px;min-height:30px;padding:3px 8px;cursor:pointer}
.uhd .notice .dismiss{border:0;font-size:18px;padding:0 6px}
.uhd .results{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;padding:10px 12px}
.uhd .empty{padding:32px 16px;text-align:center;color:var(--muted)}
.uhd .empty .btn{margin-top:10px}
.uhd .more{padding:6px 10px 10px;text-align:center;font-size:12px;color:var(--muted)}
.uhd .section{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:0 2px 10px;font-size:12px;color:var(--muted)}
.uhd .section b{font-weight:600;color:var(--text2)}
.uhd .section.eylem{justify-content:flex-start;flex-wrap:wrap;margin-top:-4px}
.uhd .sort{max-width:180px;min-height:30px;padding:4px 6px;border:1px solid var(--line);border-radius:7px;font:inherit;font-size:11px;color:var(--text2);background:var(--card)}
.uhd .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.uhd .empty strong{display:block;color:var(--text);font-size:15px;margin-bottom:6px}
.uhd .empty p{margin:4px 0 12px}
.uhd .quick-actions{display:flex;justify-content:center;gap:8px;flex-wrap:wrap}
.uhd .load-more{width:100%;justify-content:center;margin:6px 0}
.uhd .onboard{margin:14px 6px;padding:16px 18px;background:var(--card);border:1px solid var(--line);border-radius:12px}
.uhd .onboard b{display:block;font-size:14px;color:var(--navy);margin-bottom:6px}
.uhd .onboard ol{margin:0 0 14px;padding-left:20px;color:var(--text2)}
.uhd .onboard li{margin:4px 0}
.uhd .btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line2);background:var(--card);color:var(--text);border-radius:8px;padding:6px 11px;cursor:pointer;white-space:nowrap}
.uhd .btn:hover{border-color:var(--focus)}
.uhd .btn.primary{background:var(--navy);border-color:var(--navy);color:#fff;font-weight:600}
.uhd .btn.primary:hover{background:var(--navy2)}
.uhd .btn.danger{border-color:#e5b3ae;color:var(--red)}
.uhd .btn.sm{padding:5px 9px;min-height:30px;font-size:12px;border-radius:7px}
.uhd .backup-password{width:min(420px,90vw);border:1px solid var(--line2);border-radius:12px;padding:20px;background:var(--card);color:var(--text);font:inherit}
.uhd .backup-password::backdrop{background:#0007}
.uhd .backup-password h3{margin:0 0 10px}
.uhd .backup-password p{color:var(--muted);margin:8px 0 12px}
.uhd .backup-password label{display:block;margin:10px 0}
.uhd .backup-password input{display:block;width:100%;margin-top:4px;padding:9px;border:1px solid var(--line2);border-radius:6px;background:var(--bg);color:var(--text);font:inherit}
.uhd .backup-password .backup-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
.uhd .backup-password .backup-error{color:var(--red)}
.uhd .ib{width:32px;height:32px;border:0;background:none;border-radius:8px;color:var(--muted);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex:none}
.uhd .ib:hover{background:var(--soft);color:var(--navy)}
.uhd .ib.on{color:var(--navy)}
.uhd .ib.done{color:var(--green)}
.uhd .item{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--st,var(--green));border-radius:10px;padding:8px 8px 7px 11px;margin-bottom:7px;cursor:default;box-shadow:var(--shadow)}
.uhd .item.closed{--st:var(--grey)}
.uhd .item.karar{--st:var(--amber)}
.uhd .item.paused{--st:var(--blue)}
.uhd .item:hover{border-color:var(--bord);border-left-color:var(--st,var(--green))}
.uhd .item.sel{border-color:var(--st,var(--green));box-shadow:0 0 0 1px var(--st,var(--green)),var(--shadow)}
.uhd .ihead{display:flex;align-items:center;gap:6px}
.uhd .ititle{flex:1;min-width:0;display:flex;flex-wrap:wrap;align-items:center;gap:3px 0;line-height:1.35}
.uhd .file-number{font-size:15px;font-weight:750;letter-spacing:-.2px;color:var(--accent-text);margin-right:2px}
.uhd .birim{font-size:12.5px;font-weight:600;color:var(--text);line-height:1.35;margin:1px 0 2px;overflow-wrap:anywhere}
.uhd .pill{display:inline-block;padding:0 6px;border-radius:9px;font-size:11px;font-weight:600;margin-left:6px;vertical-align:1px;white-space:nowrap}
.uhd .pill.new{background:var(--ev-bg);color:var(--ev-tx)}
.uhd .pill.st{background:var(--green-bg);color:var(--green)}
.uhd .pill.st.closed{background:var(--grey-bg);color:var(--muted)}
.uhd .pill.st.karar{background:var(--amber-bg);color:var(--amber)}
.uhd .pill.st.paused{background:var(--blue-bg);color:var(--blue)}
.uhd .pill.tur{background:var(--tur-bg);color:var(--tur-tx)}
.uhd .pill.cak{background:var(--amber-bg);color:var(--amber)}
.uhd .pill.teyit{background:var(--warn-bg);color:var(--warn-tx)}
.uhd .cakline{margin-top:2px;font-size:12px;color:var(--warn-tx)}
.uhd .icons{flex:none;display:flex;gap:0}
.uhd .ifoot{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:4px}
.uhd .ifoot .open{margin-left:auto}
.uhd .ifoot .open[aria-busy=true]{cursor:progress}
.uhd .item .ib{width:28px;height:28px}
.uhd .item .ifoot .btn.sm{min-height:28px;padding:3px 9px}
.uhd .client{font-size:12px;color:var(--deep)}
.uhd[data-theme=dark] .client{color:#7fd6cc}
.uhd .client b{font-weight:600}
.uhd .parties{margin-top:2px;font-size:12px;color:var(--text2);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.uhd .parties.all{display:block}
.uhd .parties .rol,.uhd .vek{color:var(--muted)}
.uhd .parties em{color:var(--muted)}
.uhd .pmore{border:0;background:none;padding:0 4px;min-height:24px;min-width:24px;font-size:12px;font-weight:600;color:var(--accent-text);cursor:pointer;flex:none}
.uhd .prow{display:flex;align-items:center;gap:4px;margin-top:1px;font-size:12px;color:var(--text2);min-width:0}
.uhd .pline{flex:1;min-width:0;display:flex;align-items:baseline;overflow:hidden;white-space:pre}
.uhd .pline .rol{flex:none;color:var(--muted)}
.uhd .pline .pname{flex:0 1 auto;min-width:3em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.uhd .pline .pname.mv{font-weight:600;color:var(--deep)}
.uhd[data-theme=dark] .pline .pname.mv{color:#7fd6cc}
.uhd .note-line{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;width:100%;margin-top:3px;padding:3px 8px;border:0;border-left:3px solid var(--note-bd);
  background:var(--note-bg);border-radius:0 6px 6px 0;font-size:12px;line-height:1.45;color:var(--text);text-align:left;white-space:pre-line;overflow-wrap:anywhere;cursor:text}
.uhd .pname{border:0;background:none;padding:0;color:inherit;cursor:pointer;text-align:left;border-bottom:1px dotted transparent}
.uhd .pname:hover{color:var(--navy);border-bottom-color:currentColor}
.uhd .note-card-editor{margin-top:6px;padding:8px;border:1px solid var(--line);border-radius:8px;background:var(--note-bg)}
.uhd .note-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:4px;margin-bottom:6px}
.uhd .note-format{min-height:28px;padding:3px 8px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--text);font:inherit;font-size:12px;cursor:pointer}
.uhd .note-format[aria-pressed="true"]{border-color:var(--focus);background:var(--soft);color:var(--navy)}
.uhd .note-format:disabled{opacity:.55;cursor:default}
.uhd .note-red{color:var(--note-red)}
.uhd .note-ta{display:block;box-sizing:border-box;width:100%;padding:8px;border:1px solid var(--line);background:var(--bg);border-radius:6px;
  font:inherit;font-size:13px;line-height:1.6;color:var(--text);resize:vertical;outline:none;white-space:pre-wrap;overflow-wrap:anywhere;min-height:96px;max-height:240px;overflow:auto;cursor:text}
.uhd .note-ta:focus{box-shadow:0 0 0 2px var(--note-bd)}
.uhd .note-actions{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-top:8px}
.uhd .note-hint,.uhd .note-status{font-size:11px;color:var(--muted)}
.uhd .note-status{margin-top:6px;min-height:1.4em}
.uhd .note-status.err{color:var(--warn-tx)}
.uhd mark{background:var(--mark);color:inherit;border-radius:2px}
.uhd .son{margin-top:2px;font-size:12px;color:var(--muted)}
.uhd .son b{font-weight:600;color:var(--text2)}
.uhd .durline{margin-top:2px;font-size:12px;color:var(--text2)}
.uhd .durline b{font-weight:600}
.uhd .durline.today b{color:var(--red)}
.uhd .durline.soon b{color:var(--amber)}
.uhd .rolein{margin-top:2px;font-size:12px;color:var(--deep)}
.uhd .rolein.other{color:var(--warn-tx)}
.uhd .evrak{margin-top:5px;padding:4px 8px;border-left:3px solid var(--ev-bd);background:var(--ev-bg);border-radius:0 6px 6px 0;font-size:12px;cursor:default}
.uhd .evrak .head{display:flex;justify-content:space-between;align-items:center;gap:8px;font-weight:600;color:var(--ev-tx)}
.uhd .evrak ul{margin:3px 0 0;padding:0;list-style:none}
.uhd .evrak li{margin:3px 0;color:var(--text2)}
.uhd .evrak li small{color:var(--muted)}
.uhd .evrak.compact{display:flex;align-items:center;gap:4px}
.uhd .evrak .ev-sum{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text2)}
.uhd .evrak .ev-sum b{color:var(--ev-tx)}
.uhd .evrak .ev-sum small{color:var(--muted);font-size:12px}
.uhd .evrak .btn.sm{min-height:26px;padding:2px 7px}
.uhd .evrak-more{border:0;background:none;padding:2px 4px;min-height:26px;flex:none;color:var(--ev-tx);font-size:12px;font-weight:600;text-decoration:underline;text-underline-offset:2px;cursor:pointer}
.uhd .lnk{border:1px solid var(--line2);background:var(--card);color:var(--text2);border-radius:5px;padding:3px 7px;min-height:26px;font-size:11px;cursor:pointer;margin-left:4px;vertical-align:1px}
.uhd .lnk:hover{border-color:var(--focus);color:var(--navy)}
.uhd .person,.uhd .durhead{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:8px;font-size:12px;color:var(--text2)}
.uhd .person .top{display:flex;align-items:center;gap:8px}
.uhd .person .top b{font-size:15px;color:var(--deep);flex:1}
.uhd[data-theme=dark] .person .top b{color:#7fd6cc}
.uhd .person .kind{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
.uhd .person .sum{margin-top:4px}
.uhd .person .warn{margin-top:6px;padding:5px 8px;border-radius:6px;background:var(--warn-bg);color:var(--warn-tx)}
.uhd .person .hint,.uhd .durhead .hint{margin-top:6px;color:var(--muted);font-size:11px}
.uhd .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px}
.uhd .dayhead{display:flex;justify-content:space-between;align-items:baseline;padding:8px 4px 5px;font-size:12px;font-weight:700;color:var(--deep)}
.uhd[data-theme=dark] .dayhead{color:#7fd6cc}
.uhd .dayhead.today{color:var(--red)}
.uhd .dayhead small{font-weight:400;color:var(--muted)}
.uhd .durrow{display:flex;gap:10px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 10px;margin-bottom:6px}
.uhd .durrow .t{flex:none;font-weight:700;font-size:14px;color:var(--deep);width:44px}
.uhd .durrow .meta{color:var(--muted);font-size:12px}
.uhd .settings{flex:1;min-height:0;overflow:auto;padding:10px 12px 16px;font-size:12px}
.uhd .settings h3{margin:14px 0 6px;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted)}
.uhd .settings h3:first-of-type{margin-top:4px}
.uhd .settings .box{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.uhd .settings .top{display:flex;align-items:center;gap:8px;margin-bottom:4px;position:sticky;top:-10px;background:var(--bg);z-index:1;padding:10px 0}
.uhd .settings .top b{flex:1;font-size:14px}
.uhd .settings label.check{display:flex;gap:8px;align-items:flex-start;margin:6px 0;cursor:pointer}
.uhd .settings label.check input{margin:2px 0 0}
.uhd .settings .field{display:flex;align-items:center;gap:8px;margin:6px 0}
.uhd .settings .field span{flex:1}
.uhd .settings select,.uhd .settings input[type=text]{border:1px solid var(--line2);border-radius:6px;padding:5px 8px;font:inherit;background:var(--card);color:var(--text);outline:none;min-width:0}
.uhd .settings input[type=text]{flex:1}
.uhd .settings .hint{color:var(--muted);font-size:11px;margin-top:4px}
.uhd .setup{flex:1;min-height:0;overflow:auto;padding:20px 16px 24px;color:var(--text);font-size:13px}
.uhd .setup>*{max-width:760px;margin-inline:auto}
.uhd .setup-head{margin-bottom:20px}
.uhd .setup-head h1{font-size:24px;line-height:1.25;margin:8px 0}
.uhd .setup-head p{color:var(--muted);line-height:1.6;margin:8px 0}
.uhd .setup-step{font-size:12px;font-weight:600;color:var(--accent-text)}
.uhd .setup-card{min-width:0;border:1px solid var(--line);border-radius:12px;background:var(--card);padding:16px;margin-block:14px}
.uhd .setup-card legend{font-size:15px;font-weight:600;padding:0 6px}
.uhd .setup-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px}
.uhd .setup-choice{display:flex;gap:10px;align-items:flex-start;line-height:1.5;padding:8px 0;cursor:pointer}
.uhd .setup-choice input{flex:none;margin:3px 0;accent-color:var(--navy);width:16px;height:16px}
.uhd .setup label:not(.setup-choice){display:block;margin-block:12px;line-height:1.5}
.uhd .setup select,.uhd .setup input[type=text],.uhd .setup input[type=search]{display:block;box-sizing:border-box;width:100%;border:1px solid var(--line2);border-radius:8px;background:var(--card);color:var(--text);font:inherit;padding:9px 10px;margin-top:6px}
.uhd .setup-hint{font-size:12px;color:var(--muted);line-height:1.6;margin-top:4px}
.uhd .setup-connection{font-size:13px;line-height:1.5;color:var(--accent-text);overflow-wrap:anywhere}
.uhd .setup-guide{padding-left:22px;line-height:1.6}
.uhd .setup-guide li+li{margin-top:6px}
.uhd .setup-cities{max-height:220px;overflow:auto;overscroll-behavior:contain;padding:4px 8px;border:1px solid var(--line);border-radius:8px}
.uhd .setup-summary{background:var(--soft);border:1px solid var(--bord);border-radius:10px;padding:12px 14px;line-height:1.6;margin-block:14px}
.uhd .setup-summary h2{font-size:14px;margin:0 0 6px}
.uhd .setup-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:18px}
.uhd .setup-actions .btn{min-height:38px;font-size:13px;padding:8px 12px}
.uhd .setup-error{color:var(--red);line-height:1.5;margin-block:10px}
.uhd:has(.setup:not([hidden]))>.status{display:none}
.uhd.options .setup{padding:32px 24px 48px}
@container (max-width:400px){.uhd .setup-head h1{font-size:20px}.uhd .setup-grid{grid-template-columns:1fr}.uhd .setup-actions .btn{width:100%}}
.uhd .note-line.ro{cursor:default}
.uhd .view.ozet{flex:none;padding:6px 10px;color:var(--accent-text);background:var(--soft)}
.uhd .view.ozet:hover{background:var(--bg);color:var(--text)}
.uhd .balance-line{display:flex;align-items:center;flex-wrap:wrap;gap:4px 8px;margin:7px 0;padding:7px 9px;border:1px solid var(--line);border-radius:8px;background:var(--bg)}
.uhd .balance-line strong{font-variant-numeric:tabular-nums;color:var(--accent-text)}
.uhd .balance-line small{color:var(--muted);font-size:11px}
.uhd .balance-line .btn{margin-left:auto}
.uhd.options .notice,.uhd.options .settings>*{width:100%;max-width:760px;margin-inline:auto}
.uhd.options>header{padding-inline:max(16px,calc((100% - 760px) / 2));border-bottom:1px solid var(--line)}
.uhd.options .settings{padding:10px 24px 32px;font-size:13px}
.uhd.options .settings .hint{font-size:12px}
.uhd .settings .top h1{flex:1;margin:0;font-size:18px}
.uhd .tags{display:flex;flex-wrap:wrap;gap:5px;margin:6px 0}
.uhd .tag{display:inline-flex;align-items:center;gap:4px;padding:2px 4px 2px 9px;border-radius:12px;background:var(--soft);color:var(--deep);font-size:12px}
.uhd[data-theme=dark] .tag{color:#7fd6cc}
.uhd .tag.auto{background:var(--grey-bg);color:var(--muted);padding-right:9px}
.uhd .tag button{border:0;background:none;cursor:pointer;color:inherit;padding:0 2px;line-height:1;font-size:14px}
.uhd .gz{display:flex;align-items:center;gap:8px;padding:4px 0;border-top:1px solid var(--line)}
.uhd .gz span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.uhd .status{padding:6px 12px 0;color:var(--muted);font-size:12px;border-top:1px solid var(--line);background:var(--card)}
.uhd .status.err{color:var(--red)}
.uhd .bar{height:4px;background:var(--line);border-radius:2px;margin-top:5px;overflow:hidden}
.uhd .bar i{display:block;height:100%;width:0;background:var(--navy);transition:width .3s}
.uhd footer{display:flex;flex-shrink:0;gap:6px;padding:8px 10px;background:var(--card);align-items:center;border-top:1px solid var(--line)}
.uhd footer .stx{flex:1;min-width:0;font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.uhd footer .stx.err{color:var(--red)}
.uhd .downloads-toggle{white-space:nowrap;padding:6px}
.uhd .download-area{flex:1;min-height:0;overflow:auto;padding:12px;overscroll-behavior:contain}
.uhd .download-back{margin-bottom:12px}
.uhd.downloads-open>.search,.uhd.downloads-open>.views,.uhd.downloads-open>.filters,.uhd.downloads-open>.notice,.uhd.downloads-open>.setup,.uhd.downloads-open>.results,.uhd.downloads-open>.settings,.uhd.downloads-open>.status,.uhd.downloads-open>footer{display:none!important}
.uhd .download-mini{flex:none;display:flex;align-items:center;gap:8px;width:100%;padding:9px 12px;border:0;border-top:1px solid var(--line);background:var(--soft);color:var(--text);text-align:left;cursor:pointer;font:inherit;font-size:12px}
.uhd .download-mini span{flex:1;min-width:0;overflow-wrap:anywhere}
.uhd .download-mini progress{width:64px;flex:none;height:8px;accent-color:var(--focus)}
.uhd .author-note{padding-top:10px;border-top:1px solid var(--line)}
.uhd button:disabled{opacity:.5;cursor:default}
.uhd :is(.client,.parties,.durrow .info){overflow-wrap:anywhere;min-width:0}
.uhd a{color:var(--accent-text)}
.uhd :is(input,select,textarea):focus-visible{outline:2px solid var(--focus);outline-offset:2px}
.uhd button,.uhd input,.uhd select,.uhd textarea{-webkit-tap-highlight-color:transparent}
@media(prefers-reduced-motion:reduce){.uhd *{transition:none!important;scroll-behavior:auto!important}}
@container (max-width:400px){.uhd .results{padding:8px}.uhd .view{font-size:11px}.uhd .ib{width:28px}.uhd header strong{font-size:13px}.uhd .settings-toggle{padding:5px 7px}}
@container (max-width:360px){.uhd .settings-toggle{font-size:0;gap:0}.uhd .view{gap:3px;padding:6px 4px}.uhd .view:not(.on):not(.ftoggle) small{display:none}}
`;

  // Basit çizgi simgeleri (24×24, stroke).
  const ICONS = {
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    note: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    hide: '<path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 4.2A10 10 0 0 1 12 4c7 0 10 8 10 8a17 17 0 0 1-3.2 4.3"/><path d="M6.6 6.6C3.8 8.4 2 12 2 12s3 8 10 8a9.7 9.7 0 0 0 5.4-1.6"/>',
    eye: '<path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    up: '<path d="M18 15l-6-6-6 6"/>',
    sync: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
    gear: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    theme: '<path d="M21 12.8A9 9 0 0 1 11.2 3 9 9 0 1 0 21 12.8Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    auto: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor"/>',
    filter: '<path d="M4 7h16M7 12h10M10 17h4"/>',
    back: '<path d="M15 18l-6-6 6-6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'
  };
  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = ICONS[name] || '';
    return svg;
  }

  // Mağaza görsellerindeki Legaluga logosunun özgün SVG'si (magaza/gorsel/logo.svg).
  function brandLogo() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'brand-mark');
    svg.setAttribute('viewBox', '0 0 32 32');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = `<rect width="32" height="32" rx="7" fill="#171717"/>
      <g fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 8v14h12"/><path d="M10 15l8.5-4.8"/>
      </g>
      <g fill="#ffffff">
        <circle cx="10" cy="8" r="2.5"/><circle cx="18.5" cy="10.2" r="2.5"/><circle cx="22" cy="22" r="2.5"/>
      </g>`;
    return svg;
  }

  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) e.append(k);
    return e;
  }

  function highlight(text, toks) {
    text = text == null ? '' : String(text);
    const frag = document.createDocumentFragment();
    if (!toks.length || !text) { frag.append(text); return frag; }
    const n = norm(text);
    const marks = new Uint8Array(text.length);
    for (const t of toks) {
      for (let i = n.indexOf(t); i !== -1; i = n.indexOf(t, i + t.length)) marks.fill(1, i, i + t.length);
    }
    for (let i = 0; i < text.length;) {
      let j = i;
      while (j < text.length && marks[j] === marks[i]) j++;
      const part = text.slice(i, j);
      frag.append(marks[i] ? el('mark', null, part) : part);
      i = j;
    }
    return frag;
  }

  function fmtAgo(ts) {
    const m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return 'az önce';
    if (m < 60) return `${m} dk önce`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} saat önce`;
    const d = Math.floor(h / 24);
    return d === 1 ? 'dün' : `${d} gün önce`;
  }


  function mountUI(container, opts) {
    // Kipler: 'page' UYAP sayfasındaki panel (tam çalışma yüzeyi); 'popup' UYAP dışında araç çubuğundan açılan hızlı bakış
    // (ara, aç; duruşma ve yeni evrak özeti paneli açar); 'options' ayrı sekmedeki Ayarlar sayfası.
    const quick = opts.mode === 'popup';
    const optionsPage = opts.mode === 'options';
    const guncelleYeri = quick || optionsPage ? 'UYAP’taki paneldeki Güncelle’ye' : 'Güncelle’ye';
    const input = el('input', { type: 'search', class: 'q', placeholder: 'Ad, soyad, dosya no, mahkeme veya not yazınız', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Dosya ara' });
    const btnQClear = el('button', { class: 'sbtn clear', title: 'Aramayı temizle', 'aria-label': 'Aramayı temizle', hidden: true }, icon('x'));
    const btnHelp = el('button', { class: 'sbtn help', title: 'Nerede aranır?', 'aria-label': 'Nerede aranır?' }, icon('help'));
    const views = el('nav', { class: 'views', 'aria-label': 'Görünümler' });
    const live = el('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
    const btnTheme = el('button', { class: 'ib', title: 'Temayı değiştir', 'aria-label': 'Temayı değiştir' }, icon('theme'));
    const filters = el('div', { class: 'filters' });
    const notice = el('div', { class: 'notice', hidden: true, role: 'status', 'aria-live': 'polite' });
    const list = el('div', { class: 'results', role: 'region', 'aria-label': 'Dosya sonuçları' });
    const settings = el('div', { class: 'settings', hidden: true });
    const setup = el('div', { class: 'setup', hidden: true, 'aria-label': 'İlk kurulum' });
    const barFill = el('i');
    const bar = el('div', { class: 'bar', hidden: true, role: 'progressbar', 'aria-label': 'Dosya güncelleme', 'aria-valuemin': '0', 'aria-valuemax': '100' }, barFill);
    const status = el('div', { class: 'status', hidden: true }, bar);
    const statusText = el('div', { class: 'stx' });
    const btnUpdate = el('button', { class: 'btn sm primary' }, icon('sync'), el('span', null, 'Güncelle'));
    const btnStop = el('button', { class: 'btn sm danger', hidden: true }, icon('stop'), el('span', null, 'Durdur'));
    const btnSettings = el('button', { class: 'btn sm settings-toggle', title: 'Ayarlar', 'aria-label': 'Ayarlar', 'aria-expanded': 'false' }, icon('gear'), 'Ayarlar');
    const hasDownloads = opts.mode === 'page' && opts.downloads && globalThis.UHDBulkPanel;
    const btnDownloads = hasDownloads ? el('button', { class: 'btn sm downloads-toggle', title: 'İndirmeleri göster', 'aria-label': 'İndirmeleri göster', 'aria-expanded': 'false' }, '↓') : null;
    const downloadArea = hasDownloads ? el('div', { class: 'download-area', hidden: true }) : null;
    const downloadText = el('span');
    const downloadProgress = el('progress', { max: 100, value: 0, 'aria-label': 'Diske kaydedilen evraklar' });
    const downloadMini = hasDownloads ? el('button', { class: 'download-mini', type: 'button', hidden: true, title: 'İndirmeleri göster' }, downloadText, downloadProgress) : null;
    const root = el('div', { class: 'uhd ' + (opts.mode || ''), lang: 'tr' },
      el('header', null, brandLogo(), el('strong', { title: BRAND.name }, BRAND.name), btnTheme, btnDownloads, btnSettings,
        opts.onClose ? el('button', { class: 'x', title: 'Kapat', 'aria-label': 'Paneli kapat', onclick: opts.onClose }, '×') : null),
      el('div', { class: 'search', hidden: optionsPage }, input, btnQClear, btnHelp),
      views, filters, notice, setup, list, settings, downloadArea, live, downloadMini, status,
      el('footer', { hidden: optionsPage }, statusText, btnStop, btnUpdate));
    if (optionsPage) { btnSettings.hidden = true; list.hidden = true; views.hidden = true; filters.hidden = true; }
    if (quick) {
      btnSettings.removeAttribute('aria-expanded');   // Ayarlar ayrı sekmede açılır
      btnSettings.title = 'Ayarlar (yeni sekmede)';
      views.setAttribute('aria-label', 'Özet');
    }
    container.append(el('style', null, CSS + (hasDownloads ? globalThis.UHDBulkPanel.CSS : '')), root);
    function showDownloads(on = true) {
      if (!hasDownloads) return;
      downloadArea.hidden = !on;
      root.classList.toggle('downloads-open', on);
      btnDownloads.classList.toggle('on', on);
      btnDownloads.setAttribute('aria-expanded', String(on));
      if (on) downloadArea.querySelector('h3')?.focus();
      else btnDownloads.focus();
    }
    if (hasDownloads) {
      downloadArea.append(el('button', { type: 'button', class: 'btn sm download-back', onclick: () => showDownloads(false) }, '‹ Dosyalara dön'));
      downloadArea.append(el('p', { class: 'hint' }, 'Dosya penceresini ve paneli kapatabilirsiniz. UYAP sayfası yenilenirse indirme yeniden bağlanır; kaydedilmiş ZIP parçaları tekrar indirilmez. Sekmeyi kapatırsanız dosyadan kaldığınız yerden devam edebilirsiniz.'));
      globalThis.UHDBulkPanel.mount(downloadArea, { manager: opts.downloads, openFile: opts.openDownload, showPart: opts.showDownloadPart });
      btnDownloads.addEventListener('click', () => showDownloads(downloadArea.hidden));
      downloadMini.addEventListener('click', () => showDownloads());
      opts.downloads.subscribe(states => {
        const active = states.filter(state => ['running', 'queued'].includes(state.status) || state.status === 'paused' && state.phase !== 'idle' && !state.persistentPending);
        const state = active.find(item => item.status === 'running') || active[0];
        downloadMini.hidden = !state;
        btnDownloads.textContent = active.length ? `↓ ${active.length}` : '↓';
        btnDownloads.title = active.length ? `İndirmeler: ${active.length} sürüyor veya sırada` : 'İndirmeleri göster';
        if (!state) return;
        const saved = Math.min(state.saved || 0, state.total || 0), total = state.total || 0;
        const phase = state.status === 'paused' ? 'Duraklatılıyor…' : { waiting: 'Sırada', fetching: 'Evraklar alınıyor', packing: 'ZIP hazırlanıyor', saving: 'Diske kaydediliyor' }[state.phase] || 'İndiriliyor';
        downloadText.textContent = `${state.rec?.dosyaNo || 'Dosya'} · ${phase} · ${saved.toLocaleString('tr-TR')}/${total.toLocaleString('tr-TR')} kaydedildi${state.inPart ? ` · ${state.inPart} evrak bu parçada` : ''}`;
        downloadProgress.value = total ? Math.floor(100 * saved / total) : 0;
      });
    }
    // Eklenti yenilendiğinde eski content script UYAP sekmesinde kalabilir.
    // Bu panelin depolama işlemlerini başlatmadan önce eski bağlamı durdur.
    const mountedRuntimeId = (() => { try { return chrome.runtime && chrome.runtime.id; } catch { return null; } })();
    if (opts.mode === 'page' && mountedRuntimeId) {
      const guardInvalidated = event => {
        let currentId;
        try { currentId = chrome.runtime && chrome.runtime.id; } catch { currentId = null; }
        if (currentId === mountedRuntimeId) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (opts.onInvalidated) opts.onInvalidated();
      };
      root.addEventListener('click', guardInvalidated, true);
      root.addEventListener('keydown', guardInvalidated, true);
    }

    let shortcut = '';
    const kisayolSatiri = el('span');
    const kisayolYaz = () => { kisayolSatiri.textContent = shortcut ? `Klavye kısayolu: ${shortcut}` : 'Klavye kısayolu atanmamış.'; };
    const kisayolOku = () => Promise.resolve().then(() => chrome.runtime.sendMessage({ type: 'uhd-shortcut' }))
      .then(r => { shortcut = (r && r.shortcut) || ''; kisayolYaz(); }).catch(() => {});
    kisayolOku();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) kisayolOku(); });

    let records = [];
    let meta = {};
    let progress = null;
    let stopping = false;      // Durdur'a basıldı; iş, süren istekler bitince durur
    let notes = {};
    let balances = {};
    let balanceRevision = 0;
    let recent = [];
    let prefs = {};
    let detected = '';
    let current = [];
    let sel = 0;
    let editing = null;        // notu düzenlenen kayıt
    const noteDrafts = new Map();
    let manualNotice = false;
    let goruldu = {};
    let gizli = {};            // aramada gösterilmeyecek dosyalar (uhdGizli): { key: { dosyaNo, birimAdi, at } }
    let allParties = new Set();// tüm tarafları gösterilen kartlar
    let pendingJob = null;     // yarıda kalmış güncelleme işi (uhdJob)
    let person = null;         // açık müvekkil kartı: { name }
    let filtersExpanded = false;
    const busy = new Map();    // açılmakta olan dosyalar: key → düğme yazısı ("Açılıyor · 2/4")
    let hearingRange = 'week';
    let shownLimit = LIMIT;
    let loaded = false;
    let loadFailed = false;
    let prefsRevision = 0;
    let setupOpen = false;
    let onboarding = null;
    let setupScanNoticeId = null;
    const dismissedNotices = new Set();
    let durusmaMeta = null;    // uhdDurusmalar: { at, gun, list }
    let durusmaByKey = new Map(); // kayıt key → yaklaşan duruşmalar (sıralı)
    let cakismalar = new Map();   // duruşma kimliği → çakıştığı duruşmalar (common.js durusmaCakismalari)
    let yeniMap = new Map();   // kayıt key → en yeni görülmemiş evrakın onay zamanı
    let yeniCount = 0;         // görülmemiş yeni evrak sayısı
    let evrakTracked = false;  // en az bir dosyanın evrakları tarandı mı
    const filter = { durum: 'all', tur: [], turPinned: true, onlyClient: false, onlyNew: false, onlyDurusma: false, cbsIl: '', cbsBirim: '', cbsIzin: '' };

    // Tema: ayar "auto" ise sistemin açık/koyu tercihine uyar.
    const darkMq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const TEMA = {
      auto: { ad: 'Sistemle aynı', simge: 'auto', sonraki: 'light', gecis: 'Sistemin temasına dön' },
      light: { ad: 'Açık', simge: 'sun', sonraki: 'dark', gecis: 'Açık temaya geç' },
      dark: { ad: 'Koyu', simge: 'theme', sonraki: 'auto', gecis: 'Koyu temaya geç' }
    };
    const temaAyari = () => (TEMA[prefs.tema] ? prefs.tema : 'auto');
    function applyTheme() {
      const t = temaAyari();
      root.dataset.theme = t === 'auto' ? (darkMq && darkMq.matches ? 'dark' : 'light') : t;
      const label = `Tema: ${TEMA[t].ad}. ${TEMA[TEMA[t].sonraki].gecis}`;
      btnTheme.title = label;
      btnTheme.setAttribute('aria-label', label);
      btnTheme.replaceChildren(icon(TEMA[t].simge));
    }
    if (darkMq && darkMq.addEventListener) darkMq.addEventListener('change', applyTheme);
    applyTheme();

    const pref = (k, d) => (prefs[k] === undefined ? d : prefs[k]);
    const cakismaTaramaAcik = () => pref('cakismaTarama', false) === true;
    async function setPref(k, v) {
      if (globalThis.UHDStorage) { prefs = await UHDStorage.patchPrefs({ [k]: v }); return; }
      const { uhdPrefs } = await chrome.storage.local.get('uhdPrefs');
      prefs = { ...(uhdPrefs || {}), [k]: v };
      await chrome.storage.local.set({ uhdPrefs: prefs });
    }

    function syncSetup() {
      if (!loaded || loadFailed || !globalThis.UHD.mountOnboarding) return false;
      const required = globalThis.UHD.kurulumGerekli(prefs, meta);
      if (required && !setupOpen) {
        setupOpen = true;
        setup.hidden = false;
        settings.hidden = true;
        list.hidden = true;
        views.hidden = true;
        filters.hidden = true;
        root.querySelector('.search').hidden = true;
        root.querySelector('footer').hidden = true;
        btnSettings.hidden = true;
        btnTheme.hidden = true;
        onboarding = globalThis.UHD.mountOnboarding(setup, {
          prefs,
          hasFiles: records.length > 0,
          onConnection: request => opts.onSetupConnection
            ? opts.onSetupConnection(request) : chrome.runtime.sendMessage({ type: 'uhd-setup-connection', ...request }),
          onOpenUyap: () => opts.onSetupOpenUyap
            ? opts.onSetupOpenUyap() : chrome.runtime.sendMessage({ type: 'uhd-setup-open' }),
          onComplete: async (saved, startScan) => {
            const completingPrefsRevision = prefsRevision;
            let completedPrefs = saved;
            let scan, scanStateRead = false;
            if (startScan) {
              scan = opts.onSetupScan ? await opts.onSetupScan(saved)
                : await chrome.runtime.sendMessage({ type: 'uhd-setup-scan' });
              if (!scan?.ok) throw new Error('Kurulum taraması kabul edilmedi');
              const previousJob = pendingJob, previousProgress = progress;
              try {
                const statePrefsRevision = prefsRevision;
                const latest = await chrome.storage.local.get(['uhdJob', 'uhdProgress', 'uhdPrefs']);
                scanStateRead = true;
                if (pendingJob === previousJob) pendingJob = latest.uhdJob || null;
                if (progress === previousProgress) progress = latest.uhdProgress || null;
                if (prefsRevision === statePrefsRevision && latest.uhdPrefs?.kurulumTamamlandi === true) completedPrefs = latest.uhdPrefs;
              } catch { /* İstek kabul edildi; durum okumasının hatası ikinci bir tarama başlatmaz. */ }
            }
            if (prefsRevision === completingPrefsRevision) prefs = completedPrefs;
            onboarding?.destroy?.();
            onboarding = null;
            syncSetup();
            applyTheme();
            if (optionsPage) openSettings(); else render();
            renderStatus();
            const waiting = pendingJob?.setupPending && !pendingJob.stop && (!scan?.id || scan.id === pendingJob.id);
            if (scan?.pending && (waiting || (!scanStateRead && !pendingJob && !running() && !progress?.endedAt))) {
              setNotice(progress?.error ? progress.text : 'Ayarlarınız kaydedildi. UYAP bağlantısı bekleniyor; giriş yaptığınızda seçtiğiniz dosyalar otomatik taranacak.', progress?.error ? 'err' : '',
                { label: 'UYAP’ı aç', fn: () => opts.onSetupOpenUyap ? opts.onSetupOpenUyap() : chrome.runtime.sendMessage({ type: 'uhd-setup-open' }) });
              setupScanNoticeId = pendingJob?.id || scan.id;
            } else setNotice(startScan ? (progress?.endedAt && progress.text || 'Seçtiğiniz dosyaların taraması başlatıldı.') : 'Kurulum tamamlandı. Dosyalarınızı taramak istediğinizde Güncelle’ye basabilirsiniz.');
          }
        });
        onboarding.focus();
      } else if (!required && setupOpen && !onboarding?.isSaving?.()) {
        setupOpen = false;
        setup.hidden = true;
        onboarding?.destroy?.();
        setup.replaceChildren();
        onboarding = null;
        root.querySelector('.search').hidden = optionsPage;
        root.querySelector('footer').hidden = optionsPage;
        btnSettings.hidden = optionsPage;
        btnTheme.hidden = false;
        list.hidden = optionsPage;
        if (optionsPage) openSettings();
      }
      return setupOpen;
    }

    function syncSetupScanNotice() {
      if (!setupScanNoticeId) return;
      if (pendingJob?.id === setupScanNoticeId && pendingJob.setupPending && !pendingJob.stop) {
        if (progress?.error && progress.text) {
          const id = setupScanNoticeId;
          setNotice(progress.text, 'err', { label: 'UYAP’ı aç', fn: () => opts.onSetupOpenUyap ? opts.onSetupOpenUyap() : chrome.runtime.sendMessage({ type: 'uhd-setup-open' }) });
          setupScanNoticeId = id;
        }
        return;
      }
      setNotice(running() ? 'Seçtiğiniz dosyaların taraması başlatıldı.' : progress?.text || 'İlk tarama durumu güncellendi.');
    }

    const myNames = () => String(prefs.myName || '').split(/[,;]/).map(x => x.trim()).filter(Boolean);
    const myName = () => myNames().join(', ') || detected;
    const running = () => !!(progress && progress.running && Date.now() - (progress.beat || 0) < RUN_STALE_MS);

    function setIndex(ix) {
      records = (ix && ix.records) || [];
      meta = ix || {};
      detected = detectMyName(records);
      computeYeni();
    }

    function computeYeni() {
      yeniMap = new Map();
      yeniCount = 0;
      evrakTracked = false;
      for (const r of records) {
        if (r.evrakSeen) evrakTracked = true;
        const u = unseenEvrak(r, goruldu);
        if (!u.length) continue;
        yeniCount += u.length;
        yeniMap.set(r.key, Math.max(...u.map(y => trDateTs(y.onay))) || 1);
      }
    }

    // ------------------------------------------------ bildirim

    function showNotice(text, kind, action, noticeKey) {
      notice.replaceChildren();
      if (!text || (noticeKey && dismissedNotices.has(noticeKey))) { notice.hidden = true; return; }
      notice.className = 'notice' + (kind === 'err' ? ' err' : '');
      notice.append(el('span', null, text));
      if (action) notice.append(el('button', { onclick: action.fn }, action.label));
      const dismiss = el('button', { class: 'dismiss', title: 'Bildirimi kapat', 'aria-label': 'Bildirimi kapat' }, '×');
      dismiss.addEventListener('click', () => {
        if (noticeKey) dismissedNotices.add(noticeKey);
        manualNotice = false;
        setupScanNoticeId = null;
        notice.hidden = true;
        input.focus();
      });
      notice.append(dismiss);
      notice.hidden = false;
    }

    function setNotice(text, kind, action) {
      setupScanNoticeId = null;
      manualNotice = !!text;
      if (text) showNotice(text, kind, action);
      else autoNotice();
    }

    function autoNotice() {
      if (manualNotice) return;
      // Hızlı bakışta duruşma ve yeni evrak üstteki özet satırında, son güncelleme alt şeritte görünür.
      if (quick || optionsPage) return showNotice('');
      if (filter.onlyDurusma || filter.onlyNew || person || !settings.hidden) return showNotice('');
      // Duruşma çakışması: kapatılınca aynı çakışmalar için yeniden çıkmaz; yeni çakışma eklenirse yeniden çıkar.
      const cakisan = upcomingDurusmalar(durusmaMeta && durusmaMeta.list).filter(d => cakismalar.has(d.id));
      const cakKey = 'cakisma:' + cakisan.map(d => d.id).join(',');
      if (cakismaTaramaAcik() && pref('cakismaBildirim', true) && records.length && cakisan.length && !dismissedNotices.has(cakKey)) {
        const ilk = cakisan[0], c = cakismalar.get(ilk.id)[0];
        const n = daysLeft(ilk.tarih);
        const gun = n === 0 ? 'bugün' : n === 1 ? 'yarın' : fmtIso(ilk.tarih, true);
        const text = `Duruşma çakışması: ${gun} ${ilk.saat} ${cleanBirim(ilk.birimAdi)} ile ${c.d.saat} ${cleanBirim(c.d.birimAdi)} (${cakismaAraligi(c)}).`
          + (cakisan.length > 2 ? ` Toplam ${fmtNum(cakisan.length)} duruşma çakışıyor.` : '');
        return showNotice(text, '', { label: 'Göster', fn: () => showDurusmalar('cakisma') }, cakKey);
      }
      const yakinDur = upcomingDurusmalar(durusmaMeta && durusmaMeta.list).filter(d => daysLeft(d.tarih) <= 1);
      if (pref('durusmaBildirim', true) && records.length && yakinDur.length && !filter.onlyDurusma) {
        const bugun = yakinDur.filter(d => daysLeft(d.tarih) === 0);
        const ilk = (bugun[0] || yakinDur[0]);
        const text = bugun.length
          ? `Bugün ${bugun.length} duruşmanız var; ilki ${ilk.saat}, ${ilk.dosyaNo} ${ilk.birimAdi}.`
          : `Yarın ${yakinDur.length} duruşmanız var; ilki ${ilk.saat}, ${ilk.dosyaNo} ${ilk.birimAdi}.`;
        return showNotice(text, '', { label: 'Göster', fn: () => showDurusmalar() }, 'hearings:' + todayIso());
      }
      const update = { label: 'Güncelle', fn: () => { setNotice(''); opts.onUpdate(false); } };
      if (!records.length || running()) return showNotice('');
      const oldParties = records.filter(r => r.taraflar && r.tarafV !== TARAF_V).length;
      if (oldParties) return showNotice(`Müvekkil ve vekil bilgisi için bir kez Güncelle’ye basın (${fmtNum(oldParties)} dosyanın tarafları yenilenecek).`, '', update, 'parties:' + oldParties);
      const days = meta.updatedAt ? Math.floor((Date.now() - meta.updatedAt) / 86400000) : 0;
      if (days >= REMIND_DAYS) return showNotice(`Son güncelleme ${days} gün önce yapıldı. Yeni dosyalar için güncellemeniz önerilir.`, '', update, 'update:' + meta.updatedAt);
      if (yeniMap.size && !filter.onlyNew) {
        return showNotice(`${fmtNum(yeniMap.size)} dosyada ${fmtNum(yeniCount)} yeni evrak var.`, '', {
          label: 'Göster', fn: () => { input.value = ''; switchView('new'); }
        }, 'new:' + yeniCount);
      }
      showNotice('');
    }

    // ------------------------------------------------ filtreler

    const CHIPS = [
      { group: 'durum', v: 'acik', label: 'Açık' },
      { group: 'durum', v: 'kapali', label: 'Kapalı' },
      { group: 'tur', v: '0', label: 'Ceza' },
      { group: 'tur', v: '1', label: 'Hukuk' },
      { group: 'tur', v: '2', label: 'İcra' },
      { group: 'tur', v: '3', label: 'Savcılık', title: 'Cumhuriyet başsavcılıklarındaki soruşturma dosyaları' },
      { group: 'tur', v: 'other', label: 'Diğer', title: 'İdari Yargı, Satış Memurluğu, Arabuluculuk, Tazminat Komisyonu' },
      { group: 'onlyClient', v: true, label: 'Yalnız müvekkillerim', title: 'Yalnızca müvekkil adlarında ara', cls: 'client' }
    ];
    // Seçili yargı türleri her zaman uygulanır. Sabitle açıksa seçim saklanır (sonraki açılışta ve öteki pencerede geçerli);
    // kapalıysa yalnız bu açılışta kalır, depoya boş seçim yazılır.
    const hasTurFilter = () => filter.tur.length > 0;
    const cbsOnly = () => filter.tur.length === 1 && filter.tur[0] === '3';
    let turWriteQueue = Promise.resolve(), pendingTurWrites = 0, turFilterRevision = 0;
    function saveTurFilter() {
      const value = filter.turPinned ? { tur: [...filter.tur], pinned: true } : { tur: [], pinned: false };
      pendingTurWrites++;
      turWriteQueue = turWriteQueue.then(() => chrome.storage.local.set({ uhdTurFilter: value }))
        .catch(() => setNotice('Yargı türü seçimi kaydedilemedi. Tekrar deneyin.', 'err'))
        .finally(() => { pendingTurWrites--; });
      return turWriteQueue;
    }
    function readTurFilter(value) {
      const allowed = CHIPS.filter(c => c.group === 'tur').map(c => c.v);
      // Sabitle kapalıyken saklanan seçim (önceki sürümler yazıyordu) açılışta uygulanmaz.
      filter.tur = value?.pinned === false ? [] : [...new Set((Array.isArray(value?.tur) ? value.tur : []).filter(t => allowed.includes(t)))];
      filter.turPinned = value?.pinned !== false;
      if (cbsOnly()) filter.onlyClient = false;
    }
    const viewName = () => filter.onlyDurusma ? 'hearings' : filter.onlyNew ? 'new' : 'files';
    const activeFilterCount = () => (filter.durum !== 'all' ? 1 : 0) + filter.tur.length + (filter.onlyClient ? 1 : 0)
      + (cbsOnly() ? (filter.cbsIl ? 1 : 0) + (filter.cbsBirim ? 1 : 0) + (filter.cbsIzin && filter.cbsIzin !== 'all' ? 1 : 0) : 0);
    function clearFilters() {
      filter.durum = 'all'; filter.tur = []; filter.onlyClient = false;
      filter.cbsIl = ''; filter.cbsBirim = ''; filter.cbsIzin = '';
      filter.turPinned = true;
      saveTurFilter();
      shownLimit = LIMIT;
    }
    function switchView(name) {
      person = null;
      editing = null;
      filter.onlyDurusma = name === 'hearings';
      filter.onlyNew = name === 'new';
      sel = 0; shownLimit = LIMIT;
      if (!settings.hidden) closeSettings();
      renderFilters(); render(); autoNotice();
      list.scrollTop = 0;
    }
    // Hızlı bakışın özet satırı: bugünkü (yoksa bu haftaki) duruşmalar ve yeni evraklı dosyalar. Basınca UYAP'taki panel
    // o görünümde açılır.
    let ozetTur = [];   // hızlı bakış: paneldeki sabit yargı türü seçimi (liste için değil, yalnız sayım için)
    function renderOzet() {
      views.replaceChildren();
      if (!records.length && !durusmaMeta) return;
      const dur = upcomingDurusmalar(durusmaMeta && durusmaMeta.list);
      const bugun = dur.filter(d => daysLeft(d.tarih) === 0).length;
      const hafta = dur.filter(d => daysLeft(d.tarih) < 7).length;
      const yeniDosya = records.filter(r => !gizli[r.key] && yeniMap.has(r.key) && passFilter(r, { ...filter, tur: ozetTur })).length;
      const chip = (text, view, title) => {
        const b = el('button', { class: 'view ozet', 'data-view': view, title }, text);
        b.addEventListener('click', () => opts.onView(view));
        return b;
      };
      if (hafta) views.append(bugun ? chip(`Bugün ${fmtNum(bugun)} duruşma`, 'hearings-today', 'Bugünkü duruşmaları UYAP’taki panelde aç')
        : chip(`7 günde ${fmtNum(hafta)} duruşma`, 'hearings', 'Önümüzdeki 7 günün duruşmalarını UYAP’taki panelde aç'));
      const cakisan = dur.filter(d => cakismalar.has(d.id)).length;
      if (cakisan) views.append(chip(`${fmtNum(cakisan)} duruşma çakışıyor`, 'hearings-cakisma', 'Çakışan duruşmaları UYAP’taki panelde aç'));
      if (yeniDosya) views.append(chip(`${fmtNum(yeniDosya)} dosyada yeni evrak`, 'new', 'Yeni evrakları UYAP’taki panelde aç'));
    }
    function renderViews() {
      if (quick) return renderOzet();
      views.replaceChildren();
      const active = viewName();
      // Sayaçlar listenin gösterdiğini sayar: gizlenen dosyalar hariç ve seçili filtrelerle; duruşmalar seçili aralıkta.
      const mk = filter.onlyClient ? myKeys(myName()) : [];
      const gorunur = records.filter(r => !gizli[r.key] && passFilter(r, filter) && (!filter.onlyClient || (r.taraflar || []).some(p => isClient(p, mk))));
      const durSay = upcomingDurusmalar(durusmaMeta && durusmaMeta.list)
        .filter(d => (hearingRange === 'cakisma' ? cakismalar.has(d.id) : hearingRange === 'all' || daysLeft(d.tarih) < (hearingRange === 'today' ? 1 : 7))).length;
      for (const [name, title, total] of [
        ['files', 'Dosyalarım', gorunur.length],
        ['hearings', 'Duruşmalarım', durSay],
        ['new', 'Yeni evrak', gorunur.filter(r => yeniMap.has(r.key)).length]
      ]) {
        const b = el('button', { class: 'view' + (name === active ? ' on' : ''), 'aria-pressed': String(name === active), 'data-view': name },
          title, total ? el('small', { 'aria-label': fmtNum(total) + ' kayıt' }, fmtNum(total)) : null);
        b.addEventListener('click', () => {
          switchView(name);
          views.querySelector(`[data-view="${name}"]`).focus();
        });
        views.append(b);
      }
      // Filtreler sekme satırının sağında: seçili filtre sayısı rozette. Filtre yokken ayrı satır kaplamaz.
      if (active !== 'hearings' && records.length) {
        const n = activeFilterCount();
        const ft = el('button', { class: 'view ftoggle', 'data-view': 'filtreler', 'aria-expanded': String(filtersExpanded),
          title: n ? `Filtreler (${n} seçili)` : 'Filtreler', 'aria-label': n ? `Filtreler, ${n} seçili` : 'Filtreler' },
          icon('filter'), n ? el('small', null, fmtNum(n)) : null);
        ft.addEventListener('click', () => {
          filtersExpanded = !filtersExpanded;
          renderFilters();
          views.querySelector('[data-view="filtreler"]').focus();
        });
        views.append(ft);
      }
      input.placeholder = active === 'hearings' ? 'Duruşmalarda kişi, dosya veya mahkeme ara'
        : cbsOnly() ? 'Soruşturma no, başsavcılık veya not ara' : 'Ad, dosya no, mahkeme veya not ara';
      input.setAttribute('aria-label', active === 'hearings' ? 'Duruşmalarda ara' : 'Dosyalarda ara');
    }
    function renderCbsFilters() {
      const cbs = records.filter(r => r.yargiTuru === CBS.kod && !gizli[r.key]);
      const iller = new Map(), birimler = new Map();
      for (const r of cbs) {
        if (r.ilKodu) iller.set(String(r.ilKodu), ilAdi(r.ilAdi || ILLER[Number(r.ilKodu) - 1] || `İl ${r.ilKodu}`));
      }
      if (filter.cbsIl && !iller.has(filter.cbsIl)) filter.cbsIl = '';
      for (const r of cbs) if (r.birimTuru2 && (!filter.cbsIl || String(r.ilKodu) === filter.cbsIl)) birimler.set(r.birimTuru2, cleanBirim(r.birimTuruAdi || r.birimAdi));
      if (filter.cbsBirim && !birimler.has(filter.cbsBirim)) filter.cbsBirim = '';
      const secim = (key, label, allLabel, entries) => {
        const select = el('select', { class: 'sort', 'aria-label': label, 'data-filter': key },
          el('option', { value: '' }, allLabel),
          [...entries].sort((a, b) => a[1].localeCompare(b[1], 'tr')).map(([value, text]) => el('option', { value }, text)));
        select.value = filter[key] || '';
        select.addEventListener('change', () => {
          filter[key] = select.value;
          if (key === 'cbsIl') filter.cbsBirim = '';
          sel = 0; shownLimit = LIMIT;
          renderFilters(); render(); list.scrollTop = 0;
          filters.querySelector(`[data-filter="${key}"]`)?.focus();
        });
        return el('label', null, label, select);
      };
      const izin = new Map([['izinli', 'İnceleme izni var'], ['bekliyor', 'İnceleme izni yok']]);
      const box = el('div', { class: 'cbs-filters', role: 'group', 'aria-label': 'Savcılık dosyalarını daralt' },
        secim('cbsIl', 'İl', 'Tüm iller', iller),
        secim('cbsBirim', 'Başsavcılık', 'Tüm başsavcılıklar', birimler),
        secim('cbsIzin', 'Evrak inceleme izni', 'Tüm izin durumları', izin),
        el('div', { class: 'hint' }, 'Soruşturma numarasını yukarıya yazın (ör. 2026/123). Listede bulamadığınız il için Ayarlar → Savcılık dosyaları bölümünden il ekleyip Güncelle’ye basın.'));
      filters.append(box);
    }
    function renderFilters() {
      renderViews();
      filters.replaceChildren();
      if (filter.onlyDurusma) return;
      const selected = c => c.group === 'tur' ? filter.tur.includes(c.v) : filter[c.group] === c.v;
      const active = CHIPS.filter(selected);
      // Filtre yokken ve kapalıyken satır çizilmez (düğmesi sekme satırında); seçili filtre varsa özeti görünür.
      if (!filtersExpanded && !active.length) return;
      const top = el('div', { class: 'filter-top' },
        el('span', { class: 'filter-summary', title: active.map(c => c.label).join(' · ') }, active.length ? 'Filtre: ' + active.map(c => c.label).join(' · ') : 'Filtre seçilmedi'));
      if (filter.tur.length) {
        const pin = el('input', { type: 'checkbox', 'data-filter': 'tur:pin', 'aria-label': 'Seçilen yargı türlerini sabitle' });
        pin.checked = filter.turPinned;
        pin.addEventListener('change', () => {
          filter.turPinned = pin.checked;
          saveTurFilter(); sel = 0; shownLimit = LIMIT;
          renderFilters(); render(); list.scrollTop = 0;
          filters.querySelector('[data-filter="tur:pin"]').focus();
        });
        top.append(el('label', { class: 'filter-pin', title: 'Seçilen yargı türlerini sonraki açılışlarda da uygula' }, pin, 'Sabitle'));
      }
      if (active.length || filter.tur.length) {
        const reset = el('button', { class: 'btn sm', title: 'Seçili filtrelerin hepsini kaldırır' }, 'Filtreleri kaldır');
        reset.addEventListener('click', () => { clearFilters(); sel = 0; renderFilters(); render(); (filters.querySelector('button') || input).focus(); });
        top.append(reset);
      }
      filters.append(top);
      if (cbsOnly()) renderCbsFilters();
      if (!filtersExpanded) return;
      const body = el('div', { class: 'filter-body' });
      for (const [group, label] of [['durum', 'Durum'], ['tur', 'Yargı'], ['onlyClient', 'Taraf']]) {
        const row = el('div', { class: 'frow', role: 'group', 'aria-label': label }, el('span', { class: 'lbl' }, label));
        if (group === 'tur') {
          const all = el('button', { class: 'chip' + (!filter.tur.length ? ' on' : ''), 'aria-pressed': String(!filter.tur.length), 'data-filter': 'tur:all', title: 'Tüm yargı türlerinde ara' }, 'Tümü');
          all.addEventListener('click', () => {
            filter.tur = []; saveTurFilter(); sel = 0; shownLimit = LIMIT;
            renderFilters(); render(); list.scrollTop = 0;
            filters.querySelector('[data-filter="tur:all"]').focus();
          });
          row.append(all);
        }
        for (const c of CHIPS.filter(c => c.group === group)) {
          const on = selected(c);
          const b = el('button', { class: 'chip' + (on ? ' on' : ''), 'aria-pressed': String(on), 'data-filter': c.group + ':' + c.v, title: c.title || null }, c.label);
          if (c.group === 'onlyClient' && cbsOnly()) { b.disabled = true; b.title = 'UYAP savcılık dosyalarında taraf bilgisi vermiyor.'; }
          b.addEventListener('click', () => {
            if (c.group === 'onlyClient' && !on && !myKeys(myName()).length) {
              return setNotice('Müvekkilleri ayırmak için Ayarlar’dan vekil adınızı ekleyin.', '', { label: 'Ayarlar', fn: openSettings });
            }
            if (c.group === 'tur') {
              filter.tur = on ? filter.tur.filter(t => t !== c.v) : [...filter.tur, c.v];
              if (cbsOnly()) filter.onlyClient = false;
              saveTurFilter();
            }
            else filter[c.group] = on ? (c.group === 'onlyClient' ? false : 'all') : c.v;
            sel = 0; shownLimit = LIMIT;
            renderFilters(); render(); list.scrollTop = 0;
            filters.querySelector(`[data-filter="${c.group}:${c.v}"]`).focus();
          });
          row.append(b);
        }
        body.append(row);
      }
      filters.append(body);
    }

    // ------------------------------------------------ sonuç satırı

    // Taraf adı: tıklanınca o kişinin tüm dosyaları (müvekkil kartı) açılır. Adlar baş harfleri büyük gösterilir.
    function nameBtn(name, toks) {
      const b = el('button', { class: 'pname', title: `${trTitle(name)}: tüm dosyaları göster` }, highlight(trTitle(name), toks));
      b.addEventListener('click', e => { e.stopPropagation(); openPerson(name); });
      return b;
    }

    function partyLines(r, toks, keys) {
      const out = [];
      if (r.yargiTuru === CBS.kod) return [el('div', { class: 'parties' }, el('em', null, 'UYAP savcılık dosyalarında taraf bilgisi vermez'))];
      if (!r.taraflar) return [el('div', { class: 'parties' }, el('em', null, 'Taraf bilgisi henüz alınmadı'))];
      if (!r.taraflar.length) return [el('div', { class: 'parties' }, el('em', null, 'Taraf kaydı yok'))];
      const clients = r.taraflar.filter(p => isClient(p, keys));
      const others = r.taraflar.filter(p => !isClient(p, keys));
      if (clients.length) {
        const line = el('div', { class: 'client' }, 'Müvekkil: ');
        clients.forEach((p, i) => {
          if (i) line.append(', ');
          line.append(el('b', null, nameBtn(p.adi, toks)), p.rol ? ` (${p.rol})` : '');
        });
        out.push(line);
      }
      if (others.length) {
        const showAll = allParties.has(r.key);
        const box = el('div', { class: 'parties' + (showAll ? ' all' : '') });
        const groups = new Map();
        for (const p of others) {
          const k = p.rol || 'Taraf';
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k).push(p);
        }
        let first = true;
        for (const [rol, ps] of groups) {
          if (!first) box.append(' · ');
          first = false;
          box.append(el('span', { class: 'rol' }, rol + ': '));
          ps.forEach((p, i) => {
            if (i) box.append(', ');
            box.append(nameBtn(p.adi, toks));
            const vek = (p.vekil || [])
              .filter(v => !keys.some(m => nameKey(v).includes(m)))
              .map(v => trTitle(v.replace(/^av\.?\s+/i, '')));
            if (vek.length) box.append(el('span', { class: 'vek' }, ' (Av. ', highlight(vek.join(', '), toks), ')'));
          });
        }
        out.push(box);
      }
      if (allParties.has(r.key)) {
        const less = el('button', { class: 'pmore', 'data-focus': 'pmore', 'aria-expanded': 'true' }, 'Daha az göster');
        less.addEventListener('click', e => { e.stopPropagation(); allParties.delete(r.key); render(); });
        out.push(less);
      }
      return out;
    }

    // Kartta taraflar tek satırdır: müvekkiller ve aramanın eşleştiği karşı taraf (eşleşme yoksa ilk karşı taraf).
    // "+N" tüm tarafları ve vekilleri açar.
    function partyBlock(r, toks, keys) {
      if (!r.taraflar || !r.taraflar.length || allParties.has(r.key)) return partyLines(r, toks, keys);
      const clients = r.taraflar.filter(p => isClient(p, keys));
      const others = r.taraflar.filter(p => !isClient(p, keys));
      const hit = p => toks.some(t => norm(p.adi).includes(t) || (p.vekil || []).some(v => norm(v).includes(t)));
      const shown = toks.length ? others.filter(hit) : [];
      if (!shown.length && others.length) shown.push(others[0]);
      const line = el('span', { class: 'pline' });
      if (clients.length) {
        line.append(el('span', { class: 'rol' }, 'Müvekkil: '));
        clients.forEach((p, i) => {
          if (i) line.append(', ');
          const b = nameBtn(p.adi, toks);
          b.classList.add('mv');
          if (p.rol) b.title = `${trTitle(p.adi)} (${p.rol}): tüm dosyaları göster`;
          line.append(b);
        });
      }
      shown.forEach((p, i) => {
        if (clients.length || i) line.append(' · ');
        line.append(el('span', { class: 'rol' }, `${p.rol || 'Taraf'}: `), nameBtn(p.adi, toks));
      });
      const rest = r.taraflar.length - clients.length - shown.length;
      const hasVekil = others.some(p => (p.vekil || []).some(v => !keys.some(m => nameKey(v).includes(m))));
      let more = null;
      if (rest > 0 || hasVekil) {
        more = el('button', { class: 'pmore', 'data-focus': 'pmore', 'aria-expanded': 'false', title: 'Tüm tarafları ve vekilleri göster' }, rest > 0 ? `+${fmtNum(rest)}` : 'Vekiller');
        more.addEventListener('click', e => { e.stopPropagation(); allParties.add(r.key); render(); });
      }
      return el('div', { class: 'prow' }, line, more);
    }

    // Kart ve dosya ekranı aynı notu kullanır; taslaklar yalnız açık panelin belleğinde tutulur.
    function noteBlock(r, toks = []) {
      const draft = noteDrafts.get(r.key);
      const has = !!notes[r.key];
      if (!has && !draft && editing !== r.key) return null;
      if (editing !== r.key) {
        const line = el('button', { class: 'note-line', 'data-focus': 'noteline', title: draft ? 'Kaydedilmemiş not · düzenlemek için tıklayın' : 'Kişisel not · düzenlemek için tıklayın' }, ...globalThis.UHD.noteDisplay(draft ? draft.text : notes[r.key], text => highlight(text, toks)));
        line.addEventListener('click', e => { e.stopPropagation(); editing = r.key; render(); });
        return draft ? el('div', null, line, el('div', { class: 'note-status err' }, 'Kaydedilmedi')) : line;
      }
      const state = draft || { text: notes[r.key] || '', base: notes[r.key] || '', saving: null, error: false };
      noteDrafts.set(r.key, state);
      state.rich?.destroy?.();
      const field = globalThis.UHD.noteEditor({ value: state.text, label: r.dosyaNo + ' kişisel notu', placeholder: 'Dosya notunuzu yazın…', compact: true });
      state.rich = field;
      const ta = field.input;
      ta.classList.add('note-ta');
      ta.setAttribute('data-focus', 'noteline');
      const save = el('button', { type: 'button', class: 'btn sm primary', 'data-focus': 'notesave' }, 'Kaydet');
      const cancel = el('button', { type: 'button', class: 'btn sm', 'data-focus': 'notecancel' }, 'Vazgeç');
      const status = el('div', { class: 'note-status', role: 'status', 'aria-live': 'polite' });
      const editor = el('div', { class: 'note-card-editor' }, field.root,
        el('div', { class: 'note-actions' }, save, cancel, el('span', { class: 'note-hint' }, 'Ctrl/⌘ + Enter ile kaydet')), status);
      state.editor = editor;
      const sync = () => {
        ta.disabled = !!state.saving;
        save.disabled = !!state.saving || (!state.error && state.text.trim() === state.base);
        cancel.disabled = !!state.saving;
        status.classList.toggle('err', state.error);
        status.textContent = state.saving ? 'Kaydediliyor…' : state.error ? 'Kaydedilemedi. Yeniden deneyin.' : state.text.trim() !== state.base ? 'Kaydedilmedi' : '';
      };
      const fit = () => {
        ta.style.height = 'auto';
        if (!ta.isConnected || !ta.scrollHeight) { ta.style.height = ''; return; }
        ta.style.height = Math.min(ta.scrollHeight + 2, 240) + 'px';
      };
      let finished = false;
      const discard = () => {
        if (state.editor !== editor || finished || state.saving) return;
        finished = true;
        state.rich?.destroy?.();
        noteDrafts.delete(r.key);
        if (editing === r.key) editing = null;
        render();
      };
      const done = () => {
        if (state.editor !== editor || finished || state.saving) return state.saving;
        state.text = ta.value;
        if (state.text.trim() === state.base && !state.error) { discard(); return; }
        state.error = false;
        // saveNote çizimi iyimser olarak yeniler; yeni düzenleyici aynı taslağı ve kayıt durumunu kullanır.
        state.saving = true;
        sync();
        const pending = saveNote(r.key, state.text).then(() => {
          if (noteDrafts.get(r.key) !== state) return;
          state.rich?.destroy?.();
          noteDrafts.delete(r.key);
          if (editing === r.key) editing = null;
          finished = true;
          render();
        }).catch(() => {
          if (noteDrafts.get(r.key) !== state) return;
          state.saving = null;
          state.error = true;
          if (!editing) editing = r.key;
          render();
        });
        state.saving = pending;
        return pending;
      };
      const leave = ev => { if (!field.owns(ev.relatedTarget) && !editor.contains(ev.relatedTarget)) return done(); };
      editor.addEventListener('click', e => e.stopPropagation());
      editor.addEventListener('mousedown', e => e.stopPropagation());
      editor.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); discard(); if (!state.saving) input.focus(); }
      });
      ta.addEventListener('focus', () => { editing = r.key; fit(); });
      ta.addEventListener('input', () => {
        if (state.editor !== editor || state.saving) return;
        state.text = ta.value; state.error = false; fit(); sync();
      });
      ta.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); discard(); if (!state.saving) input.focus(); }
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing) { e.preventDefault(); done(); }
      });
      for (const control of [save, cancel, ...field.toolbar.querySelectorAll('button')]) {
        control.addEventListener('mousedown', e => { e.preventDefault(); });
        control.addEventListener('blur', leave);
      }
      save.addEventListener('click', done);
      cancel.addEventListener('click', discard);
      ta.addEventListener('blur', leave);
      sync();
      setTimeout(() => { fit(); if (editing === r.key && !state.saving) field.focus(); }, 0);
      return editor;
    }

    // Evrak "2024/555(Talimat Dosyası)" gibi bağlı bir dosyadansa hangi dosya olduğu gösterilir.
    function evrakDosya(r, g) {
      if (!g || g.startsWith(r.dosyaNo + '(')) return '';
      const m = /^(.+?)\((.+)\)$/.exec(g);
      return m ? `${m[2]} ${m[1]}` : g;
    }

    const expandedEvrak = new Set();

    // Dosya ekranının "Yeni" grubu: karttaki görülmemiş evraklar.
    // kadar: listedeki en geç bulunan evrakın zamanı; "görüldü say" yalnız ona kadar olanları işaretler (ekran açıkken
    // güncellemeyle gelen evrak yeni kalır).
    const yeniBaglam = r => {
      const u = unseenEvrak(r, goruldu);
      return u.length ? { ad: 'yeni', liste: u.map(y => ({ k: y.k, dosya: y.dosya || '' })), kadar: Math.max(...u.map(y => y.at || 0)) } : null;
    };

    function evrakBlock(r, toks) {
      const u = unseenEvrak(r, goruldu);
      if (!u.length) return null;
      const seenBtn = el('button', { class: 'btn sm', 'data-focus': 'seen', title: 'Bu dosyadaki yeni evrakları görüldü say', 'aria-label': 'Yeni evrakları görüldü say' }, icon('check'));
      seenBtn.addEventListener('click', e => { e.stopPropagation(); markSeen([r.key]); });
      // Görüntüleyicide Önceki/Sonraki bu kartın yeni evrakları arasında gezer (gösterilmeyenler dahil).
      const baglam = { ad: 'yeni', liste: u.map(y => ({ k: y.k, dosya: y.dosya || '' })) };
      const makeLine = y => {
        // UYAP listeyi onay tarihine göre sıralar; sisteme gönderim tarihi farklıysa o da yazılır.
        const tarih = y.gonderim && y.gonderim !== y.onay ? `Onay ${fmtTrDate(y.onay)} (sisteme gönderim ${fmtTrDate(y.gonderim)})` : `Onay ${fmtTrDate(y.onay)}`;
        const alt = [y.gonderen, evrakDosya(r, y.dosya), y.aciklama].filter(Boolean).join(' · ');
        return el('li', { title: [y.tur, tarih, y.gonderen, evrakDosya(r, y.dosya), y.aciklama].filter(Boolean).join('\n') },
          el('b', null, y.tur || 'Evrak'), ' · ', tarih,
          ' ', evrakOpenBtn(r, y.k, y.dosya, baglam),
          alt ? el('div', null, el('small', null, highlight(alt, toks))) : null);
      };
      if (!expandedEvrak.has(r.key)) {
        // Kapalıyken yalnız en yeni evrak ve sayısı: "4 yeni evrak · son: Bilirkişi Raporu 28.09.2026 [Aç] [Tümü (4)]".
        const y = u.reduce((a, b) => (trDateTs(b.onay) > trDateTs(a.onay) ? b : a));
        const tumu = u.length > 1 ? el('button', { class: 'evrak-more', 'data-focus': 'evrakmore', 'aria-expanded': 'false', title: 'Bütün yeni evrakları listele' }, `Tümü (${fmtNum(u.length)})`) : null;
        if (tumu) tumu.addEventListener('click', e => { e.stopPropagation(); expandedEvrak.add(r.key); render(); });
        return el('div', { class: 'evrak compact', onclick: e => e.stopPropagation(), title: [y.tur, `Onay ${fmtTrDate(y.onay)}`, y.gonderen, evrakDosya(r, y.dosya), y.aciklama].filter(Boolean).join('\n') },
          el('span', { class: 'ev-sum' }, el('b', null, `${fmtNum(u.length)} yeni evrak`), ' · ', u.length > 1 ? 'son: ' : '', highlight(y.tur || 'Evrak', toks), ' ', el('small', null, fmtTrDate(y.onay).replace(/\s.*$/, ''))),
          evrakOpenBtn(r, y.k, y.dosya, baglam), tumu, seenBtn);
      }
      // Açıkken bütün yeni evraklar listelenir; "Daha az" tek satıra döner.
      const less = el('button', { class: 'evrak-more', 'data-focus': 'evrakmore', 'aria-expanded': 'true' }, 'Daha az');
      less.addEventListener('click', e => { e.stopPropagation(); expandedEvrak.delete(r.key); render(); });
      return el('div', { class: 'evrak', onclick: e => e.stopPropagation() },
        el('div', { class: 'head' }, el('span', null, `${fmtNum(u.length)} yeni evrak`), el('span', null, less, ' ', seenBtn)),
        el('ul', null, u.map(makeLine)));
    }

    // kadar verilirse görüldü zamanı o ana çekilir: o andan sonra bulunan evrak yeni kalır.
    async function markSeen(keys, undoable, kadar) {
      const prev = goruldu;
      const count = undoable ? records.filter(r => keys.includes(r.key)).reduce((n, r) => n + unseenEvrak(r, prev).length, 0) : 0;
      const next = { ...goruldu };
      const now = Date.now();
      for (const k of keys) next[k] = kadar ? Math.max(next[k] || 0, kadar) : now;
      goruldu = next;
      computeYeni();
      renderFilters();
      render();
      autoNotice();
      await chrome.storage.local.set({ uhdEvrakGoruldu: next });
      // Geri al yalnız bu işlemin yazdığı anahtarları çevirir ve güncel haritadan başlar: arada başka kartta, popup'ta ya da
      // başka sekmede verilen görüldü işaretleri silinmez; sonradan yeniden işaretlenen anahtar da ezilmez.
      if (count) setNotice(`${fmtNum(count)} evrak görüldü sayıldı.`, '', { label: 'Geri al', fn: async () => {
        const { uhdEvrakGoruldu: stored } = await chrome.storage.local.get('uhdEvrakGoruldu');
        const cur = { ...(stored || goruldu) };
        for (const k of keys) {
          if (cur[k] !== now) continue;
          if (k in prev) cur[k] = prev[k];
          else delete cur[k];
        }
        goruldu = cur;
        computeYeni();
        renderFilters();
        render();
        setNotice('');
        await chrome.storage.local.set({ uhdEvrakGoruldu: cur });
      } });
    }

    // "Son evrak 12/09/2026 · Bilirkişi Raporu" (bağlı dosyadansa hangi dosya olduğu da).
    function sonText(r) {
      const s = lastEvrak(r);
      if (!s || !s.onay) return '';
      return [fmtTrDate(s.onay), s.tur, evrakDosya(r, s.dosya)].filter(Boolean).join(' · ');
    }

    function sonLine(r) {
      const t = sonText(r);
      if (!t) return null;
      const s = lastEvrak(r);
      const onay = fmtTrDate(s.onay);
      const title = s.gonderim && s.gonderim !== s.onay ? `Onay ${onay}, sisteme gönderim ${fmtTrDate(s.gonderim)}` : `Onay ${onay}`;
      return el('div', { class: 'son', title: 'Dosyadaki en yeni evrak (son güncellemeye göre). ' + title }, el('span', { class: 'k' }, 'Son evrak: '), el('b', null, onay), t.slice(onay.length),
        s.k ? [' ', evrakOpenBtn(r, s.k, s.dosya)] : null);
    }

    // ------------------------------------------------ evrak açma ve duruşmalar

    // baglam: evrakın açıldığı liste (Önceki/Sonraki için); verilmezse dosyanın bütün evrakı kullanılır.
    function evrakOpenBtn(r, k, dosya, baglam) {
      if (!k || !opts.onOpenEvrak) return null;
      const b = el('button', { class: 'lnk', 'data-focus': 'evrak:' + k, title: 'Evrakı UYAP’tan getirip göster (evrak saklanmaz)' }, 'Aç');
      b.addEventListener('click', e => { e.stopPropagation(); opts.onOpenEvrak(r, k, dosya, baglam); });
      return b;
    }

    function computeDurusma() {
      durusmaByKey = new Map();
      const yaklasan = upcomingDurusmalar(durusmaMeta && durusmaMeta.list);
      for (const d of yaklasan) {
        if (!durusmaByKey.has(d.key)) durusmaByKey.set(d.key, []);
        durusmaByKey.get(d.key).push(d);
      }
      const taramaAcik = cakismaTaramaAcik();
      cakismalar = taramaAcik ? durusmaCakismalari(yaklasan) : new Map();
      if (!taramaAcik && hearingRange === 'cakisma') hearingRange = 'week';
    }

    function cakismaKontrol() {
      const acik = cakismaTaramaAcik();
      const btn = el('button', { class: 'btn sm', 'data-action': 'cakisma-tarama', 'aria-pressed': String(acik),
        title: acik ? 'Duruşma çakışma taramasını kapat' : 'Duruşma çakışma taramasını aç' }, acik ? 'Taramayı kapat' : 'Taramayı aç');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await setPref('cakismaTarama', !acik);
          computeDurusma(); renderFilters(); render(); autoNotice();
          list.querySelector('[data-action="cakisma-tarama"]')?.focus();
        } catch {
          prefs = { ...prefs, cakismaTarama: acik };
          computeDurusma(); renderFilters(); render();
          setNotice('Çakışma taraması tercihi kaydedilemedi. Tekrar deneyin.', 'err');
          list.querySelector('[data-action="cakisma-tarama"]')?.focus();
        }
      });
      return el('div', { class: 'section', style: 'flex-wrap:wrap' },
        el('div', null, el('b', null, 'Duruşma çakışma taraması'), el('div', null, acik ? 'Açık' : 'Kapalı')), btn);
    }

    const gunText = n => (n === 0 ? 'bugün' : n === 1 ? 'yarın' : `${n} gün sonra`);
    // Çakışma aralığı: "30 dk arayla, başka adliyede"; adliye anlaşılamadıysa yer yazılmaz.
    const cakismaAraligi = c => (c.dk === 0 ? 'aynı saatte' : `${c.dk} dk arayla`) + (c.ayniAdliye === false ? ', başka adliyede' : c.ayniAdliye ? ', aynı adliyede' : '');
    // Çakışan duruşma: "10:30 · Bakırköy 3. İş Mahkemesi 2024/55 (30 dk arayla, başka adliyede)".
    const cakismaYazi = c => `${c.d.saat} · ${cleanBirim(c.d.birimAdi)} ${c.d.dosyaNo} (${cakismaAraligi(c)})`;

    function durLine(r) {
      if (filter.onlyDurusma) return null;   // duruşmalar görünümünde saat satırı ayrıca yazılıyor
      const list = durusmaByKey.get(r.key);
      if (!list || !list.length) return null;
      const d = list[0];
      const n = daysLeft(d.tarih);
      // Dosyanın yaklaşan duruşmalarından biri başka bir duruşmayla çakışıyorsa kartta etiket çıkar.
      const cak = list.flatMap(x => (cakismalar.get(x.id) || []).map(c => `${fmtIso(x.tarih, true)} ${x.saat}: ${cakismaYazi(c)}`));
      return el('div', { class: 'durline' + (n === 0 ? ' today' : n <= 3 ? ' soon' : ''), title: list.map(x => `${fmtIso(x.tarih, true)} ${x.saat} · ${x.islem}`).join('\n') },
        `${d.islem}: `, el('b', null, `${fmtIso(d.tarih, true)} ${d.saat}`), ` · ${gunText(n)}`, list.length > 1 ? ` (+${list.length - 1})` : '',
        cak.length ? el('span', { class: 'pill cak', title: 'Çakışan duruşma:\n' + cak.join('\n') }, 'Çakışma') : null);
    }

    function showDurusmalar(range) {
      hearingRange = typeof range === 'string' ? range : 'week';
      input.value = '';
      switchView('hearings');
      input.focus();
    }

    function exportIcs(list) {
      const url = URL.createObjectURL(new Blob([durusmaIcs(list)], { type: 'text/calendar;charset=utf-8' }));
      const a = el('a', { href: url, download: `durusmalar-${todayIso()}.ics` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    function renderDurusmalar() {
      const keys = myKeys(myName());
      const byKey = new Map(records.map(r => [r.key, r]));
      const toks = norm(fileNoQuery(input.value)).split(/\s+/).filter(Boolean);
      const all = upcomingDurusmalar(durusmaMeta && durusmaMeta.list);
      const cakisan = all.filter(d => cakismalar.has(d.id));
      if (hearingRange === 'cakisma' && !cakisan.length) hearingRange = 'week';   // çakışma giderildiyse (Güncelle) olağan aralık
      const ranged = hearingRange === 'cakisma' ? cakisan
        : all.filter(d => hearingRange === 'all' || daysLeft(d.tarih) < (hearingRange === 'today' ? 1 : 7));
      const rows = toks.length
        ? ranged.filter(d => { const h = norm([d.dosyaNo, d.birimAdi, d.islem, ...(d.taraflar || []).map(t => t.ad)].join(' ')); return toks.every(t => h.includes(t)); })
        : ranged;
      const ranges = el('div', { class: 'frow', role: 'group', 'aria-label': 'Duruşma tarih aralığı' });
      for (const [value, label] of [['today', 'Bugün'], ['week', 'Önümüzdeki 7 gün'], ['all', 'Tümü'], cakisan.length && ['cakisma', `Çakışanlar (${fmtNum(cakisan.length)})`]].filter(Boolean)) {
        const b = el('button', { class: 'chip' + (hearingRange === value ? ' on' : ''), 'aria-pressed': String(hearingRange === value), 'data-range': value }, label);
        b.addEventListener('click', () => { hearingRange = value; sel = 0; render(); list.querySelector(`[data-range="${value}"]`).focus(); });
        ranges.append(b);
      }
      const ics = el('button', { class: 'btn sm', title: 'Listelenen duruşmaları takvim dosyası (.ics) olarak indir; Outlook, Google Takvim ve telefon takvimleri açar. Taraf adları yazılmaz.' }, 'Takvime aktar (.ics)');
      ics.addEventListener('click', () => exportIcs(rows));
      const src = durusmaMeta && durusmaMeta.at ? `UYAP’tan ${fmtAgo(durusmaMeta.at)} alındı; sonraki ${durusmaMeta.gun || 60} gün.` : '';
      const head = el('div', { class: 'durhead' },
        ranges,
        el('div', null, el('b', null, `${fmtNum(rows.length)} duruşma`), toks.length ? ` (“${input.value.trim()}” içeren)` : '', ' · ', src),
        el('div', { class: 'row' }, rows.length ? ics : null,
          el('span', { style: 'color:var(--muted);font-size:11px' }, 'Saatleri UYAP’ta teyit edin; liste yalnız Güncelle’de yenilenir.')));
      const out = [cakismaKontrol(), head];
      current = [];
      let day = null;
      for (const d of rows) {
        if (d.tarih !== day) {
          day = d.tarih;
          const n = daysLeft(d.tarih);
          out.push(el('div', { class: 'dayhead' + (n === 0 ? ' today' : '') },
            el('span', null, n === 0 ? `Bugün · ${fmtIso(d.tarih, true)}` : n === 1 ? `Yarın · ${fmtIso(d.tarih, true)}` : fmtIso(d.tarih, true)),
            el('small', null, gunText(n))));
        }
        const r = byKey.get(d.key);
        const cak = cakismalar.get(d.id);
        const cakSatir = cak ? el('div', { class: 'cakline' }, 'Çakışıyor: ', cak.map(cakismaYazi).join(' · ')) : null;
        const info = el('div', { class: 'durline' }, el('b', null, `${d.saat} · ${d.islem}`), d.sonuc ? ` · ${d.sonuc}` : '',
          cak ? el('span', { class: 'pill cak' }, 'Çakışma') : null, cakSatir);
        if (r) {
          out.push(item(r, current.length, toks, keys, info));
          current.push(r);
        } else {
          out.push(el('div', { class: 'durrow' },
            el('span', { class: 't' }, d.saat),
            el('div', { class: 'info' },
              el('div', { class: 'title' }, el('b', null, d.dosyaNo), ' · ', el('span', null, cleanBirim(d.birimAdi))),
              el('div', { class: 'meta' }, [d.islem, d.dosyaTur].filter(Boolean).join(' · '), cak ? el('span', { class: 'pill cak' }, 'Çakışma') : null),
              cakSatir,
              el('div', { class: 'parties' }, (d.taraflar || []).map(t => `${t.sifat ? trTitle(t.sifat) + ': ' : ''}${trTitle(t.ad)}`).join(' · ')),
              el('div', { class: 'meta' }, 'Bu dosya indekste yok; açmak için Güncelle’ye basın.'))));
        }
      }
      if (!rows.length) {
        const showAll = el('button', { class: 'btn sm' }, 'Tüm tarihleri göster');
        showAll.addEventListener('click', () => { hearingRange = 'all'; render(); });
        out.push(el('div', { class: 'empty' }, el('strong', null, durusmaMeta ? 'Bu aralıkta duruşma yok' : 'Duruşmalar henüz alınmadı'),
          el('p', null, toks.length ? 'Başka bir isim deneyin veya tarih aralığını genişletin.' : durusmaMeta ? 'Yeni bilgiler için dosyalarınızı güncelleyebilirsiniz.' : 'Güncelle’ye bastığınızda duruşmalarınız burada görünür.'),
          hearingRange !== 'all' && all.length ? showAll : null));
      }
      list.append(...out);
      say(`${fmtNum(rows.length)} duruşma listelendi.`);
      if (sel >= current.length) sel = 0;
    }

    const GUNLER = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    function fmtIso(iso, withDay) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
      if (!m) return '';
      const s = `${m[3]}.${m[2]}.${m[1]}`;
      return withDay ? `${s} ${GUNLER[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()]}` : s;
    }

    // Durum rengi: açık yeşil, kapalı gri, karara çıkmış turuncu; açıkça duran icra takibi sakin mavi.
    function stateOf(r) {
      const d = cleanDurum(r.durum);
      const label = d.label || (r.sorguDurum === 1 ? 'Kapalı' : 'Açık');
      const paused = r.yargiTuru === '2' && /\b(?:duran|durmus|durdurul(?:an|mus|du|ma(?:si)?)|geri birak(?:ilan|ilmis|ildi|ilmasi))\b/.test(norm(label));
      const cls = paused ? 'paused' : r.sorguDurum === 1 ? 'closed' : /karar/i.test(label) ? 'karar' : '';
      return { label, tarih: d.tarih, cls };
    }

    // Evrak teyidi (1.19.43): son Güncelle bu dosyanın evrak listesinde uyarı bıraktıysa (kesilen liste, kimliksiz evrak,
    // azalan tür, ileti) kartta küçük bir rozet; metinler title ve erişilebilir adda. Yalnız kayıttaki kısa metinler okunur.
    function teyitRozeti(r) {
      const uyari = Array.isArray(r.evrakTeyit?.uyari) ? r.evrakTeyit.uyari.filter(u => typeof u === 'string' && u.trim()).slice(0, 5) : [];
      if (!uyari.length) return null;
      const metin = uyari.join(' ');
      return el('span', { class: 'pill teyit', title: metin, 'aria-label': `Evrak teyidi: ${metin}` }, 'Evrak teyidi');
    }

    // Asıl dosyanın yanında yürüyen dosyalar kartta ayrıca belirtilir: talimat ya da değişik iş dosyası olduğu dosya ekranı açılmadan görünsün.
    const TUR_ETIKET = [[/talimat|istinabe/, 'Talimat'], [/degisik is|^d(\. ?| )is\b/, 'Değişik İş']];
    function turEtiket(r) {
      if (r.yargiTuru === CBS.kod) {
        return [
          r.davaAcildi === true ? el('span', { class: 'pill tur', title: 'UYAP bu soruşturmada dava açıldığını bildiriyor' }, 'Dava açıldı') : null,
          r.incelemeIzni === false ? el('span', { class: 'pill tur', title: 'Evrak, Cumhuriyet savcısı inceleme talebini onaylayınca görüntülenebilir' }, 'Evrak onayı yok') : null
        ];
      }
      const t = norm(r.dosyaTur || '');
      const hit = t && TUR_ETIKET.find(([re]) => re.test(t));
      return hit ? el('span', { class: 'pill tur', title: `Dosya türü: ${r.dosyaTur}` }, hit[1]) : null;
    }

    // Son işlem (tercih açıksa son elle çekilen safahat kaydından): "Son işlem: 12/09/2026 · Haciz Talebi"
    function islemLine(r) {
      if (!r.sonIslem || !r.sonIslem.tarih) return null;
      return el('div', { class: 'son', title: 'Son kaydedilen safahata göre en yeni işlem; safahat elle güncellenir' }, el('span', { class: 'k' }, 'Son işlem: '), el('b', null, fmtTrDate(r.sonIslem.tarih)), r.sonIslem.tur ? ` · ${r.sonIslem.tur}` : '');
    }

    // UYAP'ın toplamKalan değeri, en son bu dosyanın Özet ekranından alındığı tarihle gösterilir.
    // Kart çizimi sorgu yapmaz; Getir/Güncelle yalnız seçilen dosyanın Özet ekranını açar.
    function balanceLine(r, interactive = false) {
      if (r.yargiTuru === CBS.kod) return null;
      let snapshot = null;
      try { if (Object.hasOwn(balances, r.key)) snapshot = globalThis.UHD.checkBalanceSnapshot(balances[r.key]); } catch { /* geçersiz tutar gösterilmez */ }
      const refresh = interactive && opts.onDosyaPanel ? el('button', {
        type: 'button', class: 'btn sm', 'data-focus': 'balance',
        title: 'Bu dosyanın kalan tutarını UYAP’tan almak için Özet ekranını aç'
      }, snapshot ? 'Güncelle' : 'Getir') : null;
      if (refresh) refresh.addEventListener('click', e => { e.stopPropagation(); opts.onDosyaPanel(r, 'ozet'); });
      if (!snapshot && !refresh) return null;
      const date = snapshot ? new Date(snapshot.fetchedAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '';
      return el('div', { class: 'balance-line', title: snapshot ? `UYAP Tahsilat/Reddiyat · Son alınma: ${date}` : 'Kalan tutar bu dosya için henüz alınmadı.' },
        el('span', null, 'Dosyada kalan: '),
        snapshot ? el('strong', null, globalThis.UHD.fmtTL(snapshot.toplamKalan)) : el('small', null, 'Henüz alınmadı'),
        snapshot ? el('small', null, `Son alınma: ${date}`) : null, refresh);
    }

    async function copyText(btn, text) {
      try {
        await navigator.clipboard.writeText(text);
        btn.classList.add('done');
        btn.replaceChildren(icon('check'));
        setTimeout(() => { btn.classList.remove('done'); btn.replaceChildren(icon('copy')); }, 1500);
      } catch {
        btn.title = 'Kopyalanamadı';
      }
    }

    // Kart: 1) dosya no, durum ve tür etiketleri, simge düğmeleri 2) mahkeme 3) not 4) yakın duruşma ya da son işlem
    // 5) taraflar (tek satır) 6) yeni evrak ya da son evrak (tek satır) 7) Evrak Görüntüle ve Dosya Görüntüle. Karta tıklamak kartı
    // seçer; dosya yalnız "Dosya Görüntüle" ya da Enter ile açılır (açma ağır ve geri alınamaz bir işlemdir). Dolu birincil
    // düğmeler yalnız seçili kartta durur.
    // Hızlı bakış kartı: numara ve etiketler, mahkeme, not (salt okunur), taraflar, Dosya Görüntüle. Evrak, Safahat, not
    // düzenleme ve gizleme UYAP'taki paneldedir.
    function quickItem(r, i, toks, keys, extra) {
      const st = stateOf(r);
      const open = el('button', { class: 'btn sm open' + (i === sel ? ' primary' : ''), 'data-focus': 'open', title: 'Dosyayı UYAP’ta Pencere Görünümü ile aç (Enter)' },
        icon('eye'), el('span', null, 'Dosya Görüntüle'));
      open.addEventListener('click', e => { e.stopPropagation(); openRecord(r); });
      const row = el('article', { class: 'item quick' + (st.cls ? ' ' + st.cls : '') + (i === sel ? ' sel' : ''), 'data-key': r.key, 'data-idx': String(i),
        'aria-current': i === sel ? 'true' : null, 'aria-label': `${r.dosyaNo} ${cleanBirim(r.birimAdi)}` },
        el('div', { class: 'ihead' },
          el('div', { class: 'ititle' },
            el('span', { class: 'file-number' }, highlight(r.dosyaNo, toks)),
            el('span', { class: 'pill st ' + st.cls, title: st.tarih ? `${st.label} · ${fmtTrDate(st.tarih)}` : st.label }, st.label),
            turEtiket(r),
            yeniMap.has(r.key) ? el('span', { class: 'pill new' }, 'Yeni evrak') : null,
            teyitRozeti(r))),
        el('div', { class: 'birim' }, highlight(cleanBirim(r.birimAdi), toks)),
        balanceLine(r),
        notes[r.key] ? el('div', { class: 'note-line ro', title: 'Kişisel not (yalnız bu bilgisayarda); UYAP’taki panelden düzenlenir' }, ...globalThis.UHD.noteDisplay(notes[r.key], text => highlight(text, toks))) : null,
        extra || null,
        partyBlock(r, toks, keys),
        el('div', { class: 'ifoot' }, open));
      row.addEventListener('click', e => {
        if (e.target.closest('button, a, input, textarea, select') || String(window.getSelection && window.getSelection()).trim()) return;
        select(i, false, true);
        open.focus({ preventScroll: true });
        kartIpucu();
      });
      row.addEventListener('focusin', () => { if (sel !== i) select(i, false); });
      return row;
    }

    function item(r, i, toks, keys, extra) {
      if (quick) return quickItem(r, i, toks, keys, extra);
      const st = stateOf(r);
      const kunye = kunyeOf(r);
      const ib = (name, title, fn, cls, focusKey) => {
        const b = el('button', { class: 'ib' + (cls ? ' ' + cls : ''), title, 'aria-label': title, 'data-focus': focusKey }, icon(name));
        b.addEventListener('click', e => { e.stopPropagation(); fn(b); });
        return b;
      };
      const icons = el('div', { class: 'icons' },
        ib('copy', `Künyeyi kopyala: ${kunye}`, b => copyText(b, kunye), '', 'copy'),
        ib('note', notes[r.key] ? 'Notu düzenle (yalnız bu bilgisayarda)' : 'Not ekle (yalnız bu bilgisayarda)', () => { editing = r.key; sel = i; render(); }, notes[r.key] ? 'on' : '', 'note'),
        ib('hide', 'Bu dosyayı aramalarda gösterme (Ayarlar’dan yeniden gösterilebilir)', () => hideFile(r), '', 'hide'));
      // Evrak Görüntüle her zaman Evrak sekmesini açar; görülmemiş yeni evraklar önce gelir.
      const u = unseenEvrak(r, goruldu);
      const ekranBtn = opts.onDosyaPanel ? el('button', { class: 'btn sm' + (i === sel ? ' primary' : ''), 'data-focus': 'ekran',
        title: (u.length ? 'Yeni evrakla açılır. ' : 'Evrak sekmesiyle açılır. ') + (r.yargiTuru === CBS.kod
          ? 'Dosyanın özeti ve evrakı tek ekranda' + (r.incelemeIzni === false ? '; evrak, savcı onayından sonra görünür' : '')
          : 'Dosyanın özeti, evrakı ve Safahat tek ekranda') },
      icon('doc'), el('span', null, 'Evrak Görüntüle' + (u.length ? ` · ${fmtNum(u.length)} yeni` : ''))) : null;
      if (ekranBtn) ekranBtn.addEventListener('click', e => {
        e.stopPropagation();
        opts.onDosyaPanel(r, 'evrak', yeniBaglam(r));
      });
      const busyText = busy.get(r.key);
      const open = el('button', { class: 'btn sm open' + (i === sel ? ' primary' : ''), 'data-focus': 'open', 'aria-busy': busyText ? 'true' : null,
        title: 'Dosyayı UYAP’ta Pencere Görünümü ile aç (Enter)' }, icon('eye'), el('span', null, busyText || 'Dosya Görüntüle'));
      open.addEventListener('click', e => { e.stopPropagation(); openRecord(r); });
      const hasYeni = yeniMap.has(r.key);
      const son = !hasYeni && !filter.onlyDurusma ? sonLine(r) : null;
      const row = el('article', { class: 'item' + (st.cls ? ' ' + st.cls : '') + (i === sel ? ' sel' : ''), 'data-key': r.key, 'data-idx': String(i),
        'aria-current': i === sel ? 'true' : null, 'aria-label': `${r.dosyaNo} ${cleanBirim(r.birimAdi)}` },
        el('div', { class: 'ihead' },
          el('div', { class: 'ititle' },
            el('span', { class: 'file-number' }, highlight(r.dosyaNo, toks)),
            el('span', { class: 'pill st ' + st.cls, title: st.tarih ? `${st.label} · ${fmtTrDate(st.tarih)}` : st.label }, st.label),
            turEtiket(r),
            hasYeni ? el('span', { class: 'pill new' }, 'Yeni evrak') : null,
            teyitRozeti(r)),
          icons),
        el('div', { class: 'birim' }, highlight(cleanBirim(r.birimAdi), toks)),
        balanceLine(r, true),
        noteBlock(r, toks),
        durLine(r) || islemLine(r),
        extra || null,
        partyBlock(r, toks, keys),
        !filter.onlyDurusma ? evrakBlock(r, toks) : null,
        son,
        el('div', { class: 'ifoot' }, ekranBtn, open));
      row.addEventListener('click', e => {
        if (e.target.closest('button, a, input, textarea, select') || String(window.getSelection && window.getSelection()).trim()) return;
        select(i, false, true);
        open.focus({ preventScroll: true });   // Enter bu kartı açar
        kartIpucu();
      });
      row.addEventListener('focusin', () => { if (sel !== i) select(i, false); });
      return row;
    }

    // Karta tıklamanın artık dosyayı açmadığı bir kez söylenir.
    function kartIpucu() {
      if (pref('kartIpucu', false)) return;
      setPref('kartIpucu', true).catch(() => {});
      setNotice('Kart seçildi. Dosyayı açmak için “Dosya Görüntüle”ye ya da Enter’a basın.', '', { label: 'Tamam', fn: () => setNotice('') });
    }

    // Seçim odaktan ayrı çizilir. Fare imleci seçimi değiştirmez; ↑ ↓ ile seçilince ekran okuyucuya kısa özet okunur.
    function select(i, scroll, announce) {
      const rows = list.querySelectorAll('.item');
      if (!rows.length) return;
      sel = Math.max(0, Math.min(i, rows.length - 1));
      rows.forEach((row, k) => {
        const on = k === sel;
        row.classList.toggle('sel', on);
        if (on) row.setAttribute('aria-current', 'true'); else row.removeAttribute('aria-current');
        for (const b of row.querySelectorAll('.ifoot .open, .ifoot [data-focus="ekran"]')) b.classList.toggle('primary', on);
      });
      if (scroll) rows[sel].scrollIntoView({ block: 'nearest' });
      const r = current[sel];
      if (announce && r) { lastSaid = ''; live.textContent = `${sel + 1}/${current.length} · ${r.dosyaNo} · ${cleanBirim(r.birimAdi)}`; }
    }

    // Açılmakta olan dosyanın düğmesi "Açılıyor · 2/4" yazar (sabit panelde; UYAP sayfasındaki akış bildirir).
    function setBusy(key, text) {
      if (text) busy.set(key, text); else busy.delete(key);
      for (const card of list.querySelectorAll('.item')) {
        if (card.dataset.key !== key) continue;
        const b = card.querySelector('.ifoot .open');
        if (!b) continue;
        b.lastChild.textContent = text || 'Dosya Görüntüle';
        if (text) b.setAttribute('aria-busy', 'true'); else b.removeAttribute('aria-busy');
      }
    }

    function render() {
      if (syncSetup()) return;
      if (optionsPage) return;   // ayarlar sayfasında liste yok
      for (const draft of noteDrafts.values()) draft.rich?.destroy?.();
      const rn = root.getRootNode();
      const act = rn && rn.activeElement;
      const card = act && list.contains(act) ? act.closest('.item') : null;
      const restore = card ? { key: card.dataset.key, idx: card.dataset.idx, f: act.dataset.focus || '' } : null;
      renderList();
      if (!restore) return;
      const cards = [...list.querySelectorAll('.item')];
      const next = cards.find(x => x.dataset.key === restore.key && x.dataset.idx === restore.idx) || cards.find(x => x.dataset.key === restore.key);
      const byFocus = f => f && next && [...next.querySelectorAll('[data-focus]')].find(x => x.dataset.focus === f);
      // Silinen notun yerine not düğmesine dönülür; hiçbiri yoksa kartın açma düğmesine.
      const target = next && (byFocus(restore.f) || (restore.f === 'noteline' && byFocus('note')) || next.querySelector('.ifoot .open'));
      if (target) { target.focus({ preventScroll: true }); target.scrollIntoView({ block: 'nearest' }); }
      else if (!list.contains(rn.activeElement)) input.focus({ preventScroll: true });
    }

    let lastSaid = '';
    function say(text) {
      if (text === lastSaid) return;
      lastSaid = text;
      live.textContent = text;
    }

    function renderList() {
      renderViews();   // sekme sayaçları aralık, gizleme ve filtre değişince de güncel kalsın
      const scroll = list.scrollTop;
      list.replaceChildren();
      current = [];
      btnQClear.hidden = !input.value;
      views.hidden = optionsPage || !loaded || (!records.length && !durusmaMeta) || !!person || !settings.hidden || (quick && !views.childElementCount);
      filters.hidden = quick || optionsPage || !records.length || !!person || !settings.hidden || filter.onlyDurusma;
      if (!loaded) {
        list.append(el('div', { class: 'empty', role: 'status' }, 'Dosyalarınız hazırlanıyor…'));
        return;
      }
      if (person) return renderPerson();
      if (filter.onlyDurusma) return renderDurusmalar();
      if (!records.length) {
        const run = running();
        const go = el('button', { class: 'btn primary', disabled: run }, run ? 'İlk güncelleme sürüyor…' : 'Şimdi güncelle');
        go.addEventListener('click', () => { setNotice(''); opts.onUpdate(false); });
        list.append(el('div', { class: 'onboard' },
          el('b', null, 'Başlamak için'),
          el('ol', null,
            el('li', null, 'UYAP Avukat Portalı’na e-imza ile giriş yapın.'),
            el('li', null, '“Şimdi güncelle”ye basın. Vekili olduğunuz dosyaların listesi, taraf adları, vekilleri ve duruşmalarınız UYAP’tan alınıp bu Chrome profilinde şifreli saklanır. Bu bilgiler başka bir sunucuya gönderilmez. Evrak ve banka cevabı araçları, seçtiğiniz belgeleri tarayıcınızda işler. Banka sorgusu ayrıca siz başlatınca, UYAP’ın uygunluk ve ücret kontrolünden sonra çalışır; ücrete ayrıca onay sorulur. İlk güncelleme birkaç dakika sürebilir.'),
            el('li', null, 'Ad, soyad, dosya no veya mahkeme yazın; “Dosya Görüntüle” ile dosya UYAP’ta açılır.')),
          go,
          el('p', { style: 'margin:12px 0 0;font-size:12px;color:var(--muted)' }, 'Ayrıntılar: ', el('a', { href: 'https://github.com/hasanimer/legaluga-uyap-ui/blob/main/docs/PRIVACY.md', target: '_blank', rel: 'noopener' }, 'gizlilik politikası'), '.')));
        return;
      }
      const keys = myKeys(myName());
      const q = input.value;
      const res = search(records, q, { myName: myName(), notes, filter, yeni: yeniMap, gizli, vekilAra: pref('vekilAra', true), sort: pref('siralama', 'relevance'), limit: shownLimit });
      say(`${fmtNum(res.total)} dosya bulundu.`);
      const sortSelect = el('select', { class: 'sort', 'aria-label': 'Dosya sıralaması' },
        [['relevance', 'En uygun'], ['newest', 'Açılış: yeniden eskiye'], ['fileNo', 'Dosya no: büyükten küçüğe']].map(([value, label]) => el('option', { value }, label)));
      sortSelect.value = pref('siralama', 'relevance');
      sortSelect.addEventListener('change', async () => {
        sel = 0; shownLimit = LIMIT;
        await setPref('siralama', sortSelect.value);
        render(); list.querySelector('.sort')?.focus();
      });
      if (!res.tokens.length && !res.total && filter.durum === 'all' && !hasTurFilter() && !filter.onlyClient && !filter.onlyNew) {
        const byKey = new Map(records.map(r => [r.key, r]));
        current = recent.map(k => byKey.get(k)).filter(r => r && !gizli[r.key]);
        if (!current.length) {
          const openFiles = quick ? null : el('button', { class: 'btn sm' }, 'Açık dosyalar');
          if (openFiles) openFiles.addEventListener('click', () => { filter.durum = 'acik'; renderFilters(); render(); input.focus(); });
          const hearings = el('button', { class: 'btn sm' }, 'Duruşmalarım');
          hearings.addEventListener('click', quick ? () => opts.onView('hearings') : showDurusmalar);
          list.append(el('div', { class: 'empty' }, el('strong', null, 'Dosyanızı kolayca bulun'),
            el('p', null, `${fmtNum(records.length)} dosya hazır. Bir isim, dosya numarası veya mahkeme yazın.`),
            el('div', { class: 'quick-actions' }, openFiles, hearings)));
          return;
        }
        say(`${fmtNum(current.length)} son açılan dosya.`);
        list.append(el('div', { class: 'section' }, el('b', null, 'Son açılanlar'), el('span', null, 'Kaldığınız yerden devam edin')));
      } else {
        current = res.items;
        if (!res.total) {
          const narrowed = filter.durum !== 'all' || hasTurFilter() || filter.onlyClient || filter.onlyNew;
          let text = 'Eşleşen dosya yok.';
          let action = narrowed ? { label: 'Filtreleri kaldır', fn: () => { clearFilters(); renderFilters(); render(); } } : null;
          if (filter.onlyNew && res.tokens.length) action = { label: 'Tüm dosyalarda ara', fn: () => {
            filter.onlyNew = false; clearFilters(); renderFilters(); render(); input.focus();
          } };
          if (filter.onlyNew && !res.tokens.length) {
            text = evrakTracked ? 'Son güncellemeden bu yana yeni evrak yok.' : 'Evrak takibi henüz açılmadı.';
            action = !evrakTracked ? { label: 'Takibi ayarla', fn: openSettings }
              : { label: 'Güncelle', fn: () => { setNotice(''); opts.onUpdate(false); } };
          }
          const box = el('div', { class: 'empty' }, el('strong', null, text),
            res.tokens.length ? el('p', null, 'Adın bir bölümünü veya dosya numarasını deneyin. Türkçe karakter kullanmanız gerekmez.') : null);
          if (action) {
            const b = el('button', { class: 'btn' }, action.label);
            b.addEventListener('click', action.fn);
            box.append(b);
          }
          list.append(box);
          return;
        }
        const total = el('span', null, el('b', null, `${fmtNum(res.total)} sonuç`));
        let eylem = null;
        if (filter.onlyNew) {
          const tumu = () => search(records, q, { myName: myName(), notes, filter, yeni: yeniMap, gizli, vekilAra: pref('vekilAra', true), sort: pref('siralama', 'relevance'), limit: Infinity }).items;
          const all = el('button', { class: 'btn sm', title: 'Listelenen dosyaların yeni evraklarını görüldü olarak işaretle' }, icon('check'), 'Tümünü görüldü say');
          all.addEventListener('click', () => markSeen(tumu().map(r => r.key), true));
          // Sırayla oku: dosyalar bu listedeki sırayla dosya ekranında açılır; her dosyanın sonunda görüldü sayılabilir
          // (kendiliğinden işaretlenmez).
          const oku = opts.onSiraylaOku ? el('button', { class: 'btn sm primary', title: 'Yeni evrakları dosya dosya, bu listedeki sırayla açar' }, icon('doc'), 'Sırayla oku') : null;
          if (oku) oku.addEventListener('click', () => {
            const kuyruk = tumu().map(r => ({ record: r, baglam: yeniBaglam(r) })).filter(x => x.baglam);
            if (kuyruk.length) opts.onSiraylaOku(kuyruk);
          });
          eylem = el('div', { class: 'section eylem' }, oku, all);
        }
        list.append(el('div', { class: 'section' }, total, quick ? null : sortSelect));
        if (eylem) list.append(eylem);   // Yeni evrak: Sırayla oku ve Tümünü görüldü say ayrı satırda
      }
      if (sel >= current.length) sel = 0;
      current.forEach((r, i) => list.append(item(r, i, res.tokens, keys)));
      if (res.tokens.length && !pref('vekilAra', true)) list.append(el('div', { class: 'more' }, 'Karşı taraf vekillerinde arama kapalı (Ayarlar).'));
      if (quick && current.length) list.append(el('div', { class: 'more' }, 'Evrak, Safahat ve notlar UYAP’taki Legaluga panelinde.'));
      if (res.total > current.length) {
        const more = el('button', { class: 'btn sm load-more' }, `Daha fazla göster · ${fmtNum(current.length)} / ${fmtNum(res.total)}`);
        more.addEventListener('click', () => {
          const previous = current.length;
          shownLimit += LIMIT; render();
          list.querySelectorAll('.item')[previous]?.querySelector('button')?.focus();
        });
        list.append(more);
      }
      list.scrollTop = scroll;
    }

    // ------------------------------------------------ müvekkil kartı

    function openPerson(name) {
      person = { name };
      editing = null;
      sel = 0;
      render();
      list.scrollTop = 0;
      list.querySelector('.person button')?.focus();
    }

    function closePerson() {
      person = null;
      sel = 0;
      render();
      input.focus();
    }

    function renderPerson() {
      const keys = myKeys(myName());
      const files = personFiles(records, person.name, myName());
      const acik = files.filter(f => f.r.sorguDurum !== 1).length;
      const muvekkil = files.filter(f => f.roller.some(x => x.muvekkil));
      const diger = files.filter(f => !f.roller.some(x => x.muvekkil));
      const roller = new Map();
      for (const f of files) for (const x of f.roller) roller.set(x.rol, (roller.get(x.rol) || 0) + 1);

      const back = el('button', { class: 'btn sm', title: 'Aramaya dön (Esc)' }, icon('back'), 'Geri');
      back.addEventListener('click', closePerson);
      const copyAll = el('button', { class: 'btn sm', title: 'Bu kişinin tüm dosyalarının künyelerini alt alta kopyala' }, icon('copy'), 'Künyeleri kopyala');
      copyAll.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(files.map(f => kunyeOf(f.r)).join('\n'));
          copyAll.replaceChildren(icon('check'), 'Kopyalandı');
        } catch { copyAll.textContent = 'Kopyalanamadı'; }
      });
      const head = el('div', { class: 'person' },
        el('div', { class: 'kind' }, muvekkil.length ? 'Müvekkil kartı' : 'Kişi kartı'),
        el('div', { class: 'top' }, el('b', null, trTitle(person.name)), back),
        el('div', { class: 'sum' }, files.length
          ? `${fmtNum(files.length)} dosya · ${fmtNum(acik)} açık · ${fmtNum(files.length - acik)} kapalı` +
            (roller.size ? ' — ' + [...roller].map(([rol, n]) => `${rol} (${n})`).join(', ') : '')
          : 'Bu adla kayıtlı dosya bulunamadı.'),
        muvekkil.length && diger.length
          ? el('div', { class: 'warn' }, `Dikkat: ${fmtNum(diger.length)} dosyada müvekkiliniz olarak değil, başka bir tarafın ya da vekilin tarafında geçiyor. Aynı adlı farklı bir kişi de olabilir; dosyaları kontrol edin.`)
          : null,
        files.length ? el('div', { class: 'row' }, copyAll) : null,
        el('div', { class: 'hint' }, 'UYAP taraf listesinde kimlik numarası yer almadığından aynı ad-soyada sahip farklı kişiler birlikte listelenebilir.'));
      list.append(head);
      current = files.map(f => f.r);
      if (sel >= current.length) sel = 0;
      files.forEach((f, i) => {
        const bizde = f.roller.some(x => x.muvekkil);
        const rolText = f.roller.map(x => x.rol + (x.muvekkil ? ' · müvekkiliniz' : '')).join(', ');
        list.append(item(f.r, i, [], keys, el('div', { class: 'rolein' + (bizde ? '' : ' other') }, `Bu dosyada: ${rolText}`)));
      });
    }

    // ------------------------------------------------ kayıt işlemleri

    async function openRecord(r) {
      recent = [r.key, ...recent.filter(k => k !== r.key)].slice(0, RECENT_MAX);
      await chrome.storage.local.set({ uhdRecent: recent });
      opts.onOpen(r);
    }

    async function saveNote(key, text) {
      const before = notes;
      const next = { ...notes };
      text = text.trim();
      if (text) next[key] = text; else delete next[key];
      notes = next;
      render();
      try {
        const saved = await globalThis.UHDStorage.mergeNote(key, text);
        if (notes === next) { notes = saved; render(); }
      } catch (error) {
        if (notes === next) { notes = before; render(); }
        setNotice('Not kaydedilemedi. Lütfen yeniden deneyin.', 'err');
        throw error;
      }
    }

    function exportCsv() {
      const keys = myKeys(myName());
      const rows = [['Dosya No', 'Birim', 'Yargı Türü', 'Dosya Türü', 'Durum', 'Açılış', 'Müvekkil', 'Diğer Taraflar', 'Karşı Taraf Vekilleri', 'Son Evrak', 'Sonraki Duruşma', 'Not']];
      const sorted = [...records].sort((a, b) =>
        (a.yargiTuruAdi || '').localeCompare(b.yargiTuruAdi || '', 'tr') ||
        (a.birimAdi || '').localeCompare(b.birimAdi || '', 'tr') ||
        (a.acilisTs || 0) - (b.acilisTs || 0));
      for (const r of sorted) {
        const ps = r.taraflar || [];
        const clients = ps.filter(p => isClient(p, keys));
        const others = ps.filter(p => !isClient(p, keys));
        const vek = [...new Set(others.flatMap(p => p.vekil || []))];
        rows.push([
          r.dosyaNo, r.birimAdi, r.yargiTuruAdi, r.dosyaTur, r.durum, r.acilis,
          clients.map(p => `${p.adi}${p.rol ? ' (' + p.rol + ')' : ''}`).join(', '),
          others.map(p => `${p.rol ? p.rol + ': ' : ''}${p.adi}`).join('; '),
          vek.join(', '),
          sonText(r),
          (d => (d ? `${fmtIso(d.tarih)} ${d.saat} ${d.islem}` : ''))((durusmaByKey.get(r.key) || [])[0]),
          globalThis.UHD.noteText(notes[r.key] || '')
        ]);
      }
      const csv = '﻿' + rows.map((row, r) => row.map((v, i) => (r > 0 && i === 0 ? csvDosyaNo(v) : csvCell(v))).join(';')).join('\r\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const d = new Date();
      const a = el('a', { href: url, download: `uyap-dosyalar-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.csv` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    // ------------------------------------------------ durum satırı

    let statusStopState = null, statusUpdateState = null;
    function renderStatus() {
      if (document.hidden || (opts.isVisible && !opts.isVisible())) return;
      const run = running();
      if (!run) stopping = false;
      const paused = !run && !!pendingJob && !pendingJob.stop;
      if (optionsPage) root.querySelector('footer').hidden = !run && !paused;
      btnStop.hidden = !run && !paused;
      btnStop.setAttribute('aria-disabled', String(run && stopping));   // disabled odağı düşürürdü
      const stopState = paused ? 'cancel' : stopping ? 'stopping' : 'stop';
      if (statusStopState !== stopState) {
        btnStop.replaceChildren(icon(paused ? 'x' : 'stop'), el('span', null, paused ? 'İptal et' : stopping ? 'Durduruluyor…' : 'Durdur'));
        statusStopState = stopState;
      }
      btnStop.title = paused ? pendingJob?.setupPending ? 'Bağlantı bekleyen ilk taramayı iptal eder.' : 'Yarıda kalan güncellemeyi bırakır; o ana kadar alınan bilgiler saklı kalır.' : 'Güncellemeyi durdurur; sonra “Sürdür” ile kaldığı yerden devam edebilirsiniz.';
      btnUpdate.hidden = run || (quick && !paused);
      const updateState = paused ? 'resume' : 'update';
      if (statusUpdateState !== updateState) {
        btnUpdate.replaceChildren(icon('sync'), el('span', null, paused ? 'Sürdür' : 'Güncelle'));
        statusUpdateState = updateState;
      }
      btnUpdate.title = paused ? 'Yarıda kalan güncellemeyi kaldığı yerden sürdürür.' : 'Dosya listesini, yeni dosyaların taraflarını ve duruşmaları UYAP’tan yeniler.';
      const err = !run && !!(progress && progress.error);
      statusText.classList.toggle('err', err);
      status.hidden = !run || !progress.total;
      bar.hidden = status.hidden;
      if (run) {
        let text = progress.text || 'Güncelleniyor…';
        if (progress.adim && progress.adimlar) text = `Adım ${progress.adim}/${progress.adimlar} · ${text}`;
        if (progress.total && progress.done && progress.phaseStart) {
          const perItem = (Date.now() - progress.phaseStart) / progress.done;
          const min = Math.ceil(perItem * (progress.total - progress.done) / 60000);
          text += ` · kalan ~${min} dk`;
        }
        statusText.textContent = text;
        barFill.style.width = progress.total ? `${Math.round(100 * progress.done / progress.total)}%` : '0';
        bar.setAttribute('aria-valuenow', String(progress.total ? Math.min(100, Math.round(100 * progress.done / progress.total)) : 0));
      } else {
        const last = meta.updatedAt ? `Son güncelleme: ${fmtAgo(meta.updatedAt)} (${fmtDate(meta.updatedAt)})` : 'Henüz güncelleme yapılmadı.';
        const recentText = progress && progress.text && progress.endedAt && (paused || err || Date.now() - progress.endedAt < 3600000);
        statusText.textContent = pendingJob?.setupPending ? progress?.text || 'İlk tarama UYAP bağlantısını bekliyor.' : recentText ? `${progress.text} · ${fmtAgo(progress.endedAt)}` : last;
      }
      statusText.title = statusText.textContent;
    }

    // ------------------------------------------------ gizlenen dosyalar

    async function hideFile(r) {
      gizli = { ...gizli, [r.key]: { dosyaNo: r.dosyaNo, birimAdi: r.birimAdi, at: Date.now() } };
      await chrome.storage.local.set({ uhdGizli: gizli });
      render();
      setNotice(`${r.dosyaNo} ${cleanBirim(r.birimAdi)} aramalarda gösterilmeyecek.`, '', { label: 'Geri al', fn: () => unhideFile(r.key) });
    }

    async function unhideFile(key) {
      const next = { ...gizli };
      delete next[key];
      gizli = next;
      await chrome.storage.local.set({ uhdGizli: next });
      setNotice('');
      if (!settings.hidden) renderSettings();
      render();
    }

    // ------------------------------------------------ yedek

    function backupPassword(repeat) {
      return new Promise(resolve => {
        const id = `uhd-backup-${crypto.randomUUID()}`;
        const { BACKUP_PASSWORD_MIN_LENGTH: minLength, BACKUP_PASSWORD_MAX_LENGTH: maxLength } = UHDVaultCrypto;
        const dialog = el('dialog', { class: 'backup-password', 'aria-labelledby': id });
        const password = el('input', { type: 'password', autocomplete: repeat ? 'new-password' : 'current-password', minlength: String(minLength), maxlength: String(maxLength), required: true, 'data-backup-password': 'main' });
        const again = repeat ? el('input', { type: 'password', autocomplete: 'new-password', minlength: String(minLength), maxlength: String(maxLength), required: true, 'data-backup-password': 'again' }) : null;
        const error = el('p', { class: 'backup-error', role: 'alert' });
        const cancel = el('button', { type: 'button', class: 'btn' }, 'Vazgeç');
        const form = el('form', null,
          el('h3', { id }, repeat ? 'Yedek parolası belirleyin' : 'Yedeğin parolasını girin'),
          el('p', null, repeat ? `Yedek bu parolayla şifrelenir. En az ${minLength} karakter kullanın ve parolayı güvenli bir yerde saklayın; unutulursa yedek açılamaz.` : 'Parola yalnız bu cihazda yedeği açmak için kullanılır. Mevcut veriler, yedek doğrulanmadan değiştirilmez.'),
          el('label', null, 'Parola', password), again ? el('label', null, 'Parola tekrar', again) : null, error,
          el('div', { class: 'backup-actions' }, cancel, el('button', { type: 'submit', class: 'btn primary' }, repeat ? 'Şifreli yedekle' : 'Yedeği aç')));
        dialog.append(form); root.append(dialog);
        let ended = false;
        const done = value => {
          if (ended) return; ended = true;
          password.value = ''; if (again) again.value = '';
          dialog.close(); dialog.remove(); resolve(value);
        };
        cancel.addEventListener('click', () => done(null));
        dialog.addEventListener('keydown', event => event.stopPropagation());
        dialog.addEventListener('cancel', event => { event.preventDefault(); done(null); });
        dialog.addEventListener('close', () => done(null));
        form.addEventListener('submit', event => {
          event.preventDefault();
          if (password.value.length < minLength || password.value.length > maxLength) { error.textContent = `Parola ${minLength}–${maxLength} karakter olmalı.`; return; }
          if (again && password.value !== again.value) { error.textContent = 'Parolalar aynı değil.'; return; }
          done(password.value);
        });
        dialog.showModal(); password.focus();
      });
    }

    async function exportBackup() {
      try {
        const password = await backupPassword(true); if (password === null) return;
        const data = checkBackup({ app: BACKUP_APP, format: BACKUP_FORMAT, data: await chrome.storage.local.get(BACKUP_KEYS) });
        const version = (chrome.runtime && chrome.runtime.getManifest) ? chrome.runtime.getManifest().version : '';
        const body = JSON.stringify(await UHDVaultCrypto.encryptBackup({ app: BACKUP_APP, format: BACKUP_FORMAT, version, exportedAt: new Date().toISOString(), data }, password));
        const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
        const a = el('a', { href: url, download: `legaluga-uyap-sifreli-yedek-${todayIso()}.json` });
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        setNotice('Parolalı yedek indirildi. Hata raporlama onayı yedeğe aktarılmadı.');
      } catch { setNotice('Şifreli yedek oluşturulamadı. Mevcut verileriniz korunuyor.', 'err'); }
    }

    async function importBackup(file) {
      try {
        if (file.size > 70 * 1024 * 1024) throw new Error('Yedek 70 MiB dosya sınırını aşıyor.');
        let value = JSON.parse(await file.text());
        if (value?.encrypted === true || value?.format === 2) {
          const password = await backupPassword(false); if (password === null) return;
          value = await UHDVaultCrypto.decryptBackup(value, password);
        }
        const data = checkBackup(value);
        const n = data.uhdIndex ? data.uhdIndex.records.length : 0;
        if (!confirm(`Yedek yüklenecek${n ? ` (${fmtNum(n)} dosya)` : ''}. Bu bilgisayardaki eklenti verilerinin yerini alır. Devam edilsin mi?`)) return;
        await UHDStorage.replaceBackup(data);
        setNotice(`Yedek yüklendi${n ? `: ${fmtNum(n)} dosya` : ''}. Hata raporlama kapalıdır; isterseniz yeniden onay vererek açabilirsiniz. Güncel bilgiler için bir kez ${guncelleYeri} basmanız önerilir.`);
      } catch (e) {
        setNotice(e instanceof SyntaxError ? 'Dosya okunamadı; yedek dosyası bozuk.' : e.message, 'err');
      }
    }

    // ------------------------------------------------ ayarlar ekranı

    // Ayarlar açıkken başka yerden (panelin raptiyesi, tema düğmesi, başka sekme, yedekten yükleme) değişen değerler
    // ekrana yansır. Yazı yazılırken ekran yenilenmez; odak aynı denetime döner.
    let ayarKosu = false;   // Ayarlar çizilirken güncelleme sürüyor muydu (Baştan tara ve Tüm verileri sil düğmeleri)
    function refreshSettings() {
      if (syncSetup()) return;
      const a = root.getRootNode().activeElement;
      const inside = !!a && settings.contains(a);
      if (inside && a.matches('input[type=text], select')) return;
      const key = inside ? (a.dataset.pref || a.textContent) : null;
      const top = settings.scrollTop;
      renderSettings();
      settings.scrollTop = top;
      if (key) [...settings.querySelectorAll('input,select,button')].find(x => (x.dataset.pref || x.textContent) === key)?.focus({ preventScroll: true });
    }

    function openSettings() {
      if (!loaded || loadFailed) return;
      if (hasDownloads && !downloadArea.hidden) showDownloads(false);
      if (syncSetup()) return;
      settings.hidden = false;
      list.hidden = true;
      filters.hidden = true;
      views.hidden = true;
      btnSettings.classList.add('on');
      btnSettings.setAttribute('aria-expanded', 'true');
      renderSettings();
      settings.scrollTop = 0;
      autoNotice();
      settings.querySelector('button:not([hidden]),input:not([type=file]),select')?.focus();
    }

    function closeSettings() {
      if (syncSetup()) return;
      if (optionsPage) { renderSettings(); return; }   // ayarlar sayfasında ayarlar hep açık
      settings.hidden = true;
      list.hidden = false;
      btnSettings.classList.remove('on');
      btnSettings.setAttribute('aria-expanded', 'false');
      render();
      input.focus();
      autoNotice();
    }

    // Tek seferlik hedef: kalıcı tarama ayarlarına yazılmaz. İl değişimindeki geç yanıt önceki hedefi geri getiremez.
    const cbsScanSelection = { ilKodu: '', birimId: '', birimler: [], loading: false, ready: false, error: '', starting: false };
    let cbsScanEpoch = 0, syncCbsScan = null;
    function cbsScanControls() {
      if (!opts.onCbsScan || !opts.onCbsDirectory) return null;
      const s = cbsScanSelection;
      const il = el('select', { 'aria-label': 'Bir kez taranacak il', 'data-pref': 'cbsScanIl' },
        el('option', { value: '' }, 'İl seçin'), ILLER.map((ad, i) => [ad, i + 1]).sort((a, b) => a[0].localeCompare(b[0], 'tr'))
          .map(([ad, n]) => el('option', { value: String(n) }, ad)));
      il.value = s.ilKodu;
      const birim = el('select', { 'aria-label': 'Bir kez taranacak başsavcılık', 'data-pref': 'cbsScanBirim' });
      const scan = el('button', { class: 'btn sm primary', 'data-pref': 'cbsScanStart' }, 'Bir kez tara');
      const retry = el('button', { class: 'btn sm', hidden: true }, 'Başsavcılıkları tekrar al');
      const hint = el('div', { class: 'hint', role: 'status', 'aria-live': 'polite' });
      let drawnUnits = null;
      const sync = syncCbsScan = () => {
        if (drawnUnits !== s.birimler) {
          birim.replaceChildren(el('option', { value: '' }, 'İldeki tüm başsavcılıklar'),
            ...s.birimler.map(b => el('option', { value: b.birimId }, cleanBirim(b.birimAdi))));
          drawnUnits = s.birimler;
        }
        birim.value = s.birimId;
        birim.disabled = !s.ready || s.loading || s.starting;
        il.disabled = s.starting;
        scan.disabled = !s.ilKodu || !s.ready || !s.birimler.length || s.loading || s.starting || running() || !!pendingJob;
        scan.textContent = s.starting ? 'Başlatılıyor…' : 'Bir kez tara';
        retry.hidden = !s.error || s.ready || !s.ilKodu || s.loading;
        hint.textContent = s.error || (s.loading ? 'Başsavcılıklar UYAP’tan alınıyor…'
          : s.ready && !s.birimler.length ? 'UYAP bu il için başsavcılık vermedi. Başka il seçebilirsiniz.'
            : pendingJob ? 'Önce süren veya yarıda kalan güncellemeyi tamamlayın ya da iptal edin.'
              : 'Seçtiğiniz il veya başsavcılığın açık ve kapalı CBS dosyaları taranır. Genel güncelleme başlatılmaz; tarama ayarlarınız değişmez.');
      };
      sync();
      const loadDirectory = async () => {
        const epoch = ++cbsScanEpoch;
        s.ilKodu = il.value; s.birimId = ''; s.birimler = []; s.ready = false; s.error = ''; s.loading = !!s.ilKodu;
        syncCbsScan();
        if (!s.ilKodu) return;
        try {
          const res = await opts.onCbsDirectory(Number(s.ilKodu));
          if (epoch !== cbsScanEpoch) return;
          if (!res?.ok || !Array.isArray(res.birimler)) throw new Error(res?.error || 'Başsavcılıklar alınamadı. İli yeniden seçip deneyin.');
          s.birimler = res.birimler; s.ready = true;
        } catch (error) {
          if (epoch !== cbsScanEpoch) return;
          s.error = error.message || 'Başsavcılıklar alınamadı.';
        } finally {
          if (epoch === cbsScanEpoch) { s.loading = false; syncCbsScan(); }
        }
      };
      il.addEventListener('change', loadDirectory);
      retry.addEventListener('click', loadDirectory);
      birim.addEventListener('change', () => { s.birimId = birim.value; });
      scan.addEventListener('click', async () => {
        if (scan.disabled) return;
        s.starting = true; s.error = ''; syncCbsScan();
        try {
          const res = await opts.onCbsScan({ ilKodu: Number(s.ilKodu), birimId: s.birimId });
          if (!res?.ok) throw new Error(res?.error || 'CBS taraması başlatılamadı.');
          setNotice('CBS taraması başladı. İlerlemeyi durum satırından takip edebilir; Durdur ve Sürdür ile yönetebilirsiniz.');
        } catch (error) { s.error = error.message || 'CBS taraması başlatılamadı.'; }
        finally { s.starting = false; syncCbsScan(); }
      });
      return el('div', { class: 'box' }, el('b', null, 'CBS’yi bir kez tara'),
        el('div', { class: 'field' }, el('span', null, 'İl'), il),
        el('div', { class: 'field' }, el('span', null, 'Başsavcılık'), birim), el('div', { class: 'row' }, scan, retry), hint);
    }

    function renderSettings() {
      const version = (chrome.runtime && chrome.runtime.getManifest) ? chrome.runtime.getManifest().version : '';
      const check = (key, def, label, hint, onChange) => {
        const box = el('input', { type: 'checkbox', 'data-pref': key });
        box.checked = !!pref(key, def);
        box.addEventListener('change', async () => { await setPref(key, box.checked); if (onChange) onChange(box.checked); });
        return el('label', { class: 'check' }, box, el('div', null, el('div', null, label), hint ? el('div', { class: 'hint' }, hint) : null));
      };
      const select = (key, def, label, options, onChange) => {
        const sel = el('select', { 'aria-label': label, 'data-pref': key }, options.map(([v, t]) => el('option', { value: v, selected: pref(key, def) === v }, t)));
        sel.addEventListener('change', async () => { await setPref(key, sel.value); if (onChange) onChange(sel.value); });
        return el('div', { class: 'field' }, el('span', null, label), sel);
      };

      const scanTypes = globalThis.UHD.taramaKapsami(prefs).turler.map(t => t.kod);
      const scanChecks = globalThis.UHD.TURLER.map(t => {
        const box = el('input', { type: 'checkbox', 'data-pref': `taramaTur-${t.kod}` });
        box.checked = scanTypes.includes(t.kod);
        box.addEventListener('change', async () => {
          const selected = scanChecks.filter(label => label.querySelector('input').checked).map(label => label.querySelector('input').value);
          if (!selected.length && pref('savcilik', 'otomatik') === 'kapali') {
            box.checked = true;
            return setNotice('En az bir yargı türü seçin veya savcılık taramasını açın.', 'err');
          }
          try { await setPref('taramaTurleri', selected); }
          catch { box.checked = !box.checked; setNotice('Tarama kapsamı kaydedilemedi. Tekrar deneyin.', 'err'); }
        });
        box.value = t.kod;
        return el('label', { class: 'check' }, box, t.ad);
      });

      const btnSetup = el('button', { class: 'btn sm', disabled: running() || !!pendingJob }, 'Kurulum seçimlerini yeniden aç');
      btnSetup.addEventListener('click', async () => {
        try { await setPref('kurulumTamamlandi', false); syncSetup(); }
        catch { setNotice('Kurulum ekranı açılamadı. Tekrar deneyin.', 'err'); }
      });

      // Vekil adları: etiket olarak eklenir, çarpıyla çıkarılır.
      const names = myNames();
      const tags = el('div', { class: 'tags' });
      if (!names.length && detected) tags.append(el('span', { class: 'tag auto', title: 'Dosyalarda en çok vekil olarak geçen ad' }, `${trTitle(detected)} (otomatik)`));
      for (const n of names) {
        const x = el('button', { title: 'Çıkar', 'aria-label': `${n} adını çıkar` }, '×');
        x.addEventListener('click', async () => { await setPref('myName', myNames().filter(v => v !== n).join(', ')); renderSettings(); render(); });
        tags.append(el('span', { class: 'tag' }, trTitle(n), x));
      }
      const nameIn = el('input', { type: 'text', placeholder: 'Ad Soyad', 'aria-label': 'Müvekkilleri ayırmak için vekil adı', autocomplete: 'off', spellcheck: 'false' });
      const add = async () => {
        const v = nameIn.value.trim().replace(/^av\.?\s+/i, '');
        if (!v) return;
        // Otomatik bulunan ad da kalıcı etikete dönüşür; aynı ad iki kez eklenmez.
        const guncel = myNames();
        const base = guncel.length ? guncel : (detected ? [detected] : []);
        await setPref('myName', (base.some(x => nameKey(x) === nameKey(v)) ? base : [...base, v]).join(', '));
        renderSettings();
        render();
      };
      const addBtn = el('button', { class: 'btn sm' }, 'Ekle');
      addBtn.addEventListener('click', add);
      nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });

      // Savcılık dosyaları: taranacak iller. "Dosyalarımın bulunduğu iller"de ek iller etiket olarak eklenir.
      const ekIller = () => (Array.isArray(prefs.savcilikIller) ? prefs.savcilikIller : []).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= ILLER.length);
      const ilTags = el('div', { class: 'tags' }, ekIller().map(n => {
        const x = el('button', { title: 'Çıkar', 'aria-label': `${ILLER[n - 1]} ilini çıkar` }, '×');
        x.addEventListener('click', async () => { await setPref('savcilikIller', ekIller().filter(v => v !== n)); renderSettings(); });
        return el('span', { class: 'tag' }, ILLER[n - 1], x);
      }));
      const ilSec = el('select', { 'aria-label': 'Eklenecek il', 'data-pref': 'savcilikIlSec' }, el('option', { value: '' }, 'İl seçin'),
        ILLER.map((ad, i) => [ad, i + 1]).sort((a, b) => a[0].localeCompare(b[0], 'tr')).map(([ad, n]) => el('option', { value: String(n) }, ad)));
      const ilEkle = el('button', { class: 'btn sm' }, 'Ekle');
      ilEkle.addEventListener('click', async () => {
        const n = Number(ilSec.value);
        if (!n) return;
        if (!ekIller().includes(n)) await setPref('savcilikIller', [...ekIller(), n]);
        renderSettings();
      });
      // Bir sonraki Güncelle'de aranacak iller (başsavcılık rehberi varsa kayıtlardan hesaplanır).
      const kapsamYazi = el('div', { class: 'hint', 'aria-live': 'polite' });
      chrome.storage.local.get('uhdCbsRehber').then(({ uhdCbsRehber: rehber }) => {
        if (!rehber || !Array.isArray(rehber.iller)) { kapsamYazi.textContent = 'İller ilk Güncelle’de UYAP’tan alınır.'; return; }
        const kapsam = globalThis.UHD.cbsKapsam(rehber, records, prefs);
        kapsamYazi.textContent = kapsam.length ? `Sonraki Güncelle’de aranacak iller: ${kapsam.map(il => ilAdi(il.ad)).join(', ')}.` : 'Aranacak il yok; aşağıdan il ekleyin.';
      }).catch(() => {});

      const btnFull = el('button', { class: 'btn sm', title: 'Seçili kapsamdaki dosya listesini ve taraf bilgilerini baştan alır. Uzun sürebilir.' }, 'Baştan tara');
      btnFull.addEventListener('click', () => {
        if (confirm('Seçili tarama kapsamındaki dosyaların taraf bilgileri UYAP’tan baştan alınacak. Dosya sayısına göre uzun sürebilir; durdurursanız kaldığı yerden sürdürebilirsiniz. Devam edilsin mi?')) {
          closeSettings(); setNotice(''); opts.onUpdate(true);
        }
      });
      btnFull.disabled = running();
      const btnExport = el('button', { class: 'btn sm', title: 'Tüm dosyaları taraflar, son evrak, sonraki duruşma ve notlarla Excel’de açılabilen dosya olarak indirir.' }, 'Excel’e aktar (CSV)');
      btnExport.addEventListener('click', () => {
        if (!records.length) return setNotice(`Dışa aktarılacak dosya yok. Önce ${guncelleYeri} basın.`, 'err');
        exportCsv();
      });
      const btnBackup = el('button', { class: 'btn sm', title: 'Dosya listesi, notlar, duruşmalar, kalan tutar kayıtları, banka sorgusu ve talep/cevap özetleri ile ayarlar parola ile şifrelenmiş tek dosyaya yedeklenir. Hata raporlama onayı aktarılmaz.' }, 'Şifreli yedekle');
      btnBackup.addEventListener('click', exportBackup);
      const fileIn = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
      fileIn.addEventListener('change', () => { if (fileIn.files[0]) importBackup(fileIn.files[0]); fileIn.value = ''; });
      const btnRestore = el('button', { class: 'btn sm', title: 'Başka bilgisayarda alınan yedeği yükler; yeniden tarama gerekmez.' }, 'Yedekten yükle');
      btnRestore.addEventListener('click', () => fileIn.click());
      const btnClear = el('button', { class: 'btn sm danger', title: 'Eklentinin bu bilgisayarda sakladığı her şeyi siler.' }, 'Tüm verileri sil');
      btnClear.disabled = running();
      btnClear.addEventListener('click', async () => {
        if (!confirm('Dosya listesi, duruşmalar, notlarınız, gizlenen dosyalar, son açılanlar, toplu indirme planları ve ayarlarınız bu bilgisayardan silinsin mi? Bu işlem geri alınamaz; UYAP’taki dosyalarınız ve indirilmiş ZIP dosyaları etkilenmez.')) return;
        // İş sahipliği ve bütün veriler tek commit ile silinir; eski sekme tarama verilerini geri yazamaz.
        let result;
        try { result = await globalThis.UHDStorage.clearAppData(); }
        catch { setNotice('Yerel veriler silinemedi; hiçbir veri silinmedi. Yeniden deneyin.'); return; }
        if (result?.pending) { setNotice('Devam eden bir toplu indirme var. İndirmeyi durdurup parça kaydı bitince yeniden deneyin; hiçbir veri silinmedi.'); return; }
        if (!result?.cleared) { setNotice('Yerel veriler silinemedi; hiçbir veri silinmedi. Yeniden deneyin.'); return; }
        closeSettings();
        setNotice('Tüm yerel veriler silindi.');
      });

      const gz = Object.entries(gizli);
      const gzBox = el('div', null, gz.length ? gz.map(([k, g]) => {
        const b = el('button', { class: 'btn sm', title: 'Dosya yeniden arama sonuçlarında görünür' }, 'Aramalarda göster');
        b.addEventListener('click', () => unhideFile(k));
        return el('div', { class: 'gz' }, el('span', { title: `${g.dosyaNo} ${g.birimAdi}` }, `${g.dosyaNo} · ${cleanBirim(g.birimAdi)}`), b);
      }) : el('div', { class: 'hint' }, 'Gizlenen dosya yok. Bir dosyayı kartındaki göz simgesiyle aramalardan çıkarabilirsiniz.'));

      const back = el('button', { class: 'btn sm', hidden: optionsPage }, icon('back'), 'Geri');
      back.addEventListener('click', closeSettings);
      // Kısayol Chrome'un kısayollar sayfasından değiştirilir; o sayfa yalnız eklenti sayfasından açılabilir.
      const kisayolDegistir = optionsPage && chrome.tabs ? el('button', { class: 'btn sm' }, 'Kısayolu değiştir') : null;
      if (kisayolDegistir) kisayolDegistir.addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));
      const reportStatus = el('div', { class: 'hint', role: 'status' });
      const testReport = el('button', { class: 'btn sm' }, 'Test raporu gönder');
      testReport.disabled = !pref('hataRaporu', false);
      testReport.addEventListener('click', async () => {
        testReport.disabled = true;
        reportStatus.textContent = 'Test raporu gönderiliyor…';
        try {
          const result = await chrome.runtime.sendMessage({ type: 'uhd-error-report', report: {
            operation: 'test', source: typeof location !== 'undefined' && location.protocol === 'chrome-extension:' ? 'popup' : 'content', type: 'Error', frames: []
          } });
          reportStatus.textContent = result?.sent ? 'Sentry test raporunu kabul etti.' :
            result?.reason === 'limited' ? 'Gönderim sınırına ulaşıldı; daha sonra tekrar deneyin.' :
            result?.reason === 'disabled' ? 'Önce teknik hata raporlamasını açın.' : 'Test raporu gönderilemedi; bağlantıyı kontrol edin.';
        } catch { reportStatus.textContent = 'Test raporu gönderilemedi; uzantıyı yeniden yükleyip tekrar deneyin.'; }
        finally { testReport.disabled = !pref('hataRaporu', false); }
      });
      kisayolYaz();
      ayarKosu = running();
      settings.replaceChildren(
        el('div', { class: 'top' }, el(optionsPage ? 'h1' : 'b', null, 'Ayarlar'), back),

        el('h3', null, 'Müvekkil'),
        el('div', { class: 'box' },
          el('div', null, 'Müvekkil olarak gösterilecek vekil adları'),
          tags,
          el('div', { class: 'field' }, nameIn, addBtn),
          el('div', { class: 'hint' }, 'İlk UYAP bağlantısında hesabınızın adı otomatik alınır. Hesabınızın adının vekil olduğu taraflar kartta “Müvekkil” olarak gösterilir. Buraya eklediğiniz diğer vekil adları için de aynı ayrım yapılır. Hiç ad yoksa dosyalarda en çok vekil olarak geçen ad kullanılır.')),

        el('h3', null, 'Arama ve görünüm'),
        el('div', { class: 'box' },
          check('vekilAra', true, 'Karşı taraf vekillerinin adlarında da ara', 'Kapatırsanız avukat adıyla yapılan aramalarda yalnız taraflar ve dosya bilgileri aranır.', () => render()),
          select('siralama', 'relevance', 'Sonuç sıralaması', [['relevance', 'En uygun'], ['newest', 'Açılış: yeniden eskiye'], ['fileNo', 'Dosya no: büyükten küçüğe']], () => render()),
          select('tema', 'auto', 'Tema', [['auto', 'Sistemle aynı'], ['light', 'Açık'], ['dark', 'Koyu']], () => applyTheme())),

        el('h3', null, 'UYAP paneli'),
        el('div', { class: 'box' },
          check('panelSabit', true, 'Paneli sabit tut', 'Panel UYAP’ın yanına yerleşir, UYAP kalan alana sığar; panel yalnız siz kapatınca kapanır. Kapalıyken panel UYAP’ı küçültmeden üstte açılır, UYAP’a tıklayınca kapanır. Paneldeki raptiye de bu ayarı değiştirir.'),
          el('div', { class: 'field' }, kisayolSatiri, kisayolDegistir),
          el('div', { class: 'hint' }, 'Araç çubuğundaki Legaluga simgesi ve kısayol UYAP sekmesinde paneli açıp kapatır; başka sitelerde hızlı aramayı açar.')),

        el('h3', null, 'Dosya açma'),
        el('div', { class: 'box' },
          select('acilisSekme', 'yok', 'Dosya açılınca geçilecek sekme', [['yok', 'Hiçbiri'], ['evrak', 'Evrak'], ['taraf', 'Taraf bilgileri']]),
          el('div', { class: 'hint' }, 'Sekme o dosyada yoksa (ör. Yargıtay dosyaları) hiçbir şeye basılmaz.')),

        el('h3', null, 'Evrak görüntüleyici'),
        el('div', { class: 'box' },
          check('atifIsaretle', true, 'Evraktaki karar atıflarını işaretle', 'Açılan evrakın metni yalnız bu cihazda taranır; bulunan Yargıtay, Danıştay, AYM ve bölge adliye künyeleri Atıflar listesinde gösterilir. “Tam metni aç”a tıkladığınızda yalnız künye bilgisi mcp.legaluga.com’da açılan yeni sekmenin adresine eklenir; evrak metni gönderilmez.')),

        el('h3', null, 'Güncelleme'),
        el('div', { class: 'box' },
          el('div', null, 'Taranacak yargı türleri'),
          el('div', { class: 'setup-grid' }, scanChecks),
          select('taramaDurum', 'tum', 'Taranacak dosya durumu', [['tum', 'Açık ve kapalı dosyalar'], ['acik', 'Yalnız açık dosyalar'], ['kapali', 'Yalnız kapalı dosyalar']]),
          el('div', { class: 'hint' }, 'Bu seçimler UYAP’tan alınacak dosyaları belirler. Kapsam dışındaki önceki kayıtlar korunur; arama filtreleri kayıtlı listeyi daraltır. Süren taramada kapsam değişmez; yeni seçim bir sonraki güncellemede uygulanır.'),
          check('evrakTakip', evrakTakipAcik(prefs, records), 'Yeni evrakları bul', 'Her açık dosya için UYAP’a bir istek daha gider; dosya sayısına göre güncelleme belirgin uzar.'),
          check('safahatTakipOptIn', false, 'Son işlemi (safahat) kartta göster', 'Son elle çekilen ve kaydedilen safahattan en yeni işlemi kartta gösterir. Tarama safahat sorgusu yapmaz. Safahat sekmesindeki düğmeyle güncellenir.'),
          select('otoGuncelle', 'kapali', 'Otomatik güncelleme', [['kapali', 'Kapalı'], ['6s', '6 saatte bir'], ['gunluk', 'Günde bir']]),
          el('div', { class: 'hint' }, 'Otomatik güncelleme yalnız UYAP sekmesi açıkken, son güncellemenin üzerinden bu süre geçtiyse başlar.'),
          el('div', { class: 'row' }, btnFull, el('span', { class: 'hint' }, '“Güncelle” yalnız yeni dosyaların taraflarını alır; “Baştan tara” seçili kapsamdakileri yeniden alır.')),
          el('div', { class: 'row' }, btnSetup)),

        el('h3', null, 'Savcılık dosyaları'),
        cbsScanControls(),
        el('div', { class: 'box' },
          select('savcilik', 'otomatik', 'Aranacak iller', [['otomatik', 'Dosyalarımın bulunduğu iller'], ['secili', 'Yalnız seçtiğim iller'], ['tum', 'Tüm iller (yavaş)'], ['kapali', 'Savcılık dosyalarını arama']], () => renderSettings()),
          ['otomatik', 'secili'].includes(pref('savcilik', 'otomatik')) ? [
            el('div', { class: 'hint' }, pref('savcilik', 'otomatik') === 'secili' ? 'Yalnız aşağıya eklediğiniz iller taranır. İl eklemek için:' : 'İller mahkeme dosyalarınızın adliyelerinden bulunur (ör. Küçükçekmece → İstanbul). Başka il eklemek için:'),
            ilTags, el('div', { class: 'row' }, ilSec, ilEkle)] : null,
          pref('savcilik', 'otomatik') !== 'kapali' ? kapsamYazi : null,
          el('div', { class: 'hint' }, 'UYAP savcılık dosyalarını il il ve başsavcılık başsavcılık verir; Güncelle seçilen illerin bütün başsavcılıklarını sizin yerinize sorgular, büyükşehirler önce. Her başsavcılık için açık ve kapalı dosyalar ayrı sorgulanır (İstanbul’da 11 başsavcılık, 22 istek). UYAP savcılık dosyalarında taraf ve safahat vermez; evrak, Cumhuriyet savcısı inceleme talebinizi onaylayınca görünür.')),

        el('h3', null, 'UYAP'),
        el('div', { class: 'box' },
          check('durusmaBildirim', true, 'Yaklaşan duruşmaları hatırlat', 'Bugün ve yarınki duruşmaları bildirir. Duruşmalar ekranına her zaman ulaşabilirsiniz.', () => autoNotice()),
          check('cakismaBildirim', true, 'Duruşma çakışmalarını bildir', `Tarama varsayılan olarak kapalıdır; Duruşmalarım bölümünden açılır. Tarama açıkken aynı gün farklı mahkemelerdeki iki duruşma arasında aynı adliyede ${CAKISMA_DK.ayniAdliye} dakikadan, başka adliyede ${CAKISMA_DK.ayriAdliye / 60} saatten az varsa uyarır. Aynı mahkemedeki ve saati belli olmayan duruşmalar sayılmaz.`, () => autoNotice()),
          check('duyuruBildirim', true, 'Duyuruları bildirim olarak göster', 'Kesinti duyurusu UYAP Ana Sayfa’da, diğer duyurular sağ altta görünür. Metnin tamamını okuyabilirsiniz. × ile, sayfada boş bir yere tıklayarak ya da asistandan dosya açarak kapanır; başka bir ekrana geçince gizlenir.'),
          check('oturumAcik', true, 'UYAP oturumunu koru')),

        el('h3', null, 'Veriler'),
        el('div', { class: 'box' },
          el('div', { class: 'row' }, btnExport, btnBackup, btnRestore, fileIn),
          el('div', { class: 'hint' }, 'Yerel kayıtlar ve banka takip özetleri AES-256-GCM ile şifrelenir ve bu Chrome profilinde otomatik açılır. Banka kaydında banka adları, sorgu tarihi, borçlu adı ve kısa talep/cevap kanıtları tutulur; kimlik numarası, belge metni ve ham UYAP yanıtı saklanmaz. Anahtar aynı profilde tutulduğundan tüm profil ele geçirilirse koruma sınırlıdır. JSON yedeği ayrıca sizin belirlediğiniz parolayla şifrelenir; parolayı güvenli bir yerde saklayın. Hata raporlama onayı yedekten geri yüklenmez. CSV çıktısı şifresizdir ve dosya bilgileri içerir; güvenli bir yerde saklayın.'),
          el('div', { style: 'margin-top:10px' }, `Gizlenen dosyalar (${fmtNum(gz.length)})`),
          gzBox,
          el('div', { class: 'row' }, btnClear)),

        el('h3', null, 'Hata raporlama'),
        el('div', { class: 'box' },
          check('hataRaporu', false, 'Teknik hata raporlarını Sentry’ye gönder', 'Varsayılan olarak kapalıdır. Açıldığında hata türü, işlem, uzantı sürümü ve kod satırı gönderilir. Dosya numarası, kişi adı, evrak, hata metni, sayfa adresi ve oturum bilgileri gönderilmez. Sentry bağlantısı ağ adresinizi görür; rapora kullanıcı bilgisi eklenmez.', () => renderSettings()),
          testReport, reportStatus),

        el('h3', null, 'Hakkında'),
        el('div', { class: 'box' },
          el('div', null, el('b', null, BRAND.name), version ? ` · sürüm ${version}` : ''),
          el('div', { class: 'hint' }, 'Dosya indeksi, notlar ve banka takip özetleri bu Chrome profilinde şifreli saklanır. Evrak ve banka cevapları tarayıcıda işlenir. Banka sorgusu siz başlatınca çalışır; ücret bildiriliyorsa ayrıca onay gerekir. Talep evrakı kaydı gönderim veya tebliğ kanıtı değildir; cevap bulunmaması talep gönderilmediğini göstermez. Teknik hata raporları yalnız yukarıdaki ayarı açarsanız Sentry’ye gönderilir. Notlar eklentiye aittir; UYAP’taki notlarla ilgisi yoktur.'),
          el('div', { class: 'hint' }, BRAND.disclaimer),
          el('div', { class: 'hint' }, 'Görüş ve öneriler: ', el('a', { href: 'mailto:' + BRAND.email }, BRAND.email)),
          el('div', { class: 'row' },
            el('a', { href: BRAND.site, target: '_blank', rel: 'noopener' }, 'legaluga.com'),
            el('a', { href: 'https://github.com/hasanimer/legaluga-uyap-ui/blob/main/docs/PRIVACY.md', target: '_blank', rel: 'noopener' }, 'Gizlilik politikası'),
            el('a', { href: 'https://github.com/hasanimer/legaluga-uyap-ui', target: '_blank', rel: 'noopener' }, 'Arayüz kaynakları'))),
        el('p', { class: 'hint author-note' }, 'Bu eklenti, Av. Hasan İmer Akın tarafından meslektaşlarının ücretsiz kullanımı için geliştirilmiştir. Arayüz ve genel araçlar açık kaynaklıdır. ',
          el('a', { href: 'https://github.com/hasanimer/legaluga-uyap-ui/issues', target: '_blank', rel: 'noopener' }, 'Öneri ve hata bildirimi')));
      if (optionsPage) for (const h of settings.querySelectorAll('h3')) h.setAttribute('aria-level', '2');
    }

    // ------------------------------------------------ olaylar

    // Yazma bittikten kısa süre sonra ara; büyük listelerde ana iş parçacığını her tuşta meşgul etme.
    let typeTimer;
    input.addEventListener('input', () => {
      sel = 0;
      shownLimit = LIMIT;
      editing = null;
      person = null;
      btnQClear.hidden = !input.value;
      if (!settings.hidden) closeSettings();
      clearTimeout(typeTimer);
      typeTimer = setTimeout(() => { typeTimer = null; render(); list.scrollTop = 0; }, records.length > 3000 ? 100 : 60);
    });
    // Oklar sonuç seçer; Tab tarayıcının doğal odak sırasını korur.
    input.addEventListener('keydown', e => {
      if (e.isComposing) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        if (typeTimer) { clearTimeout(typeTimer); typeTimer = null; render(); }
        if (e.key === 'ArrowDown') { e.preventDefault(); select(sel + 1, true, true); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); select(sel - 1, true, true); }
        else if (current[sel]) { e.preventDefault(); openRecord(current[sel]); }
      }
    });
    root.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || e.defaultPrevented || optionsPage) return;
      if (setupOpen) return;
      e.preventDefault(); e.stopPropagation();
      clearTimeout(typeTimer);
      if (!settings.hidden) closeSettings();
      else if (person) closePerson();
      else if (input.value) { input.value = ''; sel = 0; shownLimit = LIMIT; render(); input.focus(); }
      else if (filter.onlyDurusma || filter.onlyNew) { switchView('files'); input.focus(); }
      else if (filtersExpanded) { filtersExpanded = false; renderFilters(); input.focus(); }
      else if (opts.onEscape) opts.onEscape();
      else if (opts.onClose) opts.onClose();
    });
    btnQClear.addEventListener('click', () => { input.value = ''; input.dispatchEvent(new Event('input')); input.focus(); });
    btnHelp.addEventListener('click', () => {
      const kisayol = !shortcut ? '' : quick ? ` ${shortcut} bu pencereyi, UYAP sekmesinde ise paneli açar.` : ` ${shortcut} paneli açıp kapatır.`;
      setNotice('İsim, dosya no, mahkeme veya not yazın; Türkçe karakter gerekmez. ↑ ↓ ile sonuç seçin, Enter ile açın. Tab kontrollere geçer, Esc bir adım geri döner.' + kisayol, '', { label: 'Tamam', fn: () => { setNotice(''); input.focus(); } });
    });
    btnUpdate.addEventListener('click', () => { setNotice(''); opts.onUpdate(false); });
    btnStop.addEventListener('click', async () => {
      if (pendingJob?.setupPending) return opts.onStop();
      if (running()) {
        if (stopping) return;
        stopping = true;
        renderStatus();
        return opts.onStop();
      }
      // Yürüten sekme yok: duraklamış işi doğrudan iptal et (popup'ta açık UYAP sekmesi olmayabilir).
      const pending = pendingJob, priorProgress = progress;
      if (!pending?.id) return;
      const { uhdScanEpoch: epoch } = await chrome.storage.local.get('uhdScanEpoch');
      await globalThis.UHDStorage.stopScan({ jobId: pending.id, epoch, owner: priorProgress?.owner ?? null,
        running: !!priorProgress?.running, beat: priorProgress?.beat ?? null, stop: false });
    });
    btnSettings.addEventListener('click', () => {
      if (hasDownloads && !downloadArea.hidden) { showDownloads(false); openSettings(); return; }
      return opts.onSettings ? opts.onSettings() : settings.hidden ? openSettings() : closeSettings();
    });
    btnTheme.addEventListener('click', async () => {
      await setPref('tema', TEMA[temaAyari()].sonraki);
      applyTheme();
      say(`Tema: ${TEMA[temaAyari()].ad}.`);
    });

    render();
    function loadInitial() {
      const initialPrefsRevision = prefsRevision;
      const initialTurFilterRevision = turFilterRevision;
      const initialBalanceRevision = balanceRevision;
      return chrome.storage.local.get(['uhdIndex', 'uhdProgress', 'uhdNotes', 'uhdRecent', 'uhdPrefs', 'uhdEvrakGoruldu', 'uhdJob', 'uhdDurusmalar', 'uhdGizli', 'uhdTurFilter', 'uhdBalances']).then(v => {
        if (loadFailed) setNotice('');
        loaded = true;
        loadFailed = false;
        btnSettings.disabled = false;
        btnTheme.disabled = false;
        btnUpdate.disabled = false;
        if (prefsRevision === initialPrefsRevision) prefs = v.uhdPrefs || {};
        if (quick) ozetTur = v.uhdTurFilter?.pinned === false || !Array.isArray(v.uhdTurFilter?.tur) ? [] : v.uhdTurFilter.tur;
        else if (!pendingTurWrites && turFilterRevision === initialTurFilterRevision) readTurFilter(v.uhdTurFilter);
        applyTheme();
        durusmaMeta = v.uhdDurusmalar || null;
        gizli = v.uhdGizli || {};
        computeDurusma();
        goruldu = v.uhdEvrakGoruldu || {};
        pendingJob = v.uhdJob || null;
        setIndex(v.uhdIndex);
        progress = v.uhdProgress || null;
        notes = v.uhdNotes || {};
        if (balanceRevision === initialBalanceRevision) {
          try { balances = globalThis.UHD.checkBalanceStore(v.uhdBalances).files; } catch { balances = {}; }
        }
        recent = v.uhdRecent || [];
        renderFilters();
        render();
        renderStatus();
        autoNotice();
        if (optionsPage) openSettings();
      }).catch(() => {
        loaded = false;
        loadFailed = true;
        btnSettings.disabled = true;
        btnTheme.disabled = true;
        btnUpdate.disabled = true;
        render();
        setNotice('Yerel ayarlar ve dosyalar okunamadı. Tekrar deneyin; eklentiyi güncellediyseniz UYAP sayfasını yenileyin.', 'err', { label: 'Tekrar dene', fn: loadInitial });
      });
    }
    loadInitial();
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area !== 'local') return;
      let redraw = false;
      if (ch.uhdPrefs) { prefsRevision++; prefs = ch.uhdPrefs.newValue || {}; applyTheme(); redraw = true; }
      if (ch.uhdTurFilter && !quick) {
        turFilterRevision++;
        if (!pendingTurWrites) {
          const v = ch.uhdTurFilter.newValue;
          if (v && v.pinned === false) filter.turPinned = false;
          else readTurFilter(v);
          sel = 0; shownLimit = LIMIT;
          renderFilters(); redraw = true;
        }
      }
      if (ch.uhdEvrakGoruldu) goruldu = ch.uhdEvrakGoruldu.newValue || {};
      if (ch.uhdJob) pendingJob = ch.uhdJob.newValue || null;
      if (ch.uhdGizli) { gizli = ch.uhdGizli.newValue || {}; renderFilters(); redraw = true; }
      if (ch.uhdDurusmalar) durusmaMeta = ch.uhdDurusmalar.newValue || null;
      if (ch.uhdDurusmalar || ch.uhdPrefs) { computeDurusma(); renderFilters(); redraw = true; }
      if (ch.uhdIndex) setIndex(ch.uhdIndex.newValue);
      else if (ch.uhdEvrakGoruldu) computeYeni();
      if (ch.uhdIndex || ch.uhdEvrakGoruldu) { renderFilters(); redraw = true; }
      if (ch.uhdNotes) { notes = ch.uhdNotes.newValue || {}; redraw = true; }
      if (ch.uhdBalances) {
        balanceRevision++;
        try { balances = globalThis.UHD.checkBalanceStore(ch.uhdBalances.newValue).files; } catch { balances = {}; }
        redraw = true;
      }
      if (ch.uhdRecent) recent = ch.uhdRecent.newValue || [];
      if (ch.uhdProgress) {
        progress = ch.uhdProgress.newValue || null;
        if (!records.length) redraw = true;   // ilk kullanım ekranındaki düğmenin durumu
      }
      if (redraw && !editing && settings.hidden) render();
      if (!settings.hidden && (ch.uhdPrefs || ch.uhdGizli || ch.uhdIndex || (ch.uhdProgress && running() !== ayarKosu))) refreshSettings();
      if (ch.uhdIndex || ch.uhdProgress || ch.uhdJob) renderStatus();
      if (ch.uhdProgress || ch.uhdJob) syncSetupScanNotice();
      if ((ch.uhdProgress || ch.uhdJob) && syncCbsScan) syncCbsScan();
      if (ch.uhdIndex || ch.uhdProgress || ch.uhdEvrakGoruldu || ch.uhdDurusmalar || ch.uhdPrefs) autoNotice();
    });
    setInterval(renderStatus, 5000);

    return {
      root,
      input,
      setNotice,
      setSetupConnection(value) { onboarding?.setConnection?.(value); },
      focus() { if (hasDownloads && !downloadArea.hidden) downloadArea.querySelector('h3')?.focus(); else if (setupOpen) onboarding?.focus(); else { input.focus(); input.select(); } },
      setQuery(q) { input.value = q || ''; render(); },
      setBusy,
      getNote: key => notes[key] || '',
      saveNote,
      refreshStatus: renderStatus,
      showDurusmalar,
      showDownloads,
      // Dosya ekranındaki "Bu dosyadaki yeni evrakları görüldü say".
      markSeen: (keys, kadar) => markSeen(keys, false, kadar),
      // Popup'taki özet satırından gelen istek: 'hearings' duruşmalar (7 gün), 'hearings-today' bugünküler,
      // 'hearings-cakisma' çakışanlar, 'new' yeni evrak, diğerleri dosyalar.
      showView(name) {
        if (hasDownloads && !downloadArea.hidden) showDownloads(false);
        if (name === 'hearings' || name === 'hearings-today' || name === 'hearings-cakisma') {
          showDurusmalar(name === 'hearings-today' ? 'today' : name === 'hearings-cakisma' ? 'cakisma' : 'week');
          return;
        }
        input.value = '';
        switchView(name === 'new' ? 'new' : 'files');
        input.focus();
      }
    };
  }

  globalThis.UHD.el = el;
  globalThis.UHD.mountUI = mountUI;
})();
