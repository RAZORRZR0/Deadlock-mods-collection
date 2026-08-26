"use strict";

var commandHistory = [];
var historyIndex = -1;

function getRoot() {
  return $.GetContextPanel();
}

function getConsoleInput() {
  var root = getRoot();
  return root ? root.FindChildTraverse("DevConsoleInput") : null;
}

function DevConsoleSubmit() {
  var input = getConsoleInput();
  if (!input) return;

  var rawCmd = String(input.text || "").trim();
  if (!rawCmd) return;

  commandHistory.push(rawCmd);
  historyIndex = commandHistory.length;

  try {
    if (typeof CitadelConCommand === "function") {
      CitadelConCommand(rawCmd);
    } else {
      $.DispatchEvent("CitadelConCommand", rawCmd);
    }
  } catch (e) {
    try {
      $.DispatchEvent("CitadelConCommand", rawCmd);
    } catch (err) {
      $.Msg("[DevConsole] Error executing command: " + rawCmd, err);
    }
  }

  input.text = "";
}

// Global attachment for Panorama XML oninputsubmit handler
if (typeof globalThis !== "undefined") {
  globalThis.DevConsoleSubmit = DevConsoleSubmit;
}
$.DevConsoleSubmit = DevConsoleSubmit;

// Direct panel event binding
(function init() {
  var input = getConsoleInput();
  if (input) {
    input.SetPanelEvent("oninputsubmit", DevConsoleSubmit);
  }
})();
