/* Base64 encoder and decoder. Requires assets/base.js (loaded first).
   btoa/atob only handle Latin-1, so text goes through TextEncoder first —
   otherwise anything non-ASCII throws or corrupts. */
(function () {
  "use strict";

  var form = document.getElementById("tool-form");
  if (!form) return;

  var input = document.getElementById("input");
  var output = document.getElementById("output");
  var problem = document.getElementById("problem");
  var problemText = document.getElementById("problem-text");
  var inCount = document.getElementById("in-count");
  var outCount = document.getElementById("out-count");
  var modeEncode = document.getElementById("mode-encode");
  var urlSafe = document.getElementById("url-safe");
  var showStatus = T.statusFor(document.getElementById("status"));

  var LIVE_LIMIT = 262144;   // above this, only run on submit

  function bytesToBase64(bytes) {
    // Chunked so a large input does not blow the argument limit of apply().
    var chunk = 0x8000, parts = [];
    for (var i = 0; i < bytes.length; i += chunk) {
      parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunk)));
    }
    return btoa(parts.join(""));
  }

  function base64ToBytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function encode(text) {
    var b64 = bytesToBase64(new TextEncoder().encode(text));
    if (urlSafe.checked) b64 = b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return b64;
  }

  function decode(text) {
    var s = text.replace(/\s+/g, "");
    if (!s) return "";
    // Accept both alphabets and restore padding, so a URL-safe or unpadded
    // string pasted from a JWT or a query parameter just works.
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) {
      var bad = s.match(/[^A-Za-z0-9+/=]/);
      throw new Error("Not valid Base64: unexpected character " + JSON.stringify(bad[0]) +
                      " at position " + s.indexOf(bad[0]) + ".");
    }
    var pad = s.length % 4;
    if (pad === 1) throw new Error("Not valid Base64: the length leaves a single trailing character, which cannot encode any byte.");
    if (pad) s += new Array(5 - pad).join("=");
    var bytes = base64ToBytes(s);
    // fatal:true so mojibake surfaces as an error instead of U+FFFD soup.
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }

  function fail(message) {
    problemText.textContent = message;
    problem.hidden = false;
    output.value = "";
    outCount.textContent = "";
  }

  function run(announce) {
    problem.hidden = true;
    var text = input.value;
    inCount.textContent = text.length ? text.length.toLocaleString() + " chars" : "";

    if (!text) {
      output.value = "";
      outCount.textContent = "";
      return;
    }
    try {
      var result = modeEncode.checked ? encode(text) : decode(text);
      output.value = result;
      outCount.textContent = result.length.toLocaleString() + " chars";
      if (announce) showStatus(modeEncode.checked ? "Encoded" : "Decoded");
    } catch (e) {
      fail(e && e.message ? e.message : "Could not process that input.");
    }
  }

  var timer;
  function schedule() {
    clearTimeout(timer);
    if (input.value.length > LIVE_LIMIT) {
      outCount.textContent = "press Convert";
      return;
    }
    timer = setTimeout(function () { run(false); }, 120);
  }

  form.addEventListener("submit", function (e) { e.preventDefault(); run(true); });
  input.addEventListener("input", schedule);
  ["mode-encode", "mode-decode", "url-safe"].forEach(function (id) {
    document.getElementById(id).addEventListener("change", function () { run(false); });
  });

  document.getElementById("copy").addEventListener("click", function () {
    if (!output.value) return;
    T.copy(output.value).then(
      function () { showStatus("Copied"); },
      function () { showStatus("Press ⌘/Ctrl+C to copy", true); }
    );
  });

  document.getElementById("swap").addEventListener("click", function () {
    if (!output.value) return;
    input.value = output.value;
    document.getElementById(modeEncode.checked ? "mode-decode" : "mode-encode").checked = true;
    run(true);
  });

  document.getElementById("clear").addEventListener("click", function () {
    input.value = "";
    output.value = "";
    inCount.textContent = "";
    outCount.textContent = "";
    problem.hidden = true;
    input.focus();
  });

  run(false);
})();
