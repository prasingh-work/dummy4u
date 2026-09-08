/* Test card number generator. Requires assets/base.js (loaded first).
   Produces Luhn-valid numbers with correct brand structure so that card-type
   detection and checksum validation behave as they would in production. The
   numbers are random: they are not issued, not linked to any account, and
   cannot be charged. No CVC or expiry is generated — see the page text. */
(function () {
  "use strict";

  var form = document.getElementById("gen-form");
  if (!form) return;

  var MAX = 5000;
  var PREVIEW = 300;

  // Issuer Identification Number ranges and total length, per brand.
  var BRANDS = {
    visa:     { name: "Visa",         len: 16, prefixes: ["4"] },
    mastercard: { name: "Mastercard", len: 16, prefixes: ["51","52","53","54","55"], ranges: [[2221, 2720, 4]] },
    amex:     { name: "American Express", len: 15, prefixes: ["34","37"] },
    discover: { name: "Discover",     len: 16, prefixes: ["6011","65"], ranges: [[644, 649, 3]] },
    jcb:      { name: "JCB",          len: 16, ranges: [[3528, 3589, 4]] },
    diners:   { name: "Diners Club",  len: 14, prefixes: ["36","38","39"], ranges: [[300, 305, 3]] }
  };
  var KEYS = Object.keys(BRANDS);

  function prefixFor(spec) {
    var fixed = spec.prefixes || [];
    var ranges = spec.ranges || [];
    var total = fixed.length + ranges.length;
    var pick = T.randomBelow(total);
    if (pick < fixed.length) return fixed[pick];
    var r = ranges[pick - fixed.length];
    var v = r[0] + T.randomBelow(r[1] - r[0] + 1);
    var s = String(v);
    while (s.length < r[2]) s = "0" + s;
    return s;
  }

  // Luhn check digit for a partial number: double every second digit counting
  // from the right of the body, subtract 9 above 9, pad the sum to a ten.
  function checkDigit(body) {
    var sum = 0;
    for (var i = 0; i < body.length; i++) {
      var d = body.charCodeAt(body.length - 1 - i) - 48;
      if (i % 2 === 0) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
    }
    return String((10 - (sum % 10)) % 10);
  }

  function makeCard(key) {
    var spec = BRANDS[key];
    var body = prefixFor(spec);
    while (body.length < spec.len - 1) body += T.randomBelow(10);
    return body + checkDigit(body);
  }

  function group(num) {
    if (num.length === 15) return num.slice(0,4) + " " + num.slice(4,10) + " " + num.slice(10);
    if (num.length === 14) return num.slice(0,4) + " " + num.slice(4,10) + " " + num.slice(10);
    return num.replace(/(.{4})(?=.)/g, "$1 ");
  }

  var brandEl = document.getElementById("brand");
  var countEl = document.getElementById("count");
  var spacedEl = document.getElementById("spaced");
  var singleEl = document.getElementById("single");
  var listEl = document.getElementById("list");
  var listTextEl = document.getElementById("list-text");
  var truncatedEl = document.getElementById("truncated");
  var copyBtn = document.getElementById("copy");
  var downloadBtn = document.getElementById("download");
  var showStatus = T.statusFor(document.getElementById("gen-status"));

  var current = [];

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
    var noun = current.length === 1 ? "number" : current.length.toLocaleString() + " numbers";
    T.copy(current.join("\n")).then(
      function () { showStatus("Copied " + noun); },
      function () { showStatus("Press ⌘/Ctrl+C to copy", true); }
    );
  }

  function generate(announce) {
    var n = T.clampInput(countEl, 1, MAX);
    var sel = brandEl.value;
    var list = new Array(n);
    for (var i = 0; i < n; i++) {
      var key = sel === "any" ? KEYS[T.randomBelow(KEYS.length)] : sel;
      var num = makeCard(key);
      list[i] = spacedEl.checked ? group(num) : num;
    }
    render(list);
    if (announce) showStatus(n === 1 ? "Generated" : "Generated " + n.toLocaleString() + " numbers");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    generate(true);
  });

  copyBtn.addEventListener("click", copyCurrent);
  downloadBtn.addEventListener("click", function () {
    if (current.length < 2) return;
    T.downloadText("test-cards-" + current.length + "-" + T.stamp() + ".csv",
                   T.toCsv("index,number", current), "text/csv;charset=utf-8");
    showStatus("Downloaded " + current.length.toLocaleString() + " rows");
  });

  ["brand", "count", "spaced"].forEach(function (id) {
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
