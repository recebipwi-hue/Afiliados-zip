(function () {
  "use strict";
  var cfg = window.SITE_CONFIG || {};

  // Menu mobile
  var btn = document.querySelector(".menu-btn");
  var menu = document.getElementById("menu");
  if (btn && menu) {
    btn.addEventListener("click", function () {
      var open = menu.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  // Lista de espera: liga os botões se os links estiverem configurados
  var wl = document.querySelectorAll("[data-waitlist]");
  var hasForm = !!(cfg.WAITLIST_FORM_URL && cfg.WAITLIST_FORM_URL.trim());
  Array.prototype.forEach.call(wl, function (a) {
    if (hasForm) {
      a.href = cfg.WAITLIST_FORM_URL.trim();
      a.target = "_blank";
      a.rel = "noopener";
      a.hidden = false;
    } else {
      a.hidden = true;
    }
  });
  var wa = document.querySelectorAll("[data-whatsapp]");
  var num = (cfg.WHATSAPP_NUMBER || "").replace(/\D/g, "");
  Array.prototype.forEach.call(wa, function (a) {
    if (num) {
      var msg = encodeURIComponent("Olá! Quero entrar na lista de espera do Afiliados Passo a Passo IA.");
      a.href = "https://wa.me/" + num + "?text=" + msg;
      a.target = "_blank";
      a.rel = "noopener";
      a.hidden = false;
    } else {
      a.hidden = true;
    }
  });
  var soon = document.getElementById("waitlist-soon");
  if (soon) soon.hidden = hasForm || !!num;

  // Formulário de suporte (só valida, não envia)
  var form = document.getElementById("support-form");
  if (!form) return;
  var status = document.getElementById("form-status");

  function setErr(id, msg) {
    var field = document.getElementById(id);
    var out = document.getElementById(id + "-err");
    if (out) out.textContent = msg || "";
    if (field) {
      field.classList.toggle("invalid", !!msg);
      field.setAttribute("aria-invalid", msg ? "true" : "false");
    }
    return !msg;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    status.className = "form-status";
    status.textContent = "";
    if (form.website && form.website.value) return; // campo armadilha

    var email = form.email.value.trim();
    var ok = true;
    ok = setErr("email", !email ? "Informe seu e-mail." : (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "" : "E-mail inválido.")) && ok;
    ok = setErr("categoria", form.categoria.value ? "" : "Escolha uma categoria.") && ok;
    ok = setErr("assunto", form.assunto.value.trim() ? "" : "Informe o assunto.") && ok;
    ok = setErr("mensagem", form.mensagem.value.trim().length >= 10 ? "" : "Descreva com pelo menos 10 caracteres.") && ok;

    if (!ok) {
      status.className = "form-status warn";
      status.textContent = "Corrija os campos destacados.";
      var first = form.querySelector(".invalid");
      if (first) first.focus();
      return;
    }
    status.className = "form-status warn";
    status.textContent = "Campos válidos. O envio ainda não está ativo, então nada foi enviado nem guardado.";
  });
})();
