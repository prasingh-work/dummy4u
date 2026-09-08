/* Password generator. Requires assets/base.js (loaded first). */
(function () {
  "use strict";

  var form = document.getElementById("gen-form");
  if (!form) return;

  var MAX_COUNT = 500;
  var SETS = {
    lower: "abcdefghijklmnopqrstuvwxyz",
    upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    digit: "0123456789",
    // Deliberately excludes quotes, backslash, backtick, comma and space: they
    // break shell commands, CSV files and a depressing number of legacy forms.
    symbol: "!#$%&()*+-=?@[]^_{}~"
  };
  var LOOKALIKE = /[Il1|O0o]/;

  var lengthEl = document.getElementById("length");
  var countEl = document.getElementById("count");
  var singleEl = document.getElementById("single");
  var listEl = document.getElementById("list");
  var listTextEl = document.getElementById("list-text");
  var entropyEl = document.getElementById("entropy");
  var copyBtn = document.getElementById("copy");
  var showStatus = T.statusFor(document.getElementById("gen-status"));

  var current = [];

  function alphabet() {
    var chars = "";
    Object.keys(SETS).forEach(function (k) {
      if (document.getElementById("set-" + k).checked) chars += SETS[k];
    });
    if (document.getElementById("no-lookalike").checked) {
      chars = chars.split("").filter(function (c) { return !LOOKALIKE.test(c); }).join("");
    }
    return chars;
  }

  // Which selected sets survive the look-alike filter — a class whose every
  // member was filtered out cannot be required.
  function requiredSets() {
    var skip = document.getElementById("no-lookalike").checked;
    return Object.keys(SETS).filter(function (k) {
      if (!document.getElementById("set-" + k).checked) return false;
      return SETS[k].split("").some(function (c) { return !skip || !LOOKALIKE.test(c); });
    });
  }

  function memberOf(set, chars) {
    return chars.split("").filter(function (c) { return SETS[set].indexOf(c) !== -1; });
  }

  function makePassword(len, chars, required) {
    var out = new Array(len);
    for (var i = 0; i < len; i++) out[i] = chars.charAt(T.randomBelow(chars.length));

    // Guarantee one character from each selected class, so the result is not
    // rejected by sites that still enforce composition rules. Positions are
    // chosen without repeats; see the page text on the entropy cost.
    if (required.length && required.length <= len) {
      var used = {};
      required.forEach(function (set) {
        var pool = memberOf(set, chars);
        if (!pool.length) return;
        if (out.some(function (c) { return pool.indexOf(c) !== -1; })) return;
        var pos;
        do { pos = T.randomBelow(len); } while (used[pos]);
        used[pos] = 1;
        out[pos] = pool[T.randomBelow(pool.length)];
      });
    }
    return out.join("");
  }

  function render(list, chars, len) {
    current = list;

    if (list.length === 1) {
      singleEl.textContent = list[0];
      singleEl.hidden = false;
      listEl.hidden = true;
      listTextEl.textContent = "";
    } else {
      listTextEl.textContent = list.join("\n");
      listEl.scrollTop = 0;
      listEl.hidden = false;
      singleEl.hidden = true;
    }

    var bits = Math.floor(len * (Math.log(chars.length) / Math.LN2));
    entropyEl.textContent = bits + " bits of entropy — " + len +
      " characters drawn from an alphabet of " + chars.length + ".";
  }

  function copyCurrent() {
    if (!current.length) return;
    var noun = current.length === 1 ? "password" : current.length + " passwords";
    T.copy(current.join("\n")).then(
      function () { showStatus("Copied " + noun); },
      function () { showStatus("Press ⌘/Ctrl+C to copy", true); }
    );
  }

  function generate(announce) {
    var chars = alphabet();
    if (!chars.length) {
      showStatus("Select at least one character type", true);
      return;
    }
    var len = T.clampInput(lengthEl, 4, 128);
    var n = T.clampInput(countEl, 1, MAX_COUNT);
    var required = requiredSets();

    var list = new Array(n);
    for (var i = 0; i < n; i++) list[i] = makePassword(len, chars, required);
    render(list, chars, len);

    if (announce) {
      showStatus(n === 1 ? "Generated" : "Generated " + n + " passwords");
    }
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    generate(true);
  });

  copyBtn.addEventListener("click", copyCurrent);

  [singleEl, listEl].forEach(function (el) {
    el.addEventListener("click", copyCurrent);
    el.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        copyCurrent();
      }
    });
  });

  // Changing an option re-rolls immediately: the visible password should always
  // match the settings on screen.
  ["length", "count", "set-lower", "set-upper", "set-digit", "set-symbol", "no-lookalike"]
    .forEach(function (id) {
      document.getElementById(id).addEventListener("change", function () { generate(false); });
    });

  generate(false);
})();
