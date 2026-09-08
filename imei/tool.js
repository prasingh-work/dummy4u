/* IMEI generator + validator. Requires assets/base.js (loaded first). */
(function () {
  "use strict";

  var MAX = 100000;   // largest batch per click
  var PREVIEW = 300;  // rows rendered on screen; the rest go to the CSV

  // Reporting Body Identifiers: the first two digits of a real TAC, each
  // assigned by the Global Decimal Administrator to a GSMA-approved body.
  var RBI = ["01", "35", "86", "99", "10", "30", "33", "44", "45", "49", "50", "51", "52", "53", "54"];

  // Luhn check digit for a 14-digit body: double every second digit counting
  // from the right, subtract 9 from anything over 9, then pad the sum to a
  // multiple of ten.
  function luhnCheckDigit(digits) {
    var sum = 0;
    for (var i = 0; i < digits.length; i++) {
      var d = digits[digits.length - 1 - i];
      if (i % 2 === 0) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
    }
    return (10 - (sum % 10)) % 10;
  }

  function makeImei() {
    var rbi = RBI[T.randomBelow(RBI.length)];
    var digits = new Array(14);
    digits[0] = rbi.charCodeAt(0) - 48;
    digits[1] = rbi.charCodeAt(1) - 48;
    for (var i = 2; i < 14; i++) digits[i] = T.randomBelow(10);

    var body = "";
    for (var k = 0; k < 14; k++) body += digits[k];
    return body + luhnCheckDigit(digits);
  }

  function makeBatch(n) {
    var list = new Array(n);
    for (var i = 0; i < n; i++) list[i] = makeImei();
    return list;
  }

  function format(imei) {
    return imei.slice(0, 2) + "-" + imei.slice(2, 8) + "-" + imei.slice(8, 14) + "-" + imei.slice(14);
  }

  /* ---------- generator page -------------------------------------------- */
  function initGenerator() {
    var form = document.getElementById("gen-form");
    if (!form) return;

    var countEl = document.getElementById("count");
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

      // Exactly one of the two views is ever visible, chosen by the batch size.
      if (list.length === 1) {
        singleEl.textContent = format(list[0]);
        singleEl.hidden = false;
        listEl.hidden = true;
        listTextEl.textContent = "";   // drop the previous batch's text node
        truncatedEl.hidden = true;
        downloadBtn.hidden = true;
        return;
      }

      // One text node for the whole preview — far cheaper than an element per row.
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
      var noun = current.length === 1 ? "IMEI" : current.length.toLocaleString() + " IMEIs";
      T.copy(current.join("\n")).then(
        function () { showStatus("Copied " + noun); },
        function () { showStatus("Press ⌘/Ctrl+C to copy", true); }
      );
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var n = T.clampInput(countEl, 1, MAX);
      var t0 = performance.now();
      var list = makeBatch(n);
      var ms = performance.now() - t0;
      render(list);

      if (n === 1) {
        T.copy(list[0]).then(
          function () { showStatus("Generated and copied"); },
          function () { showStatus("Generated"); }
        );
      } else {
        showStatus("Generated " + n.toLocaleString() + " in " + (ms < 1 ? "<1" : Math.round(ms)) + " ms");
      }
    });

    copyBtn.addEventListener("click", copyCurrent);
    downloadBtn.addEventListener("click", function () {
      if (current.length < 2) return;
      T.downloadText("imei-" + current.length + "-" + T.stamp() + ".csv",
                     T.toCsv("index,imei", current), "text/csv;charset=utf-8");
      showStatus("Downloaded " + current.length.toLocaleString() + " rows");
    });
    countEl.addEventListener("blur", function () { T.clampInput(countEl, 1, MAX); });

    [singleEl, listEl].forEach(function (el) {
      el.addEventListener("click", copyCurrent);
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          copyCurrent();
        }
      });
    });

    // First value on load. Not pushed to the clipboard: nothing should take
    // the clipboard before the visitor has interacted with the page.
    render(makeBatch(1));
  }

  /* ---------- validator page --------------------------------------------- */
  function initValidator() {
    var form = document.getElementById("check-form");
    if (!form) return;

    var input = document.getElementById("imei-input");
    var verdict = document.getElementById("verdict");
    var headline = document.getElementById("verdict-headline");
    var detail = document.getElementById("verdict-detail");
    var parts = document.getElementById("parts");
    var showStatus = T.statusFor(document.getElementById("check-status"));

    function setRow(id, value) { document.getElementById(id).textContent = value; }

    function check(raw) {
      var digits = raw.replace(/[^0-9]/g, "");

      if (!digits) {
        return { ok: false, head: "Nothing to check", detail: "Paste an IMEI above." };
      }
      if (digits.length === 16) {
        return {
          ok: false,
          head: "That looks like an IMEISV",
          detail: "16 digits means the last two are a software version number, which replaces the check digit. There is no checksum to verify."
        };
      }
      if (digits.length !== 15) {
        return {
          ok: false,
          head: "Wrong length",
          detail: "An IMEI is exactly 15 digits. You entered " + digits.length + ". Separators, spaces and dashes are ignored."
        };
      }

      var body = new Array(14);
      for (var i = 0; i < 14; i++) body[i] = digits.charCodeAt(i) - 48;
      var expected = luhnCheckDigit(body);
      var given = digits.charCodeAt(14) - 48;

      return {
        ok: expected === given,
        digits: digits,
        expected: expected,
        head: expected === given ? "Checksum valid" : "Checksum invalid",
        detail: expected === given
          ? "The check digit matches the Luhn total for the first 14 digits. This confirms the number is well formed — it does not mean a device with this IMEI exists."
          : "The check digit is " + given + ", but the first 14 digits give " + expected + ". A single mistyped digit or two swapped digits is the usual cause."
      };
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var r = check(input.value);

      headline.textContent = r.head;
      detail.textContent = r.detail;
      verdict.classList.toggle("is-ok", !!r.ok);
      verdict.classList.toggle("is-bad", !r.ok);
      verdict.hidden = false;

      if (r.digits) {
        setRow("part-rbi", r.digits.slice(0, 2));
        setRow("part-tac", r.digits.slice(0, 8));
        setRow("part-serial", r.digits.slice(8, 14));
        setRow("part-check", r.digits.slice(14) + (r.ok ? "" : "  (expected " + r.expected + ")"));
        parts.hidden = false;
      } else {
        parts.hidden = true;
      }
    });

    document.getElementById("paste").addEventListener("click", function () {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        input.focus();
        showStatus("Paste with ⌘/Ctrl+V", true);
        return;
      }
      navigator.clipboard.readText().then(
        function (text) {
          input.value = text.trim();
          form.dispatchEvent(new Event("submit", { cancelable: true }));
        },
        function () {
          input.focus();
          showStatus("Paste with ⌘/Ctrl+V", true);
        }
      );
    });
  }

  initGenerator();
  initValidator();
})();
