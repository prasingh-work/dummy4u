/* Hash generator. Requires assets/base.js (loaded first).
   SHA-1/256/384/512 come from the Web Crypto API. MD5 is implemented here
   because Web Crypto deliberately omits it — it is broken for security and
   Google will not ship it, but it is still everywhere in checksums and
   legacy integrations, so the tool would be half-useful without it. */
(function () {
  "use strict";

  var form = document.getElementById("tool-form");
  if (!form) return;

  /* ---------- MD5 (RFC 1321) over a byte array ---------- */
  var MD5_K = [];
  for (var mi = 0; mi < 64; mi++) MD5_K[mi] = (Math.abs(Math.sin(mi + 1)) * 4294967296) | 0;
  var MD5_S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,
               5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,
               4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,
               6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];

  function rotl(x, c) { return (x << c) | (x >>> (32 - c)); }

  function md5(bytes) {
    var len = bytes.length;
    // message + 0x80 + zero padding to 56 mod 64 + 64-bit little-endian length
    var padded = new Uint8Array((((len + 8) >> 6) + 1) << 6);
    padded.set(bytes);
    padded[len] = 0x80;
    var bitLen = len * 8;
    for (var b = 0; b < 4; b++) padded[padded.length - 8 + b] = (bitLen >>> (8 * b)) & 0xff;
    // bits 32..63 of the length: only meaningful past 512 MB, kept for correctness
    var hi = Math.floor(len / 536870912);
    for (b = 0; b < 4; b++) padded[padded.length - 4 + b] = (hi >>> (8 * b)) & 0xff;

    var a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    var M = new Int32Array(16);

    for (var chunk = 0; chunk < padded.length; chunk += 64) {
      for (var j = 0; j < 16; j++) {
        var o = chunk + j * 4;
        M[j] = padded[o] | (padded[o + 1] << 8) | (padded[o + 2] << 16) | (padded[o + 3] << 24);
      }
      var A = a0, B = b0, C = c0, D = d0;
      for (var i = 0; i < 64; i++) {
        var F, g;
        if (i < 16)      { F = (B & C) | (~B & D);        g = i; }
        else if (i < 32) { F = (D & B) | (~D & C);        g = (5 * i + 1) & 15; }
        else if (i < 48) { F = B ^ C ^ D;                 g = (3 * i + 5) & 15; }
        else             { F = C ^ (B | ~D);              g = (7 * i) & 15; }
        F = (F + A + MD5_K[i] + M[g]) | 0;
        A = D; D = C; C = B;
        B = (B + rotl(F, MD5_S[i])) | 0;
      }
      a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
    }

    var out = "";
    [a0, b0, c0, d0].forEach(function (w) {
      for (var k = 0; k < 4; k++) {
        var byte = (w >>> (8 * k)) & 0xff;
        out += (byte < 16 ? "0" : "") + byte.toString(16);
      }
    });
    return out;
  }

  /* ---------- helpers ---------- */
  function hex(buffer) {
    var v = new Uint8Array(buffer), s = "";
    for (var i = 0; i < v.length; i++) s += (v[i] < 16 ? "0" : "") + v[i].toString(16);
    return s;
  }

  var ALGOS = [
    { id: "md5",     label: "MD5",     web: null },
    { id: "sha1",    label: "SHA-1",   web: "SHA-1" },
    { id: "sha256",  label: "SHA-256", web: "SHA-256" },
    { id: "sha384",  label: "SHA-384", web: "SHA-384" },
    { id: "sha512",  label: "SHA-512", web: "SHA-512" }
  ];

  var input = document.getElementById("input");
  var fileEl = document.getElementById("file");
  var fileName = document.getElementById("file-name");
  var digests = document.getElementById("digests");
  var upper = document.getElementById("uppercase");
  var problem = document.getElementById("problem");
  var problemText = document.getElementById("problem-text");
  var inCount = document.getElementById("in-count");
  var showStatus = T.statusFor(document.getElementById("status"));

  var subtle = (window.crypto && window.crypto.subtle) || null;
  var currentBytes = null;   // set when a file is loaded; null means use the textarea

  function selected() {
    return ALGOS.filter(function (a) { return document.getElementById("algo-" + a.id).checked; });
  }

  function render(rows) {
    digests.textContent = "";
    rows.forEach(function (r) {
      var wrap = document.createElement("dl");
      wrap.className = "digest";
      wrap.tabIndex = 0;
      wrap.setAttribute("role", "button");
      wrap.title = "Click to copy";
      var dt = document.createElement("dt");
      dt.textContent = r.label;
      var dd = document.createElement("dd");
      dd.textContent = r.value;
      wrap.appendChild(dt);
      wrap.appendChild(dd);
      function copy() {
        T.copy(r.value).then(
          function () { showStatus("Copied " + r.label); },
          function () { showStatus("Press ⌘/Ctrl+C to copy", true); }
        );
      }
      wrap.addEventListener("click", copy);
      wrap.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); copy(); }
      });
      digests.appendChild(wrap);
    });
  }

  function run() {
    problem.hidden = true;
    var algos = selected();
    if (!algos.length) {
      digests.textContent = "";
      problemText.textContent = "Select at least one algorithm.";
      problem.hidden = false;
      return;
    }

    var bytes = currentBytes || new TextEncoder().encode(input.value);
    if (!currentBytes) {
      inCount.textContent = input.value.length ? input.value.length.toLocaleString() + " chars" : "";
    }

    var needsWeb = algos.some(function (a) { return a.web; });
    if (needsWeb && !subtle) {
      problemText.textContent = "SHA hashes need the Web Crypto API, which browsers only expose over HTTPS. " +
        "Open this page on the live site rather than from a local file. MD5 still works here.";
      problem.hidden = false;
    }

    var jobs = algos.map(function (a) {
      if (!a.web) return Promise.resolve({ label: a.label, value: md5(bytes) });
      if (!subtle) return Promise.resolve(null);
      return subtle.digest(a.web, bytes).then(function (buf) {
        return { label: a.label, value: hex(buf) };
      });
    });

    Promise.all(jobs).then(function (rows) {
      rows = rows.filter(Boolean);
      if (upper.checked) rows.forEach(function (r) { r.value = r.value.toUpperCase(); });
      render(rows);
    });
  }

  var timer;
  function schedule() {
    currentBytes = null;
    fileEl.value = "";
    fileName.textContent = "";
    clearTimeout(timer);
    timer = setTimeout(run, 120);
  }

  form.addEventListener("submit", function (e) { e.preventDefault(); run(); });
  input.addEventListener("input", schedule);
  ALGOS.forEach(function (a) {
    document.getElementById("algo-" + a.id).addEventListener("change", run);
  });
  upper.addEventListener("change", run);

  fileEl.addEventListener("change", function () {
    var f = fileEl.files && fileEl.files[0];
    if (!f) return;
    fileName.textContent = f.name + " (" + Math.max(1, Math.round(f.size / 1024)).toLocaleString() + " KB)";
    inCount.textContent = "";
    var reader = new FileReader();
    reader.onload = function () {
      currentBytes = new Uint8Array(reader.result);
      run();
      showStatus("Hashed " + f.name);
    };
    reader.onerror = function () {
      problemText.textContent = "Could not read that file.";
      problem.hidden = false;
    };
    reader.readAsArrayBuffer(f);
  });

  document.getElementById("clear").addEventListener("click", function () {
    input.value = "";
    currentBytes = null;
    fileEl.value = "";
    fileName.textContent = "";
    inCount.textContent = "";
    digests.textContent = "";
    problem.hidden = true;
    input.focus();
  });

  run();
})();
