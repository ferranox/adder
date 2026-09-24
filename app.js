const editor = document.getElementById("editor");
const output = document.getElementById("output");
const statusLine = document.getElementById("status");
const runButton = document.getElementById("runButton");
const viewAdderButton = document.getElementById("viewAdderButton");
const viewPythonButton = document.getElementById("viewPythonButton");
const downloadButton = document.getElementById("downloadButton");
const uploadInput = document.getElementById("uploadInput");

const state = {
  view: "adder",
  adderCode: ""
};

function setStatus(message, isError) {
  statusLine.textContent = message;
  if (isError) {
    statusLine.classList.add("error");
  } else {
    statusLine.classList.remove("error");
  }
}

function setOutput(text) {
  output.textContent = text;
}

function currentAdderSource() {
  if (state.view === "adder") {
    return editor.value;
  }
  return state.adderCode;
}

function syncAdderCode() {
  if (state.view === "adder") {
    state.adderCode = editor.value;
  }
}

function markActiveView() {
  if (state.view === "adder") {
    viewAdderButton.classList.add("active");
    viewPythonButton.classList.remove("active");
  } else {
    viewPythonButton.classList.add("active");
    viewAdderButton.classList.remove("active");
  }
}

function showAdder() {
  syncAdderCodeSafe();
  state.view = "adder";
  editor.value = state.adderCode;
  editor.readOnly = false;
  markActiveView();
  setStatus("Showing Adder source.");
}

function syncAdderCodeSafe() {
  if (state.view === "adder") {
    state.adderCode = editor.value;
  }
}

function showPython() {
  syncAdderCodeSafe();
  let pythonText;
  try {
    pythonText = Adder.toPython(state.adderCode);
  } catch (error) {
    setStatus(String(error.message), true);
    return;
  }
  state.view = "python";
  editor.value = pythonText;
  editor.readOnly = true;
  markActiveView();
  setStatus("Showing generated Python. Switch back to Adder to edit.");
}

function askInBrowser(promptText) {
  if (typeof window.prompt === "function") {
    const answer = window.prompt(String(promptText));
    return answer === null ? "" : answer;
  }
  return "";
}

function runProgram() {
  syncAdderCodeSafe();
  const source = state.adderCode;
  if (source.trim() === "") {
    setOutput("");
    setStatus("Nothing to run.");
    return;
  }
  const result = AdderRuntime.run(source, { askFunction: askInBrowser });
  if (result.error) {
    if (result.output) {
      setOutput(result.output + "\nError: " + result.error);
    } else {
      setOutput("Error: " + result.error);
    }
    setStatus("Program stopped with an error.", true);
  } else {
    setOutput(result.output);
    setStatus("Program finished.");
  }
}

function downloadPython() {
  syncAdderCodeSafe();
  let pythonText;
  try {
    pythonText = Adder.toPython(state.adderCode);
  } catch (error) {
    setStatus(String(error.message), true);
    return;
  }
  const blob = new Blob([pythonText], { type: "text\/python" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "program.py";
  document.body.appendChild(link);
  link.click();
  setTimeout(function () {
    URL.revokeObjectURL(link.href);
    link.remove();
  }, 100);
  setStatus("Downloaded program.py.");
}

function uploadPython(file) {
  const reader = new FileReader();
  reader.onload = function () {
    const pythonText = String(reader.result || "");
    let adderText;
    try {
      adderText = Adder.toAdder(pythonText);
    } catch (error) {
      setStatus(String(error.message), true);
      return;
    }
    state.adderCode = adderText;
    state.view = "adder";
    editor.value = adderText;
    editor.readOnly = false;
    markActiveView();
    setOutput("");
    setStatus("Converted " + file.name + " to Adder.");
  };
  reader.onerror = function () {
    setStatus("Could not read " + file.name + ".", true);
  };
  reader.readAsText(file);
}

runButton.addEventListener("click", runProgram);
viewAdderButton.addEventListener("click", showAdder);
viewPythonButton.addEventListener("click", showPython);
downloadButton.addEventListener("click", downloadPython);
uploadInput.addEventListener("change", function () {
  if (uploadInput.files && uploadInput.files[0]) {
    uploadPython(uploadInput.files[0]);
    uploadInput.value = "";
  }
});
editor.addEventListener("input", function () {
  if (state.view === "adder") {
    state.adderCode = editor.value;
  }
});

editor.value = state.adderCode;
markActiveView();
setOutput("");
setStatus("Ready. Press Run to execute Adder code.");
