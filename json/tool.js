/* JSON formatter and validator. Requires assets/base.js (loaded first).
   Uses the native parser, so what validates here is exactly what your
   runtime will accept — no reimplemented grammar to disagree with it. */
(function () {
  "use strict";

  var form = document.getElementById("tool-form");
  if (!form) return;

  var input = document.getElementById("input");
  var output = document.getElementById("output");
  var problem = document.getElementById("problem");
  var problemText = document.getElementById("problem-text");
  var excerpt = document.getElementById("excerpt");
  var okLine = document.getElementById("ok-line");
  var inCount = document.getElementById("in-count");
  var outCount = document.getElementById("out-count");
  var indentEl = document.getElementById("indent");
  var sortEl = document.getElementById("sort-keys");
  var showStatus = T.statusFor(document.getElementById("status"));

  var LIVE_LIMIT = 262144;

  // Engines disagree wildly about error text: V8 says "at position 42",
  // Firefox says "line 3 column 8", and JavaScriptCore gives no position at
  // all. Rather than parse three formats and still fail on Safari, locate the
  // fault ourselves. JSON.parse remains the authority on *whether* the input
  // is valid; this only works out *where* it broke, and returns null if it
  // cannot, in which case the engine's own message is shown unchanged.
  function locate(text) {
    var i = 0, n = text.length;

    function ws() {
      while (i < n) {
        var c = text.charCodeAt(i);
        if (c === 32 || c === 9 || c === 10 || c === 13) i++; else break;
      }
    }
    function fail(msg) { return { at: i, msg: msg }; }

    function string() {
      i++;                                   // opening quote
      while (i < n) {
        var ch = text[i];
        if (ch === '"') { i++; return null; }
        if (ch === "\\") {
          i++;
          if (i >= n) return fail("The string is not closed before the end of the input.");
          if ("\"\\/bfnrt".indexOf(text[i]) >= 0) { i++; continue; }
          if (text[i] === "u") {
            if (!/^[0-9a-fA-F]{4}/.test(text.slice(i + 1, i + 5))) {
              i++;
              return fail("A \\u escape needs exactly four hex digits.");
            }
            i += 5; continue;
          }
          return fail("Invalid escape sequence \\" + text[i] + " in a string.");
        }
        var code = text.charCodeAt(i);
        if (code < 0x20) return fail("A raw control character is not allowed inside a string; escape it instead.");
        i++;
      }
      return fail("The string is not closed before the end of the input.");
    }

    function value(depth) {
      if (depth > 512) return fail("Nesting is too deep to check.");
      ws();
      if (i >= n) return fail("The input ends where a value was expected.");
      var ch = text[i];

      if (ch === '"') return string();

      if (ch === "{") {
        i++; ws();
        if (text[i] === "}") { i++; return null; }
        for (;;) {
          ws();
          if (text[i] !== '"') return fail("Expected a quoted property name.");
          var e = string(); if (e) return e;
          ws();
          if (text[i] !== ":") return fail("Expected ':' after the property name.");
          i++;
          e = value(depth + 1); if (e) return e;
          ws();
          if (text[i] === ",") { i++; ws();
            if (text[i] === "}") return fail("Trailing comma — JSON does not allow one before '}'.");
            continue; }
          if (text[i] === "}") { i++; return null; }
          return fail("Expected ',' or '}' in the object.");
        }
      }

      if (ch === "[") {
        i++; ws();
        if (text[i] === "]") { i++; return null; }
        for (;;) {
          var e2 = value(depth + 1); if (e2) return e2;
          ws();
          if (text[i] === ",") { i++; ws();
            if (text[i] === "]") return fail("Trailing comma — JSON does not allow one before ']'.");
            continue; }
          if (text[i] === "]") { i++; return null; }
          return fail("Expected ',' or ']' in the array.");
        }
      }

      var lit = /^(true|false|null)/.exec(text.slice(i));
      if (lit) { i += lit[0].length; return null; }

      var num = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][-+]?[0-9]+)?/.exec(text.slice(i));
      if (num && num[0].length) {
        // Reject the near-misses JSON forbids but people write anyway.
        var after = text.slice(i + num[0].length);
        if (/^[0-9a-zA-Z.]/.test(after)) {
          i += num[0].length;
          return fail("Malformed number. JSON allows no leading zeros, no leading '+', no '.5' and no hex.");
        }
        i += num[0].length; return null;
      }

      if (ch === "'") return fail("Single quotes are not valid in JSON — use double quotes.");
      if (/^[A-Za-z_$]/.test(ch)) return fail("Unquoted name or unknown keyword. JSON needs strings in double quotes.");
      return fail("Unexpected character " + JSON.stringify(ch) + " where a value was expected.");
    }

    var err = value(0);
    if (err) return err;
    ws();
    if (i < n) return { at: i, msg: "Unexpected trailing content after the end of the value." };
    return null;
  }

  function lineCol(text, offset) {
    var line = 1, col = 1;
    for (var i = 0; i < offset && i < text.length; i++) {
      if (text.charCodeAt(i) === 10) { line++; col = 1; } else { col++; }
    }
    return { line: line, col: col };
  }

  function contextAround(text, offset) {
    var start = text.lastIndexOf("\n", offset - 1) + 1;
    var end = text.indexOf("\n", offset);
    if (end === -1) end = text.length;
    var line = text.slice(start, end);
    var caret = offset - start;
    // Keep the excerpt readable on a phone.
    if (line.length > 78) {
      var from = Math.max(0, caret - 38);
      line = (from ? "…" : "") + line.slice(from, from + 76) + (from + 76 < end - start ? "…" : "");
      caret = caret - from + (from ? 1 : 0);
    }
    return line + "\n" + new Array(Math.max(0, caret) + 1).join(" ") + "^";
  }

  function sortDeep(value) {
    if (Array.isArray(value)) return value.map(sortDeep);
    if (value && typeof value === "object") {
      var out = {};
      Object.keys(value).sort().forEach(function (k) { out[k] = sortDeep(value[k]); });
      return out;
    }
    return value;
  }

  function indentOf() {
    var v = indentEl.value;
    if (v === "tab") return "\t";
    if (v === "0") return "";
    return Number(v);
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

    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      var loc = locate(text);
      if (loc) {
        var lc = lineCol(text, loc.at);
        problemText.textContent = "Invalid JSON at line " + lc.line + ", column " + lc.col + ". " + loc.msg;
        excerpt.textContent = contextAround(text, loc.at);
        excerpt.hidden = false;
      } else {
        // The locator found nothing but the parser still refused it; show the
        // engine's own words rather than inventing a position.
        problemText.textContent = (e && e.message) ? e.message : "Invalid JSON.";
        excerpt.hidden = true;
      }
      problem.hidden = false;
      output.value = "";
      outCount.textContent = "";
      return;
    }

    if (sortEl.checked) parsed = sortDeep(parsed);
    var result = JSON.stringify(parsed, null, indentOf());
    output.value = result;
    outCount.textContent = result.length.toLocaleString() + " chars";

    var kind = Array.isArray(parsed) ? "array of " + parsed.length + " item" + (parsed.length === 1 ? "" : "s")
      : parsed === null ? "null"
      : typeof parsed === "object" ? "object with " + Object.keys(parsed).length + " key" + (Object.keys(parsed).length === 1 ? "" : "s")
      : typeof parsed;
    okLine.textContent = "Valid JSON — " + kind + ".";
    okLine.hidden = false;
    if (announce) showStatus(indentOf() === "" ? "Minified" : "Formatted");
  }

  var timer;
  function schedule() {
    clearTimeout(timer);
    if (input.value.length > LIVE_LIMIT) {
      outCount.textContent = "press Format";
      return;
    }
    timer = setTimeout(function () { run(false); }, 140);
  }

  form.addEventListener("submit", function (e) { e.preventDefault(); run(true); });
  input.addEventListener("input", schedule);
  ["indent", "sort-keys"].forEach(function (id) {
    document.getElementById(id).addEventListener("change", function () { run(false); });
  });

  document.getElementById("copy").addEventListener("click", function () {
    if (!output.value) return;
    T.copy(output.value).then(
      function () { showStatus("Copied"); },
      function () { showStatus("Press ⌘/Ctrl+C to copy", true); }
    );
  });

  document.getElementById("download").addEventListener("click", function () {
    if (!output.value) return;
    T.downloadText("formatted-" + T.stamp() + ".json", output.value, "application/json;charset=utf-8");
    showStatus("Downloaded");
  });

  document.getElementById("clear").addEventListener("click", function () {
    input.value = "";
    output.value = "";
    inCount.textContent = "";
    outCount.textContent = "";
    problem.hidden = true;
    okLine.hidden = true;
    input.focus();
  });

  run(false);
})();
