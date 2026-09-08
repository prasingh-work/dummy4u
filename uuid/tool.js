/* UUID generator — v4 (random) and v7 (time-ordered), per RFC 9562.
   Requires assets/base.js (loaded first). */
(function () {
  "use strict";

  var form = document.getElementById("gen-form");
  if (!form) return;

  var MAX = 10000;
  var PREVIEW = 300;

  var HEX = "0123456789abcdef";
  var lastMs = 0;
  var seq = 0;

  function toUuid(b) {
    var s = "";
    for (var i = 0; i < 16; i++) {
      s += HEX.charAt(b[i] >> 4) + HEX.charAt(b[i] & 15);
      if (i === 3 || i === 5 || i === 7 || i === 9) s += "-";
    }
    return s;
  }

  // 122 random bits; version nibble 0100, variant bits 10.
  function v4() {
    var b = T.randomBytes(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    return toUuid(b);
  }

  // 48-bit big-endian Unix time in ms, version nibble 0111, 12-bit rand_a,
  // variant bits 10, then 62 bits of rand_b. Within a single millisecond
  // rand_a is used as a counter so a batch stays strictly ordered; if the
  // counter saturates, the timestamp borrows the next millisecond.
  function v7() {
    var ms = Date.now();
    if (ms === lastMs) {
      seq++;
      if (seq > 0xfff) { lastMs++; ms = lastMs; seq = 0; }
    } else if (ms > lastMs) {
      lastMs = ms;
      seq = T.randomBelow(0x400);   // start low, leaving counter headroom
    } else {
      ms = lastMs;                  // clock went backwards; hold the line
      seq++;
      if (seq > 0xfff) { lastMs++; ms = lastMs; seq = 0; }
    }

    var b = T.randomBytes(new Uint8Array(16));
    b[0] = Math.floor(ms / 1099511627776) & 0xff;   // ms >> 40
    b[1] = Math.floor(ms / 4294967296) & 0xff;      // ms >> 32
    b[2] = (ms >>> 24) & 0xff;
    b[3] = (ms >>> 16) & 0xff;
    b[4] = (ms >>> 8) & 0xff;
    b[5] = ms & 0xff;
    b[6] = 0x70 | ((seq >> 8) & 0x0f);
    b[7] = seq & 0xff;
    b[8] = (b[8] & 0x3f) | 0x80;
    return toUuid(b);
  }

  var versionEl = document.getElementById("version");
  var countEl = document.getElementById("count");
  var upperEl = document.getElementById("uppercase");
  var plainEl = document.getElementById("no-hyphens");
  var singleEl = document.getElementById("single");
  var listEl = document.getElementById("list");
  var listTextEl = document.getElementById("list-text");
  var truncatedEl = document.getElementById("truncated");
  var copyBtn = document.getElementById("copy");
  var downloadBtn = document.getElementById("download");
  var showStatus = T.statusFor(document.getElementById("gen-status"));

  var current = [];

  function style(u) {
    if (plainEl.checked) u = u.replace(/-/g, "");
    return upperEl.checked ? u.toUpperCase() : u;
  }

  function render(list) {
    current = list;

    if (list.length === 1) {
      singleEl.textContent = list[0];
      singleEl.hidden = false;
      listEl.hidden = true;
      listTextEl.textContent = "";
      truncatedEl.hidden = true;
      downloadBtn.hidden = true;
      return;
    }

    listTextEl.textContent = (list.length > PREVIEW ? list.slice(0, PREVIEW) : list).join("\n");
    listEl.scrollTop = 0;
    listEl.hidden = false;
    singleEl.hidden = true;
    downloadBtn.hidden = false;

    if (list.length > PREVIEW) {
      truncatedEl.textContent = "Showing the first " + PREVIEW.toLocaleString() +
        " of " + list.length.toLocaleString() + ". Download the CSV for all of them.";
      truncatedEl.hidden = false;
    } else {
      truncatedEl.hidden = true;
    }
  }

  function copyCurrent() {
    if (!current.length) return;
    var noun = current.length === 1 ? "UUID" : current.length.toLocaleString() + " UUIDs";
    T.copy(current.join("\n")).then(
      function () { showStatus("Copied " + noun); },
      function () { showStatus("Press ⌘/Ctrl+C to copy", true); }
    );
  }

  function generate(announce) {
    var n = T.clampInput(countEl, 1, MAX);
    var make = versionEl.value === "7" ? v7 : v4;
    var t0 = performance.now();
    var list = new Array(n);
    for (var i = 0; i < n; i++) list[i] = style(make());
    var ms = performance.now() - t0;
    render(list);

    if (announce) {
      showStatus(n === 1
        ? "Generated"
        : "Generated " + n.toLocaleString() + " in " + (ms < 1 ? "<1" : Math.round(ms)) + " ms");
    }
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    generate(true);
  });

  copyBtn.addEventListener("click", copyCurrent);
  downloadBtn.addEventListener("click", function () {
    if (current.length < 2) return;
    T.downloadText("uuid-v" + versionEl.value + "-" + current.length + "-" + T.stamp() + ".csv",
                   T.toCsv("index,uuid", current), "text/csv;charset=utf-8");
    showStatus("Downloaded " + current.length.toLocaleString() + " rows");
  });

  ["version", "count", "uppercase", "no-hyphens"].forEach(function (id) {
    document.getElementById(id).addEventListener("change", function () { generate(false); });
  });

  [singleEl, listEl].forEach(function (el) {
    el.addEventListener("click", copyCurrent);
    el.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        copyCurrent();
      }
    });
  });

  generate(false);
})();
