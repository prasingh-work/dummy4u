/* XML formatter and validator. Requires assets/base.js (loaded first).
   DOMParser is the authority on well-formedness — it is the same parser your
   browser uses. Formatting works from a token scan of the original text
   rather than from the parsed DOM, because serialising a DOM silently drops
   the XML declaration, the doctype and entity references. */
(function () {
  "use strict";

  var form = document.getElementById("tool-form");
  if (!form) return;

  /* ---------- token scan ---------- */
  // Only ever runs on text DOMParser has already accepted, so it can assume
  // well-formed input and stay small.
  function tokenize(text) {
    var toks = [], i = 0, n = text.length;
    while (i < n) {
      if (text[i] === "<") {
        var kind, end;
        if (text.substr(i, 4) === "<!--")      { kind = "comment"; end = text.indexOf("-->", i); end = end < 0 ? n : end + 3; }
        else if (text.substr(i, 9) === "<![CDATA[") { kind = "cdata"; end = text.indexOf("]]>", i); end = end < 0 ? n : end + 3; }
        else if (text.substr(i, 9).toUpperCase() === "<!DOCTYPE") {
          kind = "doctype";
          // A doctype may carry an internal subset in square brackets.
          var br = text.indexOf("[", i), gt = text.indexOf(">", i);
          if (br !== -1 && br < gt) { var close = text.indexOf("]", br); end = text.indexOf(">", close < 0 ? br : close) + 1; }
          else end = gt + 1;
          if (end <= 0) end = n;
        }
        else if (text.substr(i, 2) === "<?") { kind = "pi"; end = text.indexOf("?>", i); end = end < 0 ? n : end + 2; }
        else if (text.substr(i, 2) === "</") { kind = "close"; end = text.indexOf(">", i) + 1; }
        else {
          end = i + 1;
          // Skip over quoted attribute values so a '>' inside one is ignored.
          var q = null;
          while (end < n) {
            var ch = text[end];
            if (q) { if (ch === q) q = null; }
            else if (ch === '"' || ch === "'") q = ch;
            else if (ch === ">") { end++; break; }
            end++;
          }
          kind = text[end - 2] === "/" ? "selfclose" : "open";
        }
        toks.push({ kind: kind, raw: text.slice(i, end) });
        i = end;
      } else {
        var lt = text.indexOf("<", i);
        if (lt === -1) lt = n;
        toks.push({ kind: "text", raw: text.slice(i, lt) });
        i = lt;
      }
    }
    return toks;
  }

  function pretty(text, unit, minify) {
    var toks = tokenize(text);
    var out = [], level = 0;

    // An element whose entire content is one text node stays on a single line.
    function inlineAt(k) {
      return toks[k] && toks[k].kind === "text" && toks[k].raw.trim() !== "" &&
             toks[k + 1] && toks[k + 1].kind === "close";
    }

    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t.kind === "text") {
        if (t.raw.trim() === "") continue;          // formatting whitespace
        out.push({ level: level, text: t.raw.trim() });
        continue;
      }
      if (t.kind === "close") {
        level = Math.max(0, level - 1);
        out.push({ level: level, text: t.raw.trim() });
        continue;
      }
      if (t.kind === "open") {
        if (inlineAt(i + 1)) {
          out.push({ level: level, text: t.raw.trim() + toks[i + 1].raw.trim() + toks[i + 2].raw.trim() });
          i += 2;
          continue;
        }
        out.push({ level: level, text: t.raw.trim() });
        level++;
        continue;
      }
      out.push({ level: level, text: t.raw.trim() });   // pi, doctype, comment, cdata, selfclose
    }

    if (minify) return out.map(function (l) { return l.text; }).join("");
    return out.map(function (l) {
      var pad = "";
      for (var k = 0; k < l.level; k++) pad += unit;
      return pad + l.text;
    }).join("\n");
  }

  /* ---------- error location ---------- */
  // Browsers word parsererror differently; pull a line and column out of any
  // of the shapes they use, and fall back to their own text if none matches.
  function locateFrom(message) {
    var m = /line\s*:?\s*(\d+)[^0-9]{0,20}(?:column|col)\s*:?\s*(\d+)/i.exec(message);
    if (m) return { line: Number(m[1]), col: Number(m[2]) };
    m = /line\s*:?\s*(\d+)/i.exec(message);
    if (m) return { line: Number(m[1]), col: 1 };
    return null;
  }

  function offsetOf(text, line, col) {
    var at = 0;
    for (var l = 1; l < line; l++) {
      var nl = text.indexOf("\n", at);
      if (nl === -1) return at;
      at = nl + 1;
    }
    return at + Math.max(0, col - 1);
  }

  function contextAround(text, offset) {
    var start = text.lastIndexOf("\n", offset - 1) + 1;
    var end = text.indexOf("\n", offset);
    if (end === -1) end = text.length;
    var line = text.slice(start, end), caret = offset - start;
    if (line.length > 78) {
      var from = Math.max(0, caret - 38);
      line = (from ? "…" : "") + line.slice(from, from + 76);
      caret = caret - from + (from ? 1 : 0);
    }
    return line + "\n" + new Array(Math.max(0, caret) + 1).join(" ") + "^";
  }

  /* ---------- wiring ---------- */
  var input = document.getElementById("input");
  var output = document.getElementById("output");
  var problem = document.getElementById("problem");
  var problemText = document.getElementById("problem-text");
  var excerpt = document.getElementById("excerpt");
  var okLine = document.getElementById("ok-line");
  var inCount = document.getElementById("in-count");
  var outCount = document.getElementById("out-count");
  var indentEl = document.getElementById("indent");
  var showStatus = T.statusFor(document.getElementById("status"));

  var LIVE_LIMIT = 262144;

  function unitOf() {
    var v = indentEl.value;
    if (v === "tab") return "\t";
    return new Array(Number(v) + 1).join(" ");
  }

  function run(announce) {
    problem.hidden = true;
    okLine.hidden = true;
    var text = input.value;
    inCount.textContent = text.length ? text.length.toLocaleString() + " chars" : "";

    if (!text.trim()) {
      output.value = "";
      outCount.textContent = "";
      return;
    }

    var doc = new DOMParser().parseFromString(text, "application/xml");
    var err = doc.getElementsByTagName("parsererror")[0];
    if (err) {
      var msg = (err.textContent || "XML is not well formed.").replace(/\s+/g, " ").trim();
      var loc = locateFrom(msg);
      if (loc) {
        problemText.textContent = "Not well formed at line " + loc.line + ", column " + loc.col + ". " +
          msg.replace(/^.*?(?:line\s*:?\s*\d+[^:]*:\s*)/i, "");
        excerpt.textContent = contextAround(text, offsetOf(text, loc.line, loc.col));
        excerpt.hidden = false;
      } else {
        problemText.textContent = msg;
        excerpt.hidden = true;
      }
      problem.hidden = false;
      output.value = "";
      outCount.textContent = "";
      return;
    }

    var minify = indentEl.value === "0";
    var result = pretty(text, minify ? "" : unitOf(), minify);
    output.value = result;
    outCount.textContent = result.length.toLocaleString() + " chars";

    var root = doc.documentElement;
    var count = doc.getElementsByTagName("*").length;
    okLine.textContent = "Well-formed XML — root element <" + root.nodeName + ">, " +
      count + " element" + (count === 1 ? "" : "s") + ".";
    okLine.hidden = false;
    if (announce) showStatus(minify ? "Minified" : "Formatted");
  }

  var timer;
  function schedule() {
    clearTimeout(timer);
    if (input.value.length > LIVE_LIMIT) { outCount.textContent = "press Format"; return; }
    timer = setTimeout(function () { run(false); }, 140);
  }

  form.addEventListener("submit", function (e) { e.preventDefault(); run(true); });
  input.addEventListener("input", schedule);
  indentEl.addEventListener("change", function () { run(false); });

  document.getElementById("copy").addEventListener("click", function () {
    if (!output.value) return;
    T.copy(output.value).then(
      function () { showStatus("Copied"); },
      function () { showStatus("Press ⌘/Ctrl+C to copy", true); }
    );
  });

  document.getElementById("download").addEventListener("click", function () {
    if (!output.value) return;
    T.downloadText("formatted-" + T.stamp() + ".xml", output.value, "application/xml;charset=utf-8");
    showStatus("Downloaded");
  });

  document.getElementById("clear").addEventListener("click", function () {
    input.value = ""; output.value = "";
    inCount.textContent = ""; outCount.textContent = "";
    problem.hidden = true; okLine.hidden = true;
    input.focus();
  });

  run(false);
})();
