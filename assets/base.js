/* dummy4u — shared helpers. Cached once for the whole site; tool logic never
   lives here, so a visitor never downloads code for a tool they did not open. */
var T = (function () {
  "use strict";

  var CHUNK = 65536;                 // crypto.getRandomValues caps at 64 KB
  var pool = new Uint8Array(CHUNK);
  var poolIdx = CHUNK;

  function nextByte() {
    if (poolIdx >= pool.length) {
      crypto.getRandomValues(pool);
      poolIdx = 0;
    }
    return pool[poolIdx++];
  }

  // Uniform integer in [0, n). Rejection sampling against the largest whole
  // multiple of `n` inside the sample space removes modulo bias. One byte is
  // enough up to 256; beyond that draw four, or the single-byte limit
  // collapses to zero and the loop never terminates.
  function randomBelow(n) {
    if (n <= 1) return 0;
    if (n <= 256) {
      var limit = 256 - (256 % n);
      var b;
      do { b = nextByte(); } while (b >= limit);
      return b % n;
    }
    var wide = 4294967296 - (4294967296 % n);
    var v;
    do {
      v = ((nextByte() << 24) | (nextByte() << 16) | (nextByte() << 8) | nextByte()) >>> 0;
    } while (v >= wide);
    return v % n;
  }

  function randomBytes(out) {
    for (var i = 0; i < out.length; i++) out[i] = nextByte();
    return out;
  }

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    // Fallback for file:// and plain-http origins, where the async API is blocked.
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error("copy failed"));
    });
  }

  function statusFor(el) {
    var timer;
    return function (message, warn) {
      el.textContent = message;
      el.classList.toggle("is-warn", !!warn);
      el.classList.add("show");
      clearTimeout(timer);
      timer = setTimeout(function () { el.classList.remove("show"); }, 2400);
    };
  }

  function downloadText(filename, text, mime) {
    var blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // Header row and CRLF endings so Excel and Sheets open it cleanly.
  function toCsv(header, rows) {
    var parts = new Array(rows.length + 1);
    parts[0] = header;
    for (var i = 0; i < rows.length; i++) parts[i + 1] = (i + 1) + "," + rows[i];
    return parts.join("\r\n") + "\r\n";
  }

  function stamp() {
    return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  }

  function clampInput(el, min, max) {
    var n = Math.floor(Number(el.value));
    if (!isFinite(n) || n < min) n = min;
    if (n > max) n = max;
    el.value = String(n);
    return n;
  }

  return {
    nextByte: nextByte,
    randomBelow: randomBelow,
    randomBytes: randomBytes,
    copy: copy,
    statusFor: statusFor,
    downloadText: downloadText,
    toCsv: toCsv,
    stamp: stamp,
    clampInput: clampInput
  };
})();
