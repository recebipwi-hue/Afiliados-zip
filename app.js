(function () {
  "use strict";
  var CFG = window.SITE_CONFIG || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- utilitários ---------- */
  function el(tag, props, kids) {
    var n = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      if (k === "text") n.textContent = props[k];
      else if (k === "class") n.className = props[k];
      else if (k.indexOf("on") === 0) n.addEventListener(k.slice(2), props[k]);
      else n.setAttribute(k, props[k]);
    });
    (kids || []).forEach(function (c) {
      if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return n;
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function fmtDate(ts) {
    try { return new Date(ts).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); }
    catch (e) { return new Date(ts).toISOString(); }
  }
  function fmtSize(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB"; }
  function say(node, text, kind) { node.className = "status" + (kind ? " " + kind : ""); node.textContent = text; }
  function radio(name) { var r = $('input[name="' + name + '"]:checked'); return r ? r.value : ""; }
  function setRadio(name, value) { var r = $('input[name="' + name + '"][value="' + value + '"]'); if (r) r.checked = true; }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (res, rej) {
      var t = el("textarea", { style: "position:fixed;left:-9999px" });
      t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand("copy") ? res() : rej(); } catch (e) { rej(e); }
      document.body.removeChild(t);
    });
  }
  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = el("a", { href: url, download: name });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 15000);
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function short(s, n) { return s.length > n ? s.slice(0, n - 1).trim() + "…" : s; }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  /* ---------- armazenamento local ---------- */
  var LS_SCRIPTS = "afpp.scripts.v1", LS_MSGS = "afpp.msgs.v1";
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch (e) { return []; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

  var dbP = null;
  function openDB() {
    if (dbP) return dbP;
    dbP = new Promise(function (res, rej) {
      if (!window.indexedDB) { rej(new Error("sem IndexedDB")); return; }
      var r = indexedDB.open("afpp", 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("videos", { keyPath: "id" }); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    dbP.catch(function () { dbP = null; });
    return dbP;
  }
  function idb(mode, fn) {
    return openDB().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction("videos", mode);
        var rq = fn(tx.objectStore("videos"));
        tx.oncomplete = function () { res(rq ? rq.result : undefined); };
        tx.onerror = function () { rej(tx.error); };
        tx.onabort = function () { rej(tx.error || new Error("abortado")); };
      });
    });
  }

  /* ---------- abas ---------- */
  var tabs = $$('.tab-nav [role="tab"]');
  var panels = $$('[role="tabpanel"]');
  function showTab(id) {
    tabs.forEach(function (t) {
      var on = t.getAttribute("aria-controls") === id;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
    });
    panels.forEach(function (p) { p.hidden = p.id !== id; });
    if (id === "tab-historico") renderHistory();
    window.scrollTo(0, 0);
    try { history.replaceState(null, "", "#" + id); } catch (e) { /* ok */ }
  }
  tabs.forEach(function (t) {
    t.addEventListener("click", function () { showTab(t.getAttribute("aria-controls")); });
  });
  function tabFromHash() {
    var h = (location.hash || "").slice(1);
    if (h && /^tab-/.test(h) && document.getElementById(h)) showTab(h);
  }
  tabFromHash();
  window.addEventListener("hashchange", tabFromHash);

  /* =====================================================
     1. EDITAR VÍDEO
     ===================================================== */
  var RATIOS = { "9:16": [720, 1280], "1:1": [720, 720], "16:9": [1280, 720] };
  var SAFE = { tiktok: 0.20, reels: 0.18, shorts: 0.16 };
  var PLAT_NAMES = { tiktok: "TikTok", reels: "Reels", shorts: "Shorts" };

  var vid = $("#srcVideo"), pv = $("#pv"), pctx = pv.getContext("2d");
  var fileIn = $("#fileIn"), fileInfo = $("#fileInfo"), seek = $("#seek");
  var btnPlay = $("#btnPlay"), btnGen = $("#btnGen"), btnCancel = $("#btnCancel");
  var prog = $("#prog"), genStatus = $("#genStatus");
  var srcURL = null, srcName = "video", busy = false, cancelFlag = false, outURL = null;

  function getOpts() {
    var ratio = radio("ratio"), plat = radio("plat");
    return {
      platform: plat, ratio: ratio, style: radio("style"),
      fx: +$("#fx").value / 100, fy: +$("#fy").value / 100, zoom: +$("#zoom").value / 100,
      captions: $("#caps").value.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean),
      safeBottom: ratio === "9:16" ? (SAFE[plat] || 0.18) : 0.08
    };
  }

  function wrapLines(ctx, text, maxW) {
    var words = text.split(/\s+/), lines = [], cur = "";
    words.forEach(function (w) {
      var test = cur ? cur + " " + w : w;
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
      else cur = test;
    });
    if (cur) lines.push(cur);
    return lines;
  }

  function drawCaption(ctx, W, H, text, safeBottom) {
    var size = Math.round(Math.min(W, H) * 0.062);
    ctx.font = "700 " + size + "px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    var lines = wrapLines(ctx, text, W * 0.84).slice(0, 4);
    var lh = size * 1.25, padX = size * 0.6, padY = size * 0.45;
    var maxLine = 0;
    lines.forEach(function (l) { maxLine = Math.max(maxLine, ctx.measureText(l).width); });
    var bw = maxLine + padX * 2, bh = lines.length * lh + padY * 2;
    var bx = (W - bw) / 2, by = H * (1 - safeBottom) - bh;
    ctx.fillStyle = "rgba(0,0,0,0.62)";
    var r = size * 0.35;
    ctx.beginPath();
    ctx.moveTo(bx + r, by); ctx.lineTo(bx + bw - r, by); ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
    ctx.lineTo(bx + bw, by + bh - r); ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
    ctx.lineTo(bx + r, by + bh); ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
    ctx.lineTo(bx, by + r); ctx.quadraticCurveTo(bx, by, bx + r, by); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#fff";
    lines.forEach(function (l, i) { ctx.fillText(l, W / 2, by + padY + lh * (i + 0.5)); });
  }

  // Desenha um quadro: corte proporcional (cover), nunca estica.
  function drawFrame(ctx, W, H, v, o, t, dur) {
    ctx.save();
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    var vw = v.videoWidth, vh = v.videoHeight;
    if (!vw || !vh) { ctx.restore(); return; }
    var z = o.zoom, p = dur ? Math.min(1, t / dur) : 0;
    var hasFilter = "filter" in ctx;
    if (o.style === "dinamico") {
      z *= 1 + 0.06 * (0.5 - 0.5 * Math.cos(t * 2 * Math.PI / 5));
      if (hasFilter) ctx.filter = "contrast(1.08) saturate(1.2)";
    }
    var s = Math.max(W / vw, H / vh) * z;
    var dw = vw * s, dh = vh * s;
    ctx.drawImage(v, -(dw - W) * o.fx, -(dh - H) * o.fy, dw, dh);
    if (hasFilter) ctx.filter = "none";
    if (o.style === "dinamico") {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillRect(0, 0, W * p, Math.max(4, H * 0.006));
    }
    if (o.style === "legendado" && o.captions.length && dur) {
      var idx = Math.min(o.captions.length - 1, Math.floor(p * o.captions.length));
      drawCaption(ctx, W, H, o.captions[idx], o.safeBottom);
    }
    ctx.restore();
  }

  function sizePreview() {
    var d = RATIOS[radio("ratio")];
    pv.width = d[0] / 2; pv.height = d[1] / 2;
  }
  function renderPreview() {
    drawFrame(pctx, pv.width, pv.height, vid, getOpts(), vid.currentTime || 0, vid.duration || 0);
  }
  sizePreview(); renderPreview();

  function setControls(on) {
    btnPlay.disabled = !on; btnGen.disabled = !on; seek.disabled = !on;
  }

  fileIn.addEventListener("change", function () {
    var f = fileIn.files && fileIn.files[0];
    if (!f) return;
    if (f.type && f.type.indexOf("video/") !== 0) { say(genStatus, "Escolha um arquivo de vídeo.", "err"); return; }
    if (srcURL) URL.revokeObjectURL(srcURL);
    vid.pause();
    setControls(false);
    srcURL = URL.createObjectURL(f);
    srcName = f.name.replace(/\.[^.]+$/, "") || "video";
    vid.src = srcURL; vid.load();
    fileInfo.textContent = f.name + " · " + fmtSize(f.size) + " · carregando…";
    say(genStatus, "", "");
    $("#result").hidden = true;
  });
  vid.addEventListener("loadedmetadata", function () {
    seek.max = vid.duration || 1; seek.value = 0;
    var d = Math.round(vid.duration);
    fileInfo.textContent = (fileIn.files[0] ? fileIn.files[0].name + " · " : "") + vid.videoWidth + "×" + vid.videoHeight + " · " + d + " s";
    if (d > 180) say(genStatus, "Vídeo longo: gerar leva cerca de " + Math.ceil(d / 60) + " min, porque a gravação é em tempo real.", "warn");
    try { vid.currentTime = Math.min(0.1, vid.duration / 2); } catch (e) { /* ok */ }
    setControls(true);
  });
  vid.addEventListener("loadeddata", renderPreview);
  vid.addEventListener("seeked", renderPreview);
  vid.addEventListener("error", function () {
    if (!srcURL) return;
    setControls(false);
    say(genStatus, "Não consegui ler este vídeo neste navegador (formato não suportado). Tente outro arquivo ou o Chrome.", "err");
    fileInfo.textContent = "Não foi possível abrir o vídeo.";
  });

  function onSettingChange() { if (vid.paused) renderPreview(); }
  ["fx", "fy", "zoom"].forEach(function (id) {
    $("#" + id).addEventListener("input", function () {
      $("#fxo").textContent = $("#fx").value;
      $("#fyo").textContent = $("#fy").value;
      $("#zo").textContent = $("#zoom").value + "%";
      onSettingChange();
    });
  });
  $$('input[name="ratio"]').forEach(function (r) {
    r.addEventListener("change", function () { sizePreview(); onSettingChange(); });
  });
  $$('input[name="plat"]').forEach(function (r) {
    r.addEventListener("change", function () { setRadio("ratio", "9:16"); sizePreview(); onSettingChange(); });
  });
  $$('input[name="style"]').forEach(function (r) {
    r.addEventListener("change", function () {
      $("#capsBox").hidden = radio("style") !== "legendado";
      onSettingChange();
    });
  });
  $("#caps").addEventListener("input", onSettingChange);

  seek.addEventListener("input", function () {
    if (!vid.paused) vid.pause();
    try { vid.currentTime = +seek.value; } catch (e) { /* ok */ }
  });

  function previewLoop() {
    if (vid.paused || vid.ended) { btnPlay.textContent = "▶ Ver prévia"; renderPreview(); return; }
    renderPreview();
    seek.value = vid.currentTime;
    requestAnimationFrame(previewLoop);
  }
  btnPlay.addEventListener("click", function () {
    if (!srcURL || busy) return;
    if (vid.paused) {
      if (vid.ended) vid.currentTime = 0;
      vid.muted = false;
      var pr = vid.play();
      if (pr && pr.catch) pr.catch(function () { say(genStatus, "Não foi possível tocar a prévia.", "err"); });
      btnPlay.textContent = "⏸ Pausar";
      requestAnimationFrame(previewLoop);
    } else {
      vid.pause();
    }
  });

  function pickMime() {
    if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
    var c = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    for (var i = 0; i < c.length; i++) { if (MediaRecorder.isTypeSupported(c[i])) return c[i]; }
    return "";
  }

  function lockUI(on) {
    busy = on;
    $$("#tab-editar input, #tab-editar textarea").forEach(function (n) { n.disabled = on; });
    $$(".tab-nav button").forEach(function (b) { b.disabled = on; });
    btnPlay.disabled = on || !srcURL; btnGen.disabled = on || !srcURL; seek.disabled = on || !srcURL;
    fileIn.disabled = on;
    prog.hidden = !on; btnCancel.hidden = !on;
    if (!on) prog.value = 0;
  }

  btnCancel.addEventListener("click", function () { cancelFlag = true; });

  btnGen.addEventListener("click", function () {
    if (!srcURL || busy) return;
    var o = getOpts();
    if (o.style === "legendado" && !o.captions.length) {
      say(genStatus, "No estilo Legendado, digite pelo menos uma linha de legenda.", "err");
      $("#caps").focus();
      return;
    }
    if (!HTMLCanvasElement.prototype.captureStream || typeof MediaRecorder === "undefined") {
      say(genStatus, "Este navegador não consegue gravar o vídeo editado. Use o Chrome atualizado no Android ou no computador.", "err");
      return;
    }
    vid.pause();
    runExport(o);
  });

  function runExport(o) {
    var dims = RATIOS[o.ratio], W = dims[0], H = dims[1];
    var mime = pickMime();
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var ctx = cv.getContext("2d");
    var ev = document.createElement("video");
    ev.playsInline = true; ev.preload = "auto"; ev.src = srcURL;
    var ac = null, stream = null, rec = null, chunks = [], stopped = false, dead = false, raf = 0;
    cancelFlag = false;
    lockUI(true);
    $("#result").hidden = true;
    say(genStatus, "Preparando…", "");

    function cleanup() {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      ev.onerror = null; ev.onloadedmetadata = null; ev.onended = null;
      try { ev.pause(); } catch (e) { /* ok */ }
      if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
      if (ac && ac.close) { try { ac.close(); } catch (e) { /* ok */ } }
      ev.removeAttribute("src"); try { ev.load(); } catch (e) { /* ok */ }
      lockUI(false);
      renderPreview();
    }
    function fail(msg) { dead = true; cleanup(); say(genStatus, msg, "err"); }

    ev.onerror = function () { fail("Não consegui ler o vídeo para gerar."); };
    ev.onloadedmetadata = function () {
      var dur = ev.duration;
      if (!isFinite(dur) || dur <= 0) { fail("Não consegui descobrir a duração deste vídeo."); return; }
      stream = cv.captureStream(30);
      var withAudio = false;
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        ac = new AC();
        var node = ac.createMediaElementSource(ev);
        var dest = ac.createMediaStreamDestination();
        node.connect(dest); // não conecta aos alto-falantes: grava em silêncio
        dest.stream.getAudioTracks().forEach(function (t) { stream.addTrack(t); withAudio = true; });
        if (ac.state === "suspended") ac.resume();
      } catch (e) { withAudio = false; }

      try {
        rec = mime ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4000000 }) : new MediaRecorder(stream);
      } catch (e) { fail("Este navegador não conseguiu iniciar a gravação."); return; }
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onerror = function () { fail("Erro durante a gravação."); };
      rec.onstop = function () {
        if (dead) return;
        var type = (rec.mimeType || mime || "video/webm").split(";")[0];
        var canceled = cancelFlag;
        cleanup();
        if (canceled) { say(genStatus, "Cancelado.", "warn"); return; }
        var blob = new Blob(chunks, { type: type });
        if (!blob.size) { say(genStatus, "O vídeo gerado ficou vazio. Tente novamente no Chrome.", "err"); return; }
        finish(blob, type, o, withAudio);
      };

      function frame() {
        if (stopped) return;
        drawFrame(ctx, W, H, ev, o, ev.currentTime, dur);
        prog.value = Math.min(100, (ev.currentTime / dur) * 100);
        say(genStatus, "Gerando… " + Math.round(prog.value) + "% (mantenha esta aba aberta)", "");
        if (cancelFlag) { try { rec.stop(); } catch (e) { fail("Cancelado."); } return; }
        if (ev.requestVideoFrameCallback) ev.requestVideoFrameCallback(frame);
        else raf = requestAnimationFrame(frame);
      }
      ev.onended = function () {
        drawFrame(ctx, W, H, ev, o, dur, dur);
        setTimeout(function () { try { if (rec.state !== "inactive") rec.stop(); } catch (e) { /* ok */ } }, 250);
      };
      rec.start(1000);
      var pr = ev.play();
      if (pr && pr.then) pr.then(frame, function () { fail("O navegador bloqueou a reprodução. Toque em Gerar novamente."); });
      else frame();
    };
  }

  function finish(blob, type, o, withAudio) {
    var ext = type.indexOf("mp4") >= 0 ? "mp4" : "webm";
    var name = (srcName + "-" + o.platform + "-" + o.ratio.replace(":", "x") + "-" + o.style).replace(/[^\w\-]+/g, "_") + "." + ext;
    if (outURL) URL.revokeObjectURL(outURL);
    outURL = URL.createObjectURL(blob);
    $("#outVideo").src = outURL;
    var a = $("#btnDownload"); a.href = outURL; a.setAttribute("download", name);
    $("#fmtNote").textContent = "Formato: " + ext.toUpperCase() + " · " + fmtSize(blob.size) + (withAudio ? "" : " · sem áudio (o navegador não permitiu capturar o som)") +
      (ext === "webm" ? ". Algumas redes podem não aceitar WEBM; se acontecer, converta para MP4 ou gere no Chrome mais recente." : ".");
    $("#result").hidden = false;
    say(genStatus, "Pronto! Confira abaixo e baixe. Salvando no histórico…", "ok");
    idb("readwrite", function (st) {
      return st.put({ id: uid(), name: name, createdAt: Date.now(), mime: type, size: blob.size, blob: blob,
        platform: o.platform, ratio: o.ratio, style: o.style });
    }).then(function () {
      say(genStatus, "Pronto! Baixe abaixo. Uma cópia foi salva no Histórico (só neste aparelho).", "ok");
    }).catch(function () {
      say(genStatus, "Pronto! Baixe abaixo. Não consegui salvar no Histórico (armazenamento indisponível ou cheio).", "warn");
    });
    setTimeout(function () { $("#result").scrollIntoView({ behavior: "smooth", block: "start" }); }, 100);
  }

  /* =====================================================
     2. CRIAR ROTEIRO SEM ROSTO (modelos prontos, sem IA)
     ===================================================== */
  var TIPOS = { review: "Review", venda: "Venda", informativo: "Informativo" };
  var ESTILOS = { ugc: "UGC sem rosto", produto: "Produto", textotela: "Texto na tela" };

  var DATA = {
    review: {
      gancho: ["Testei {p}. Vou te contar o que achei.", "{P}: será que vale a pena? Olha isso.", "Antes de comprar {p}, assiste isso."],
      problema: ["Comprar {p} sem ver ninguém usando dá insegurança, né?", "Tem muita opção de {p} e fica difícil saber qual faz sentido pra você.", "Dúvida comum: {p} entrega o que promete? Vamos ver na prática."],
      solucao: ["Mostrando {p} em uso:\n1) [algo bom que você realmente notou]\n2) [um ponto de atenção ou limitação]\n3) [para quem faz sentido]\nFale só do que você conferiu.",
        "Minha avaliação de {p}:\n[o que funcionou] / [o que poderia ser melhor] / [para quem eu indicaria].\nSeja honesto, sem exagerar."],
      cta: ["Se fez sentido pra você, o link está na bio/descrição. Confira preço e avaliações lá antes de decidir.", "Quer ver mais detalhes? Link na descrição. Compare com calma antes de comprar."],
      tela: ["{S}: vale a pena?", "O que eu testei", "O que achei", "Link na bio"]
    },
    venda: {
      gancho: ["Procurando {p}? Presta atenção nesses segundos.", "Olha o que eu achei sobre {p}.", "Se {p} está na sua lista, vê isso antes."],
      problema: ["O problema: [descreva a dor real que {p} ajuda a resolver].", "Quem precisa de {p} conhece: [situação do dia a dia ligada ao produto].", "Perder tempo procurando {p} cansa."],
      solucao: ["Mostre {p} em ação: [benefício real 1] e [benefício real 2].\nCite só o que o produto de fato oferece e confira preço e condições na página de venda.",
        "Com {p}: [o que muda na rotina] / [diferencial real].\nNada de promessa que o produto não cumpre."],
      cta: ["Link na bio/descrição. Veja preço, prazo e condições na página antes de comprar.", "Gostou? Toque no link, leia a descrição e decida com calma."],
      tela: ["{S}", "Resolve: [problema]", "Veja os detalhes", "Link na bio"]
    },
    informativo: {
      gancho: ["3 pontos para olhar antes de escolher {p}.", "Você sabe o que avaliar em {p}?", "Um cuidado antes de comprar {p}."],
      problema: ["Escolher {p} sem critério pode sair caro.", "Comprar {p} só pelo preço pode dar dor de cabeça.", "Tem informação demais sobre {p} e pouca explicação simples."],
      solucao: ["Ponto 1: [critério, ex.: tamanho, material, uso].\nPonto 2: [critério].\nPonto 3: [critério].\nSe fizer sentido, mostre {p} como exemplo.",
        "Antes de decidir sobre {p}, compare: [critério 1], [critério 2] e [critério 3]."],
      cta: ["Salva esse vídeo pra consultar depois. Se quiser ver {p}, o link está na descrição.", "Quer ver o exemplo que citei? Link na descrição."],
      tela: ["O que olhar em {S}", "Ponto 1", "Pontos 2 e 3", "Link na descrição"]
    }
  };
  var CENAS = {
    ugc: ["Gancho: mãos entrando no quadro com o produto, plano fechado, sem mostrar o rosto. Voz em off ou texto na tela.",
      "Problema: mostre a situação do dia a dia só com mãos e objetos (ex.: mesa bagunçada, dúvida).",
      "Solução: close nas mãos usando o produto, com 2 ou 3 ângulos de uso.",
      "CTA: mão apontando para baixo (onde fica o link) com texto grande na tela."],
    produto: ["Gancho: produto girando sobre superfície limpa, luz suave.",
      "Problema: corte para fundo neutro com texto grande descrevendo a dor.",
      "Solução: close nos detalhes (material, tamanho, botões) e uma cena do produto em uso.",
      "CTA: produto centralizado com o texto do link na tela."],
    textotela: ["Gancho: fundo liso com uma frase grande, sem precisar gravar nada.",
      "Problema: fundo + texto + 1 imagem do produto (use só imagens que você tem direito de usar).",
      "Solução: uma frase por tela, 2 a 3 segundos cada, com imagens ou vídeos do produto.",
      "CTA: tela final com o texto do link e uma seta."]
  };
  var TEMPOS = ["0–3 s", "3–9 s", "9–22 s", "22–30 s"];
  var CHECK = ["Só diga que testou se testou de verdade, e só cite benefícios que o produto realmente tem.",
    "Avise que é divulgação ou link de afiliado (ex.: #publi), conforme as regras da plataforma e do programa.",
    "Não prometa resultado, preço fixo, estoque ou prazo que você não controla.",
    "Use só imagens, vídeos e músicas que você pode usar."];

  function fill(t, p) { return t.replace(/\{S\}/g, cap(short(p, 32))).replace(/\{P\}/g, cap(p)).replace(/\{p\}/g, p); }

  function buildScript(produto, tipo, estilo) {
    var p = produto.trim().replace(/\s+/g, " ");
    var d = DATA[tipo], c = CENAS[estilo];
    return {
      id: uid(), createdAt: Date.now(), produto: p, tipo: tipo, estilo: estilo,
      sections: [
        { titulo: "Gancho de 3s", tempo: TEMPOS[0], texto: fill(pick(d.gancho), p) },
        { titulo: "Problema", tempo: TEMPOS[1], texto: fill(pick(d.problema), p) },
        { titulo: "Solução", tempo: TEMPOS[2], texto: fill(pick(d.solucao), p) },
        { titulo: "CTA", tempo: TEMPOS[3], texto: fill(pick(d.cta), p) },
        { titulo: "Texto para tela", tempo: "", texto: d.tela.map(function (t) { return fill(t, p); }).join("\n") },
        { titulo: "Sugestão de cena", tempo: "", texto: c.join("\n") }
      ]
    };
  }
  function scriptToText(s) {
    var out = "ROTEIRO — " + TIPOS[s.tipo] + " · " + ESTILOS[s.estilo] + "\nProduto: " + s.produto + "\n";
    s.sections.forEach(function (x) {
      out += "\n" + x.titulo.toUpperCase() + (x.tempo ? " (" + x.tempo + ")" : "") + "\n" + x.texto + "\n";
    });
    out += "\nANTES DE POSTAR\n- " + CHECK.join("\n- ") + "\n";
    return out;
  }
  function telaOf(s) {
    for (var i = 0; i < s.sections.length; i++) if (s.sections[i].titulo === "Texto para tela") return s.sections[i].texto;
    return "";
  }
  function useAsCaptions(s) {
    $("#caps").value = telaOf(s);
    setRadio("style", "legendado");
    $("#capsBox").hidden = false;
    showTab("tab-editar");
    onSettingChange();
  }

  var lastScript = null;
  var rotStatus = $("#rotStatus");

  function renderScript(s) {
    lastScript = s;
    var out = $("#rotOut"); out.textContent = "";
    out.appendChild(el("h2", { text: "Seu roteiro", style: "margin:.6em 0 .4em" }));
    s.sections.forEach(function (sec) {
      out.appendChild(el("div", { class: "box script-sec" }, [
        el("h3", { text: sec.titulo }),
        sec.tempo ? el("p", { class: "tempo", text: "Duração sugerida: " + sec.tempo }) : null,
        el("p", { class: "pre", text: sec.texto })
      ]));
    });
    out.appendChild(el("div", { class: "box" }, [
      el("h3", { text: "Antes de postar" }),
      el("ul", { class: "check" }, CHECK.map(function (t) { return el("li", { text: t }); })),
      el("p", { class: "note", text: "Este roteiro é um ponto de partida. Nenhum roteiro garante vendas ou alcance." })
    ]));
    out.appendChild(el("div", { class: "btns" }, [
      el("button", { class: "btn big", type: "button", text: "📋 Copiar tudo", onclick: function () {
        copyText(scriptToText(s)).then(function () { say(rotStatus, "Roteiro copiado.", "ok"); }, function () { say(rotStatus, "Não consegui copiar. Selecione o texto manualmente.", "err"); });
      } }),
      el("button", { class: "btn big ghost", type: "button", text: "💾 Salvar no histórico", onclick: function () {
        var list = lsGet(LS_SCRIPTS);
        if (list.some(function (x) { return x.id === s.id; })) { say(rotStatus, "Este roteiro já está salvo.", "warn"); return; }
        list.unshift(s);
        var saved = lsSet(LS_SCRIPTS, list);
        say(rotStatus, saved ? "Salvo no histórico (só neste aparelho)." : "Não consegui salvar: armazenamento indisponível.", saved ? "ok" : "err");
      } }),
      el("button", { class: "btn big ghost", type: "button", text: "🔁 Gerar outra versão", onclick: function () { $("#rot-form").requestSubmit ? $("#rot-form").requestSubmit() : submitRot(); } }),
      el("button", { class: "btn big ghost", type: "button", text: "🎬 Usar texto na tela como legenda", onclick: function () { useAsCaptions(s); } })
    ]));
  }

  function submitRot() {
    var v = $("#produto").value.trim();
    var err = $("#produto-err");
    if (v.length < 3) {
      err.textContent = "Escreva a ideia do produto (pelo menos 3 letras).";
      $("#produto").classList.add("invalid"); $("#produto").focus();
      return;
    }
    err.textContent = ""; $("#produto").classList.remove("invalid");
    var s = buildScript(v, radio("tipo"), radio("rstyle"));
    renderScript(s);
    say(rotStatus, "", "");
    $("#rotOut").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  $("#rot-form").addEventListener("submit", function (e) { e.preventDefault(); submitRot(); });

  /* =====================================================
     3. HISTÓRICO
     ===================================================== */
  var histToken = 0;
  var histStatus = $("#histStatus");

  function histSection(title) {
    var wrap = el("div", { class: "box" }, [el("h2", { text: title })]);
    $("#histBox").appendChild(wrap);
    return wrap;
  }

  function renderHistory() {
    var token = ++histToken;
    var box = $("#histBox"); box.textContent = "";
    var endpoint = (CFG.SUPPORT_ENDPOINT || "").trim();

    // Roteiros
    var secR = histSection("Roteiros salvos");
    var scripts = lsGet(LS_SCRIPTS);
    if (!scripts.length) secR.appendChild(el("p", { class: "empty", text: "Nenhum roteiro salvo ainda." }));
    scripts.forEach(function (s) {
      secR.appendChild(el("div", { class: "item" }, [
        el("strong", { text: short(s.produto, 50) }),
        el("p", { class: "meta", text: fmtDate(s.createdAt) + " · " + TIPOS[s.tipo] + " · " + ESTILOS[s.estilo] }),
        el("details", {}, [el("summary", { text: "Ver roteiro" }), el("p", { class: "pre", text: scriptToText(s) })]),
        el("div", { class: "btns" }, [
          el("button", { class: "btn small ghost", type: "button", text: "Copiar", onclick: function () {
            copyText(scriptToText(s)).then(function () { say(histStatus, "Roteiro copiado.", "ok"); }, function () { say(histStatus, "Não consegui copiar.", "err"); });
          } }),
          el("button", { class: "btn small ghost", type: "button", text: "Usar como legenda", onclick: function () { useAsCaptions(s); } }),
          el("button", { class: "btn small danger", type: "button", text: "Excluir", onclick: function () {
            lsSet(LS_SCRIPTS, lsGet(LS_SCRIPTS).filter(function (x) { return x.id !== s.id; }));
            renderHistory();
          } })
        ])
      ]));
    });

    // Vídeos
    var secV = histSection("Vídeos editados");
    secV.appendChild(el("p", { class: "empty", text: "Carregando…" }));
    idb("readonly", function (st) { return st.getAll(); }).then(function (rows) {
      if (token !== histToken) return;
      secV.removeChild(secV.lastChild);
      rows = (rows || []).sort(function (a, b) { return b.createdAt - a.createdAt; });
      if (!rows.length) secV.appendChild(el("p", { class: "empty", text: "Nenhum vídeo salvo ainda." }));
      rows.forEach(function (r) {
        var holder = el("div", {});
        var url = null;
        secV.appendChild(el("div", { class: "item" }, [
          el("strong", { text: r.name }),
          el("p", { class: "meta", text: fmtDate(r.createdAt) + " · " + (PLAT_NAMES[r.platform] || "") + " " + r.ratio + " · " + r.style + " · " + fmtSize(r.size) }),
          el("div", { class: "btns" }, [
            el("button", { class: "btn small ghost", type: "button", text: "Ver", onclick: function () {
              if (url) { URL.revokeObjectURL(url); url = null; holder.textContent = ""; return; }
              url = URL.createObjectURL(r.blob);
              holder.appendChild(el("video", { src: url, controls: "", playsinline: "" }));
            } }),
            el("button", { class: "btn small", type: "button", text: "Baixar", onclick: function () { download(r.blob, r.name); } }),
            el("button", { class: "btn small danger", type: "button", text: "Excluir", onclick: function () {
              idb("readwrite", function (st) { return st["delete"](r.id); }).then(renderHistory, function () { say(histStatus, "Não consegui excluir.", "err"); });
            } })
          ]),
          holder
        ]));
      });
    }).catch(function () {
      if (token !== histToken) return;
      secV.removeChild(secV.lastChild);
      secV.appendChild(el("p", { class: "empty", text: "Armazenamento de vídeos indisponível neste navegador (modo privado ou bloqueado)." }));
    });

    // Mensagens de suporte
    var secM = histSection("Mensagens de suporte");
    var msgs = lsGet(LS_MSGS);
    if (!msgs.length) secM.appendChild(el("p", { class: "empty", text: "Nenhuma mensagem." }));
    msgs.forEach(function (m) {
      secM.appendChild(el("div", { class: "item" }, [
        el("span", { class: "tag-pend", text: "Não enviada" }),
        el("p", { class: "meta", text: fmtDate(m.createdAt) + " · " + m.categoria }),
        el("strong", { text: m.assunto }),
        el("p", { class: "pre", text: m.mensagem }),
        el("div", { class: "btns" }, [
          el("button", { class: "btn small danger", type: "button", text: "Excluir", onclick: function () {
            lsSet(LS_MSGS, lsGet(LS_MSGS).filter(function (x) { return x.id !== m.id; }));
            renderHistory();
          } })
        ])
      ]));
    });
    if (msgs.length && endpoint) {
      secM.appendChild(el("div", { class: "btns" }, [el("button", { class: "btn small", type: "button", text: "Enviar pendentes agora", onclick: sendPending })]));
    }
  }

  $("#btnClear").addEventListener("click", function () {
    if (!window.confirm("Apagar todos os roteiros, vídeos e mensagens salvos neste aparelho?")) return;
    try { localStorage.removeItem(LS_SCRIPTS); localStorage.removeItem(LS_MSGS); } catch (e) { /* ok */ }
    idb("readwrite", function (st) { return st.clear(); }).then(function () {
      say(histStatus, "Histórico apagado.", "ok"); renderHistory();
    }, function () {
      say(histStatus, "Roteiros e mensagens apagados. Não consegui limpar os vídeos.", "warn"); renderHistory();
    });
  });

  /* =====================================================
     4. SUPORTE
     ===================================================== */
  var supStatus = $("#supStatus");

  function postMsg(endpoint, m) {
    return fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ email: m.email, categoria: m.categoria, assunto: m.assunto, mensagem: m.mensagem, enviadoEm: new Date(m.createdAt).toISOString() })
    }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); });
  }
  function sendPending() {
    var endpoint = (CFG.SUPPORT_ENDPOINT || "").trim();
    var msgs = lsGet(LS_MSGS);
    if (!endpoint || !msgs.length) return;
    var left = [];
    msgs.reduce(function (p, m) {
      return p.then(function () { return postMsg(endpoint, m); }).catch(function () { left.push(m); });
    }, Promise.resolve()).then(function () {
      lsSet(LS_MSGS, left);
      say(histStatus, left.length ? "Algumas mensagens não foram enviadas e continuam salvas." : "Mensagens enviadas.", left.length ? "warn" : "ok");
      renderHistory();
    });
  }

  function setErr(id, msg) {
    var f = document.getElementById(id), o = document.getElementById(id + "-err");
    if (o) o.textContent = msg || "";
    if (f) { f.classList.toggle("invalid", !!msg); f.setAttribute("aria-invalid", msg ? "true" : "false"); }
    return !msg;
  }

  $("#sup-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target;
    if (f.website.value) return; // campo-armadilha preenchido
    var email = f.email.value.trim();
    var ok = true;
    ok = setErr("s-email", !email ? "Informe seu e-mail." : (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "" : "E-mail inválido.")) && ok;
    ok = setErr("s-cat", f.categoria.value ? "" : "Escolha uma categoria.") && ok;
    ok = setErr("s-ass", f.assunto.value.trim() ? "" : "Informe o assunto.") && ok;
    ok = setErr("s-msg", f.mensagem.value.trim().length >= 10 ? "" : "Descreva com pelo menos 10 caracteres.") && ok;
    if (!ok) {
      say(supStatus, "Corrija os campos destacados.", "warn");
      var first = f.querySelector(".invalid"); if (first) first.focus();
      return;
    }
    var m = { id: uid(), createdAt: Date.now(), email: email, categoria: f.categoria.value, assunto: f.assunto.value.trim(), mensagem: f.mensagem.value.trim() };
    var endpoint = (CFG.SUPPORT_ENDPOINT || "").trim();

    function savePending() {
      var list = lsGet(LS_MSGS); list.unshift(m);
      return lsSet(LS_MSGS, list);
    }
    if (endpoint) {
      say(supStatus, "Enviando…", "");
      postMsg(endpoint, m).then(function () {
        say(supStatus, "Mensagem enviada. Obrigado!", "ok"); f.reset();
      }).catch(function () {
        var saved = savePending();
        say(supStatus, "Não consegui enviar agora." + (saved ? " Sua mensagem ficou salva neste aparelho (aba Histórico)." : ""), "warn");
      });
    } else {
      var saved = savePending();
      if (saved) { say(supStatus, "O envio ainda não está configurado, então a mensagem NÃO foi enviada a ninguém. Ela ficou salva só neste aparelho (aba Histórico).", "warn"); f.reset(); }
      else say(supStatus, "O envio ainda não está configurado e não consegui salvar a mensagem neste aparelho. Copie o texto e use a página de contato mais tarde.", "err");
    }
  });
})();
