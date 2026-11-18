/* Haqqul Yaqeen: Internet Archive bridge.
   Public read-only APIs only. No credentials or keys are used. */
const HY_BOOKS = [{"key": "maarif", "name": "معارف القرآن", "author": "مفتی محمد شفیع عثمانی", "volumes": 8}, {"key": "anwar", "name": "انوار البیان", "author": "مولانا عاشق الٰہی بلند شہری", "volumes": 7}, {"key": "thanvi", "name": "بیان القرآن، حکیم الامت تھانوی", "author": "مولانا اشرف علی تھانوی", "volumes": 3}, {"key": "majidi", "name": "تفسیر ماجدی", "author": "مولانا عبدالماجد دریابادی", "volumes": 1}, {"key": "ibn-kathir", "name": "تفسیر ابن کثیر اردو", "author": "حافظ ابن کثیر", "volumes": 5}, {"key": "jalalain", "name": "تفسیر جلالین اردو", "author": "جلال الدین محلی و جلال الدین سیوطی", "volumes": 1}, {"key": "bayan-israr", "name": "بیان القرآن، ڈاکٹر اسرار احمد", "author": "ڈاکٹر اسرار احمد", "volumes": 2}, {"key": "qurtubi", "name": "تفسیر قرطبی اردو", "author": "امام قرطبی", "volumes": 10}, {"key": "zia", "name": "ضیاء القرآن", "author": "پیر محمد کرم شاہ الازہری", "volumes": 5}, {"key": "mazhari", "name": "تفسیر مظہری اردو", "author": "قاضی ثناء اللہ پانی پتی", "volumes": 9}, {"key": "ahsan", "name": "احسن البیان فی علوم القرآن", "author": "مولانا غلام رسول قاسمی", "volumes": 1}];
const mapUrl = new URL("./archive-map.json", location.href);
const api = "https://archive.org";
const $ = (s, r=document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const encPath = s => String(s).split("/").map(encodeURIComponent).join("/");
const pdfUrl = (id, name) => `${api}/download/${encodeURIComponent(id)}/${encPath(name)}`;
let config = {version:1, books:{}};
let activeBook = null, activeDoc = null, pdfjs = null, pdfDoc = null, pageNum = 1, scale = 1.15;
const status = (msg, bad=false) => { const el=$("#status"); if(el){el.textContent=msg;el.className=bad?"bad":"";} };
async function getJSON(url) {
  const res = await fetch(url, {mode:"cors", credentials:"omit"});
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
async function loadConfig() {
  try {
    const r=await fetch(mapUrl,{cache:"no-store"});
    if(r.ok) config=await r.json();
  } catch(e) {}
  try {
    const local=JSON.parse(localStorage.getItem("hy-archive-map")||"null");
    if(local && local.books) config={...config,books:{...config.books,...local.books}};
  } catch(e) {}
}
function renderBooks() {
  const root=$("#book-list");
  root.innerHTML=HY_BOOKS.map(b=>{
    const saved=(config.books||{})[b.key];
    const count=saved?.items?.length||0;
    return `<article class="book" data-key="${esc(b.key)}">
      <div class="book-head"><div><h3>${esc(b.name)}</h3><p>${esc(b.author)} · متوقع جلدیں: ${b.volumes}</p></div>
      <span class="pill ${count?"ok":""}">${count?count+" Archive item(s) محفوظ":"ابھی Archive سے منسلک نہیں"}</span></div>
      <div class="actions"><button class="primary find" data-key="${esc(b.key)}">Archive پر تلاش کریں</button>
      <button class="secondary add" data-key="${esc(b.key)}">Identifier شامل کریں</button>
      ${count?`<button class="secondary open" data-key="${esc(b.key)}">محفوظ جلدیں دیکھیں</button>`:""}
      </div><div class="results" id="results-${esc(b.key)}"></div>
    </article>`;
  }).join("");
  root.querySelectorAll(".find").forEach(b=>b.addEventListener("click",()=>searchBook(b.dataset.key)));
  root.querySelectorAll(".add").forEach(b=>b.addEventListener("click",()=>askIdentifier(b.dataset.key)));
  root.querySelectorAll(".open").forEach(b=>b.addEventListener("click",()=>showSaved(b.dataset.key)));
}
function queryFor(book) {
  // Broad title search. Search results are candidates, never silently treated as verified matches.
  const terms = book.name.replace(/[،()]/g," ").trim().split(/\s+/).filter(x=>x.length>2).slice(0,4);
  return terms.map(t=>`title:${JSON.stringify(t)}`).join(" AND ");
}
async function searchBook(key) {
  const book=HY_BOOKS.find(b=>b.key===key), box=$("#results-"+key);
  if(!book||!box)return;
  box.innerHTML='<p class="muted">Internet Archive پر تلاش ہو رہی ہے…</p>';
  status("Archive.org سے نتائج حاصل کیے جا رہے ہیں۔");
  try {
    const q=queryFor(book)+" AND mediatype:texts";
    const url=`${api}/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=year&rows=12&page=1&output=json`;
    const data=await getJSON(url);
    const docs=data?.response?.docs||[];
    if(!docs.length){box.innerHTML='<p class="bad">کوئی امیدوار item نہیں ملا۔ آپ درست Identifier دستی طور پر درج کر سکتے ہیں۔</p>';status("کوئی Archive item نہیں ملا۔",true);return;}
    box.innerHTML='<p class="muted">یہ ممکنہ نتائج ہیں۔ درست ایڈیشن منتخب کریں، عنوان ملتا جلتا ہونا کافی نہیں۔</p>'+
      docs.map(d=>`<div class="candidate"><div><b>${esc(d.title||d.identifier)}</b><small>${esc(d.creator||"مصنف درج نہیں")} · ${esc(d.year||"سال نامعلوم")} · <code>${esc(d.identifier)}</code></small></div><button class="primary choose" data-id="${esc(d.identifier)}" data-key="${esc(key)}">اس item کی PDFs دیکھیں</button></div>`).join("");
    box.querySelectorAll(".choose").forEach(btn=>btn.addEventListener("click",()=>loadItemForBook(key,btn.dataset.id)));
    status(`${docs.length} ممکنہ نتائج ملے۔ درست item کی تصدیق کریں۔`);
  } catch(e) {
    box.innerHTML=`<p class="bad">Archive search اس وقت دستیاب نہیں: ${esc(e.message)}۔ اگر browser CORS یا network error دے تو بعد میں دوبارہ کوشش کریں یا Identifier دستی طور پر درج کریں۔</p>`;
    status("Archive search ناکام ہوئی۔",true);
  }
}
async function askIdentifier(key) {
  const id=prompt("Internet Archive item identifier درج کریں۔ مثال: item-identifier");
  if(!id)return;
  await loadItemForBook(key,id.trim());
}
function normalizeVol(name) {
  const s=name.toLowerCase();
  const m=s.match(/(?:vol(?:ume)?|jild|جلد|جلد نمبر|part)[\s._-]*([0-9۰-۹٠-٩]+)/i);
  if(m) return Number(m[1].replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const nums=s.match(/[0-9]+/);
  return nums?Number(nums[0]):999;
}
async function metadata(id) {
  const data=await getJSON(`${api}/metadata/${encodeURIComponent(id)}`);
  if(!data || !Array.isArray(data.files)) throw new Error("Item metadata میں files کی فہرست موجود نہیں۔");
  const files=data.files.filter(f=>{
    const name=String(f.name||"");
    const fmt=String(f.format||"").toLowerCase();
    return /\.pdf$/i.test(name) && !/thumb|_text|abbyy|djvu\.xml/i.test(name) &&
      (f.source==="original" || fmt.includes("pdf") || !f.source);
  });
  files.sort((a,b)=>{
    const av=normalizeVol(a.name), bv=normalizeVol(b.name);
    return av===bv?String(a.name).localeCompare(String(b.name),undefined,{numeric:true}):av-bv;
  });
  return {data,files};
}
async function loadItemForBook(key,id) {
  const box=$("#results-"+key);
  box.innerHTML=`<p class="muted">Identifier <code>${esc(id)}</code> کی اصل metadata اور PDF فائلیں چیک ہو رہی ہیں…</p>`;
  try {
    const {data,files}=await metadata(id);
    if(!files.length) throw new Error("اس item میں کوئی اصل PDF فائل نہیں ملی۔ ممکن ہے PDF کے بجائے DJVU یا کوئی دوسرا format ہو۔");
    const item={identifier:id,title:data.metadata?.title||id,creator:data.metadata?.creator||"",files:files.map(f=>({name:f.name,size:Number(f.size)||0,format:f.format||"PDF"}))};
    config.books[key]=config.books[key]||{items:[]};
    const old=config.books[key].items.findIndex(x=>x.identifier===id);
    if(old>=0)config.books[key].items[old]=item;else config.books[key].items.push(item);
    localStorage.setItem("hy-archive-map",JSON.stringify(config));
    renderBooks();
    const target=$("#results-"+key);
    target.innerHTML=`<div class="success">✓ ${esc(item.title)} سے ${files.length} اصل PDF فائلیں مل گئیں۔ یہ انتخاب اس browser میں محفوظ ہے۔</div>`+
      renderFileList(key,item);
    status(`${files.length} PDFs دریافت ہوئیں۔ اصل ایڈیشن کی تصدیق ضروری ہے۔`);
  } catch(e) {
    box.innerHTML=`<p class="bad">یہ item استعمال نہیں ہو سکا: ${esc(e.message)}</p>`;
    status("Item validation ناکام ہوئی۔",true);
  }
}
function renderFileList(key,item) {
  return `<div class="files"><h4>${esc(item.title)} <small>(${esc(item.identifier)})</small></h4>`+
    item.files.map((f,i)=>`<div class="file-row"><span><b>${esc(f.name)}</b><small>${f.size? (f.size/1048576).toFixed(1)+" MB":"سائز دستیاب نہیں"}</small></span>
      <button class="primary read" data-id="${esc(item.identifier)}" data-name="${esc(f.name)}">Read Online</button>
      <a class="secondary download" href="${pdfUrl(item.identifier,f.name)}?download=1" target="_blank" rel="noopener">Download</a></div>`).join("")+"</div>";
}
function showSaved(key) {
  const book=HY_BOOKS.find(b=>b.key===key), box=$("#results-"+key), saved=config.books[key];
  if(!saved?.items?.length){box.innerHTML='<p class="muted">ابھی کوئی Archive item محفوظ نہیں۔</p>';return;}
  box.innerHTML=saved.items.map(item=>renderFileList(key,item)).join("")+
    `<button class="secondary export-one" data-key="${esc(key)}">اس کتاب کی mapping export کریں</button>`;
  bindRead(box);
  box.querySelector(".export-one")?.addEventListener("click",exportConfig);
}
function bindRead(root=document) {
  root.querySelectorAll(".read").forEach(btn=>btn.addEventListener("click",()=>openReader(btn.dataset.id,btn.dataset.name)));
}
async function openReader(id,name) {
  const modal=$("#reader-modal");
  modal.hidden=false; $("#reader-title").textContent=name; $("#reader-status").textContent="PDF لوڈ ہو رہی ہے…";
  $("#pdf-canvas").hidden=true; pdfDoc=null; pageNum=1;
  try {
    if(!pdfjs) {
      pdfjs=await import("./lib/pdf.min.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc=new URL("./lib/pdf.worker.min.mjs",location.href).href;
    }
    const url=pdfUrl(id,name);
    const task=pdfjs.getDocument({url,withCredentials:false,isEvalSupported:false,wasmUrl:new URL("./lib/wasm/",location.href).href});
    pdfDoc=await task.promise;
    $("#reader-status").textContent=`صفحہ ${pageNum} / ${pdfDoc.numPages}`;
    await renderPage();
  } catch(e) {
    $("#reader-status").innerHTML=`PDF.js اس PDF کو براہ راست نہیں کھول سکا: ${esc(e.message)}۔ ممکنہ وجہ CORS یا Archive کی عارضی خرابی ہے۔ نیچے Archive کا embedded reader آزمائیں۔`;
    $("#archive-fallback").src=`https://archive.org/embed/${encodeURIComponent(id)}`;
    $("#archive-fallback").hidden=false;
    $("#pdf-canvas").hidden=true;
  }
}
async function renderPage() {
  if(!pdfDoc)return;
  const page=await pdfDoc.getPage(pageNum), viewport=page.getViewport({scale});
  const canvas=$("#pdf-canvas"),ctx=canvas.getContext("2d");
  const dpr=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.floor(viewport.width*dpr);canvas.height=Math.floor(viewport.height*dpr);
  canvas.style.width=viewport.width+"px";canvas.style.height=viewport.height+"px";
  await page.render({canvasContext:ctx,viewport:page.getViewport({scale:scale*dpr})}).promise;
  $("#reader-status").textContent=`صفحہ ${pageNum} / ${pdfDoc.numPages}`;
  $("#archive-fallback").hidden=true;canvas.hidden=false;
}
function exportConfig() {
  const blob=new Blob([JSON.stringify(config,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="archive-map.json";a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}
function importConfig(file) {
  const r=new FileReader();r.onload=()=>{try{const v=JSON.parse(r.result);if(!v.books)throw new Error("Invalid mapping");config={version:1,books:v.books};localStorage.setItem("hy-archive-map",JSON.stringify(config));renderBooks();status("Mapping import ہو گئی۔")}catch(e){status("JSON فائل درست نہیں۔",true)}};r.readAsText(file);
}
document.addEventListener("DOMContentLoaded",async()=>{
  await loadConfig();renderBooks();
  $("#export-config").addEventListener("click",exportConfig);
  $("#import-config").addEventListener("change",e=>e.target.files[0]&&importConfig(e.target.files[0]));
  $("#close-reader").addEventListener("click",()=>{$("#reader-modal").hidden=true;$("#archive-fallback").hidden=true;$("#archive-fallback").src="about:blank";if(pdfDoc){pdfDoc.destroy();pdfDoc=null;}});
  $("#prev-page").addEventListener("click",async()=>{if(pdfDoc&&pageNum>1){pageNum--;await renderPage();}});
  $("#next-page").addEventListener("click",async()=>{if(pdfDoc&&pageNum<pdfDoc.numPages){pageNum++;await renderPage();}});
  $("#zoom-in").addEventListener("click",async()=>{scale=Math.min(2.5,scale+.15);await renderPage();});
  $("#zoom-out").addEventListener("click",async()=>{scale=Math.max(.6,scale-.15);await renderPage();});
});
