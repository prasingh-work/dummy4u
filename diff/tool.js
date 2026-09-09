/* Text comparison. Requires assets/base.js (loaded first).
   Line diff via Myers' O(ND) algorithm: cost scales with the size of the
   difference rather than the size of the files, so comparing two large but
   similar files stays fast. A naive LCS table would need N*M cells and fall
   over on anything real. */
(function () {
  "use strict";

  var form = document.getElementById("tool-form");
  if (!form) return;

  var MAX_LINES = 20000;

  /* ---------- diff core ---------- */
  function myers(a, b) {
    var N = a.length, M = b.length, MAX = N + M;
    if (MAX === 0) return [];
    var off = MAX;
    var V = new Int32Array(2 * MAX + 2);
    var trace = [];

    for (var d = 0; d <= MAX; d++) {
      trace.push(V.slice(0));
      for (var k = -d; k <= d; k += 2) {
        var x;
        if (k === -d || (k !== d && V[k - 1 + off] < V[k + 1 + off])) x = V[k + 1 + off];
        else x = V[k - 1 + off] + 1;
        var y = x - k;
        while (x < N && y < M && a[x] === b[y]) { x++; y++; }
        V[k + off] = x;
        if (x >= N && y >= M) return backtrack(trace, d, N, M, off);
      }
    }
    return [];
  }

  function backtrack(trace, D, N, M, off) {
    var ops = [], x = N, y = M;
    for (var d = D; d > 0; d--) {
      var V = trace[d];
      var k = x - y;
      var prevK = (k === -d || (k !== d && V[k - 1 + off] < V[k + 1 + off])) ? k + 1 : k - 1;
      var prevX = V[prevK + off], prevY = prevX - prevK;
      while (x > prevX && y > prevY) { ops.push({ op: " ", a: x - 1, b: y - 1 }); x--; y--; }
      if (x === prevX) { ops.push({ op: "+", b: y - 1 }); y--; }
      else { ops.push({ op: "-", a: x - 1 }); x--; }
    }
    while (x > 0 && y > 0) { ops.push({ op: " ", a: x - 1, b: y - 1 }); x--; y--; }
    return ops.reverse();
  }

  // Common head and tail are stripped before the expensive part runs.
  function diff(a, b, keyA, keyB) {
    var head = 0, n = Math.min(a.length, b.length);
    while (head < n && keyA[head] === keyB[head]) head++;
    var tail = 0;
    while (tail < n - head && keyA[a.length - 1 - tail] === keyB[b.length - 1 - tail]) tail++;

    var midOps = myers(
      keyA.slice(head, a.length - tail),
      keyB.slice(head, b.length - tail)
    );

    var ops = [];
    for (var i = 0; i < head; i++) ops.push({ op: " ", a: i, b: i });
    midOps.forEach(function (o) {
      ops.push({
        op: o.op,
        a: o.a === undefined ? undefined : o.a + head,
        b: o.b === undefined ? undefined : o.b + head
      });
    });
    for (var j = 0; j < tail; j++) {
      ops.push({ op: " ", a: a.length - tail + j, b: b.length - tail + j });
    }
    return ops;
  }

  /* ---------- wiring ---------- */
  var leftEl = document.getElementById("left");
  var rightEl = document.getElementById("right");
  var out = document.getElementById("diff-out");
  var summary = document.getElementById("summary");
  var problem = document.getElementById("problem");
  var problemText = document.getElementById("problem-text");
  var ignoreCase = document.getElementById("ignore-case");
  var ignoreWs = document.getElementById("ignore-ws");
  var ignoreBlank = document.getElementById("ignore-blank");
  var showStatus = T.statusFor(document.getElementById("status"));

  var lastText = "";

  function keyOf(line) {
    var k = line;
    if (ignoreWs.checked) k = k.replace(/\s+/g, " ").trim();
    if (ignoreCase.checked) k = k.toLowerCase();
    return k;
  }

  function split(text) {
    var lines = text.replace(/\r\n?/g, "\n").split("\n");
    // A trailing newline produces a final empty element; drop it so files that
    // differ only by that do not show a phantom change.
    if (lines.length && lines[lines.length - 1] === "") lines.pop();
    return lines;
  }

  function pad(v, w) {
    var s = v === undefined ? "" : String(v);
    while (s.length < w) s = " " + s;
    return s;
  }

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function run(announce) {
    problem.hidden = true;
    var a = split(leftEl.value), b = split(rightEl.value);

    if (ignoreBlank.checked) {
      a = a.filter(function (l) { return l.trim() !== ""; });
      b = b.filter(function (l) { return l.trim() !== ""; });
    }

    if (a.length > MAX_LINES || b.length > MAX_LINES) {
      problemText.textContent = "Each side is limited to " + MAX_LINES.toLocaleString() +
        " lines; you have " + Math.max(a.length, b.length).toLocaleString() + ".";
      problem.hidden = false;
      out.textContent = "";
      summary.textContent = "";
      return;
    }

    var t0 = performance.now();
    var ops = diff(a, b, a.map(keyOf), b.map(keyOf));
    var ms = performance.now() - t0;

    var added = 0, removed = 0, same = 0, html = [], plain = [];
    ops.forEach(function (o) {
      var text = o.op === "+" ? b[o.b] : a[o.a];
      if (o.op === "+") added++; else if (o.op === "-") removed++; else same++;
      var cls = o.op === "+" ? "d-add" : o.op === "-" ? "d-del" : "d-ctx";
      html.push('<span class="' + cls + '">' + pad(o.a === undefined ? "" : o.a + 1, 6) +
                pad(o.b === undefined ? "" : o.b + 1, 6) + "  " + o.op + " " + esc(text) + "</span>");
      plain.push(o.op + " " + text);
    });

    out.innerHTML = html.join("\n");
    lastText = plain.join("\n");

    if (!added && !removed) {
      summary.textContent = "Identical — " + same.toLocaleString() + " line" + (same === 1 ? "" : "s") + " match.";
      summary.className = "ok-line";
    } else {
      summary.textContent = added.toLocaleString() + " added, " + removed.toLocaleString() +
        " removed, " + same.toLocaleString() + " unchanged — compared in " +
        (ms < 1 ? "<1" : Math.round(ms)) + " ms.";
      summary.className = "meta-line";
    }
    summary.hidden = false;
    if (announce) showStatus(added || removed ? "Compared" : "No differences");
  }

  var timer;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(function () { run(false); }, 200);
  }

  form.addEventListener("submit", function (e) { e.preventDefault(); run(true); });
  [leftEl, rightEl].forEach(function (el) { el.addEventListener("input", schedule); });
  ["ignore-case", "ignore-ws", "ignore-blank"].forEach(function (id) {
    document.getElementById(id).addEventListener("change", function () { run(false); });
  });

  document.getElementById("swap").addEventListener("click", function () {
    var t = leftEl.value; leftEl.value = rightEl.value; rightEl.value = t;
    run(true);
  });

  document.getElementById("copy").addEventListener("click", function () {
    if (!lastText) return;
    T.copy(lastText).then(
      function () { showStatus("Copied the diff"); },
      function () { showStatus("Press ⌘/Ctrl+C to copy", true); }
    );
  });

  document.getElementById("clear").addEventListener("click", function () {
    leftEl.value = ""; rightEl.value = "";
    out.textContent = ""; summary.hidden = true; problem.hidden = true;
    leftEl.focus();
  });

  run(false);
})();
