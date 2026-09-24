const AdderRuntime = (function () {
  const slashPair = String.fromCharCode(47, 47);

  function protectStrings(sourceText) {
    const table = [];
    const text = sourceText.replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, function (match) {
      table.push(match);
      return "\u0001" + (table.length - 1) + "\u0002";
    });
    return { text: text, table: table };
  }

  function restoreStrings(sourceText, table) {
    return sourceText.replace(/\u0001(\d+)\u0002/g, function (full, digits) {
      return table[Number(digits)];
    });
  }

  function collapseSpaces(sourceText) {
    return sourceText.replace(/[ \t]+/g, " ");
  }

  function splitCallArguments(sourceText) {
    const parts = [];
    let depth = 0;
    let current = "";
    let index = 0;
    while (index < sourceText.length) {
      const ch = sourceText[index];
      if (ch === "(" || ch === "[" || ch === "{") {
        depth += 1;
        current += ch;
        index += 1;
      } else if (ch === ")" || ch === "]" || ch === "}") {
        depth -= 1;
        current += ch;
        index += 1;
      } else if (ch === "," && depth === 0) {
        parts.push(current.trim());
        current = "";
        index += 1;
      } else if (depth === 0 && sourceText.slice(index, index + 5) === " and ") {
        parts.push(current.trim());
        current = "";
        index += 5;
      } else {
        current += ch;
        index += 1;
      }
    }
    if (current.trim() !== "" || parts.length > 0) {
      parts.push(current.trim());
    }
    return parts.filter(function (part) { return part !== ""; });
  }

  function readOperandFrom(sourceText, startIndex) {
    let index = startIndex;
    while (index < sourceText.length && sourceText[index] === " ") {
      index += 1;
    }
    let depthParen = 0;
    let depthBracket = 0;
    let depthBrace = 0;
    let endIndex = index;
    while (endIndex < sourceText.length) {
      const ch = sourceText[endIndex];
      if (ch === "(") {
        depthParen += 1;
        endIndex += 1;
        continue;
      }
      if (ch === "[") {
        depthBracket += 1;
        endIndex += 1;
        continue;
      }
      if (ch === "{") {
        depthBrace += 1;
        endIndex += 1;
        continue;
      }
      if (ch === ")" || ch === "]" || ch === "}") {
        if (depthParen === 0 && depthBracket === 0 && depthBrace === 0) {
          break;
        }
        if (ch === ")") { depthParen -= 1; }
        if (ch === "]") { depthBracket -= 1; }
        if (ch === "}") { depthBrace -= 1; }
        endIndex += 1;
        continue;
      }
      if (depthParen === 0 && depthBracket === 0 && depthBrace === 0) {
        if (ch === "," || ch === "+" || ch === "%") {
          break;
        }
        if ((ch === "-" || ch === "*" || ch === "/") && endIndex > index) {
          break;
        }
        if ((ch === "<" || ch === ">" || ch === "=" || ch === "!") && endIndex > index) {
          break;
        }
        const rest = sourceText.slice(endIndex);
        if (/^ and\b/.test(rest) || /^ or\b/.test(rest) || /^ is\b/.test(rest) || /^ to the power of\b/.test(rest) || /^ with\b/.test(rest) || /^ by\b/.test(rest) || /^ from\b/.test(rest) || /^ then\b/.test(rest)) {
          break;
        }
      }
      endIndex += 1;
    }
    return { operand: sourceText.slice(index, endIndex).trim(), endIndex: endIndex };
  }

  function readOperandBefore(sourceText, beforeIndex) {
    let end = beforeIndex;
    while (end > 0 && sourceText[end - 1] === " ") {
      end -= 1;
    }
    let start = end;
    let depth = 0;
    while (start > 0) {
      const ch = sourceText[start - 1];
      if (ch === ")" || ch === "]" || ch === "}") {
        depth += 1;
        start -= 1;
        continue;
      }
      if (ch === "(" || ch === "[" || ch === "{") {
        if (depth > 0) {
          depth -= 1;
          start -= 1;
          continue;
        }
        break;
      }
      if (depth > 0) {
        start -= 1;
        continue;
      }
      if (ch === "," || ch === "+" || ch === "%") {
        break;
      }
      if (ch === "-" || ch === "*" || ch === "/") {
        break;
      }
      if (ch === "<" || ch === ">" || ch === "=" || ch === "!") {
        break;
      }
      const head = sourceText.slice(0, start);
      if (/ and $/.test(head) || / or $/.test(head) || / is $/.test(head) || / not $/.test(head) || / with $/.test(head) || / from $/.test(head) || /\( $/.test(head) || /\[ $/.test(head) || /, $/.test(head)) {
        break;
      }
      start -= 1;
    }
    return { operand: sourceText.slice(start, end).trim(), startIndex: start };
  }

  function replacePrefixKeyword(sourceText, keywordPattern, builder) {
    let text = sourceText;
    let match;
    keywordPattern.lastIndex = 0;
    while ((match = keywordPattern.exec(text)) !== null) {
      const after = match.index + match[0].length;
      const found = readOperandFrom(text, after);
      if (!found.operand) {
        throw new Error("Missing value after \"" + match[0].trim() + "\"");
      }
      const replacement = builder(found.operand);
      text = text.slice(0, match.index) + replacement + text.slice(found.endIndex);
      keywordPattern.lastIndex = match.index + replacement.length;
    }
    return text;
  }

  function replaceContainment(sourceText) {
    let text = sourceText;
    let match;
    const notInPattern = /\bis\s+not\s+in\b/g;
    notInPattern.lastIndex = 0;
    while ((match = notInPattern.exec(text)) !== null) {
      const left = readOperandBefore(text, match.index);
      const right = readOperandFrom(text, match.index + match[0].length);
      if (!left.operand || !right.operand) {
        throw new Error("Bad \"is not in\" comparison");
      }
      const replacement = "(!" + "__contains" + "(" + right.operand + ", " + left.operand + "))";
      text = text.slice(0, left.startIndex) + replacement + text.slice(right.endIndex);
      notInPattern.lastIndex = left.startIndex + replacement.length;
    }
    const inPattern = /\bis\s+in\b/g;
    inPattern.lastIndex = 0;
    while ((match = inPattern.exec(text)) !== null) {
      const left = readOperandBefore(text, match.index);
      const right = readOperandFrom(text, match.index + match[0].length);
      if (!left.operand || !right.operand) {
        throw new Error("Bad \"is in\" comparison");
      }
      const replacement = "__contains" + "(" + right.operand + ", " + left.operand + ")";
      text = text.slice(0, left.startIndex) + replacement + text.slice(right.endIndex);
      inPattern.lastIndex = left.startIndex + replacement.length;
    }
    return text;
  }


  function wrapOperand(operand) {
    const clean = operand.trim();
    if (/^[A-Za-z_]\w*$/.test(clean)) { return clean; }
    if (/^-?\d+(\.\d+)?$/.test(clean)) { return clean; }
    if (/^\u0001\d+\u0002$/.test(clean)) { return clean; }
    if (/^\([^()]*\)$/.test(clean)) { return clean; }
    if (/^\[[^\]]*\]$/.test(clean)) { return clean; }
    if (/^\{[^{}]*\}$/.test(clean)) { return clean; }
    if (/^[A-Za-z_][\w.\[\]]*$/.test(clean)) { return clean; }
    return "(" + clean + ")";
  }

  function validName(name) {
    return /^[A-Za-z_]\w*$/.test(name);
  }

  function indentJs(level) {
    return "  ".repeat(level);
  }

  function translateExpressionToJs(rawExpression) {
    const expression = rawExpression.trim();
    if (expression === "") {
      throw new Error("Empty expression");
    }
    const guarded = protectStrings(expression);
    let text = guarded.text;
    if (text.indexOf(slashPair) >= 0) {
      throw new Error("Integer division is not supported in browser run");
    }
    text = replacePrefixKeyword(text, /\blength\s+of\b/g, function (operand) {
      return "__len(" + operand + ")";
    });
    text = replacePrefixKeyword(text, /\btype\s+of\b/g, function (operand) {
      return "__type(" + operand + ")";
    });
    text = replacePrefixKeyword(text, /\bstring\s+of\b/g, function (operand) {
      return "String(" + operand + ")";
    });
    text = replacePrefixKeyword(text, /\bnumber\s+of\b/g, function (operand) {
      return "Number(" + operand + ")";
    });
    text = replacePrefixKeyword(text, /\bkeys\s+of\b/g, function (operand) {
      return "Object.keys(" + operand + ")";
    });
    text = replacePrefixKeyword(text, /\bvalues\s+of\b/g, function (operand) {
      return "Object.values(" + operand + ")";
    });
    text = replacePrefixKeyword(text, /\blowercase\b/g, function (operand) {
      return "String(" + operand + ").toLowerCase()";
    });
    text = (function () {
      let output = text;
      let match;
      const joinPattern = /\bjoin\b/g;
      joinPattern.lastIndex = 0;
      while ((match = joinPattern.exec(output)) !== null) {
        const first = readOperandFrom(output, match.index + match[0].length);
        if (!first.operand) {
          throw new Error("Missing value after \"join\"");
        }
        const withRemainder = output.slice(first.endIndex);
        const withMatch = withRemainder.match(/^\s+with\b/);
        if (!withMatch) {
          throw new Error("\"join\" needs \"with\"");
        }
        const second = readOperandFrom(output, first.endIndex + withMatch[0].length);
        if (!second.operand) {
          throw new Error("Missing separator after \"with\"");
        }
        const replacement = wrapOperand(first.operand) + ".join(" + second.operand + ")";
        output = output.slice(0, match.index) + replacement + output.slice(second.endIndex);
        joinPattern.lastIndex = match.index + replacement.length;
      }
      const splitPattern = /\bsplit\b/g;
      splitPattern.lastIndex = 0;
      while ((match = splitPattern.exec(output)) !== null) {
        const first = readOperandFrom(output, match.index + match[0].length);
        if (!first.operand) {
          throw new Error("Missing value after \"split\"");
        }
        const byRemainder = output.slice(first.endIndex);
        const byMatch = byRemainder.match(/^\s+by\b/);
        let replacement;
        let tail;
        if (byMatch) {
          const second = readOperandFrom(output, first.endIndex + byMatch[0].length);
          if (!second.operand) {
            throw new Error("Missing separator after \"by\"");
          }
          replacement = "String(" + first.operand + ").split(" + second.operand + ")";
          tail = second.endIndex;
        } else {
          replacement = "String(" + first.operand + ").split()";
          tail = first.endIndex;
        }
        output = output.slice(0, match.index) + replacement + output.slice(tail);
        splitPattern.lastIndex = match.index + replacement.length;
      }
      return output;
    })();
    text = replacePrefixKeyword(text, /\buppercase\b/g, function (operand) {
      return "String(" + operand + ").toUpperCase()";
    });
    let match;
    const askNumberPattern = /\bask\s+number\b/g;
    askNumberPattern.lastIndex = 0;
    while ((match = askNumberPattern.exec(text)) !== null) {
      const found = readOperandFrom(text, match.index + match[0].length);
      if (!found.operand) {
        throw new Error("Missing value after \"ask number\"");
      }
      const replacement = "Number(__ask(" + found.operand + "))";
      text = text.slice(0, match.index) + replacement + text.slice(found.endIndex);
      askNumberPattern.lastIndex = match.index + replacement.length;
    }
    const askPattern = /\bask\b/g;
    askPattern.lastIndex = 0;
    while ((match = askPattern.exec(text)) !== null) {
      const found = readOperandFrom(text, match.index + match[0].length);
      if (!found.operand) {
        throw new Error("Missing value after \"ask\"");
      }
      const replacement = "__ask(" + found.operand + ")";
      text = text.slice(0, match.index) + replacement + text.slice(found.endIndex);
      askPattern.lastIndex = match.index + replacement.length;
    }
    text = text.replace(/\bto the power of\b/g, " ** ");
    const callPattern = /\bcall\s+([A-Za-z_]\w*)\s+with\b/g;
    callPattern.lastIndex = 0;
    while ((match = callPattern.exec(text)) !== null) {
      const name = match[1];
      const argsStart = match.index + match[0].length;
      let depth = 0;
      let endPos = argsStart;
      while (endPos < text.length) {
        const ch = text[endPos];
        if (ch === "(" || ch === "[" || ch === "{") { depth += 1; }
        if (ch === ")" || ch === "]" || ch === "}") {
          if (depth === 0) { break; }
          depth -= 1;
        }
        if (ch === "," && depth === 0) { break; }
        endPos += 1;
      }
      const argsText = text.slice(argsStart, endPos).trim();
      const args = splitCallArguments(argsText);
      const replacement = name + "(" + args.join(", ") + ")";
      text = text.slice(0, match.index) + replacement + text.slice(endPos);
      callPattern.lastIndex = match.index + replacement.length;
    }
    text = text.replace(/\bcall\s+([A-Za-z_]\w*)\s*\(\s*\)/g, "$1()");
    text = replaceContainment(text);
    text = text.replace(/\bis\s+not\s+equal\s+to\b/g, " !== ");
    text = text.replace(/\bis\s+equal\s+to\b/g, " === ");
    text = text.replace(/\bis\s+greater\s+than\b/g, " > ");
    text = text.replace(/\bis\s+less\s+than\b/g, " < ");
    text = text.replace(/\bis\s+at\s+least\b/g, " >= ");
    text = text.replace(/\bis\s+at\s+most\b/g, " <= ");
    text = text.replace(/\bis\s+not\b/g, " !== ");
    text = text.replace(/\bis\b/g, " === ");
    text = text.replace(/\bempty\b/g, "null");
    text = text.replace(/\band\b/g, "&&");
    text = text.replace(/\bor\b/g, "||");
    text = text.replace(/\bnot\b/g, "!");
    text = collapseSpaces(text).trim();
    return restoreStrings(text, guarded.table);
  }

  function showValue(value, nested) {
    if (value instanceof Error) {
      return value.message;
    }
    if (value === null || value === undefined) {
      return "None";
    }
    if (value === true) {
      return "True";
    }
    if (value === false) {
      return "False";
    }
    if (typeof value === "string") {
      if (nested) {
        return "'" + value.replace(/'/g, "\\'") + "'";
      }
      return value;
    }
    if (Array.isArray(value)) {
      return "[" + value.map(function (item) { return showValue(item, true); }).join(", ") + "]";
    }
    if (typeof value === "object") {
      const entries = Object.keys(value).map(function (key) {
        return "'" + key + "': " + showValue(value[key], true);
      });
      return "{" + entries.join(", ") + "}";
    }
    return String(value);
  }

  function makeHelpers(collectedLines, askFunction) {
    const displayFunction = function () {
      const args = Array.prototype.slice.call(arguments);
      collectedLines.push(args.map(function (item) { return showValue(item, false); }).join(" "));
    };
    const askHelper = function (promptText) {
      if (typeof askFunction === "function") {
        return askFunction(promptText);
      }
      if (typeof window !== "undefined" && typeof window.prompt === "function") {
        const answer = window.prompt(String(promptText));
        return answer === null ? "" : answer;
      }
      return "";
    };
    const containsHelper = function (container, item) {
      if (container === null || container === undefined) {
        return false;
      }
      if (Array.isArray(container) || typeof container === "string") {
        return container.includes(item);
      }
      if (typeof container === "object") {
        return Object.prototype.hasOwnProperty.call(container, item) || Object.keys(container).includes(String(item));
      }
      return false;
    };
    const lenHelper = function (value) {
      if (value === null || value === undefined) {
        return 0;
      }
      if (typeof value === "string" || Array.isArray(value)) {
        return value.length;
      }
      if (typeof value === "object") {
        return Object.keys(value).length;
      }
      return String(value).length;
    };
    const typeHelper = function (value) {
      if (value === null) {
        return "NoneType";
      }
      if (Array.isArray(value)) {
        return "list";
      }
      if (typeof value === "string") {
        return "str";
      }
      if (typeof value === "number") {
        return "float";
      }
      if (typeof value === "boolean") {
        return "bool";
      }
      if (typeof value === "object") {
        return "dict";
      }
      return typeof value;
    };
    const iterHelper = function (value) {
      if (value === null || value === undefined) {
        return [];
      }
      if (Array.isArray(value) || typeof value === "string") {
        return value;
      }
      if (typeof value === "object") {
        return Object.keys(value);
      }
      return [value];
    };
    const removeHelper = function (container, item) {
      if (Array.isArray(container)) {
        const position = container.indexOf(item);
        if (position < 0) {
          throw new Error(String(item) + " is not in list");
        }
        container.splice(position, 1);
        return;
      }
      if (typeof container === "object" && container !== null) {
        if (Object.prototype.hasOwnProperty.call(container, item)) {
          delete container[item];
          return;
        }
        throw new Error(String(item) + " is not in dictionary");
      }
      throw new Error("Cannot remove from that value");
    };
    const state = { steps: 0 };
    const tickHelper = function () {
      state.steps += 1;
      if (state.steps > 2000000) {
        throw new Error("Loop limit exceeded");
      }
    };
    const rangeHelper = function (start, stop, step) {
      if (stop === undefined) {
        stop = start;
        start = 0;
      }
      if (step === undefined) {
        step = 1;
      }
      const result = [];
      if (step > 0) {
        for (let value = start; value < stop; value += step) {
          result.push(value);
        }
      } else {
        for (let value = start; value > stop; value += step) {
          result.push(value);
        }
      }
      return result;
    };
    return {
      displayFunction: displayFunction,
      askHelper: askHelper,
      containsHelper: containsHelper,
      lenHelper: lenHelper,
      typeHelper: typeHelper,
      iterHelper: iterHelper,
      removeHelper: removeHelper,
      tickHelper: tickHelper,
      rangeHelper: rangeHelper
    };
  }

  function parseRangeHeader(headerText) {
    const fromMarker = headerText.search(/\sfrom\s/);
    if (fromMarker < 0) {
      throw new Error("Range loop needs \"from\"");
    }
    const loopName = headerText.slice(0, fromMarker).trim();
    const rest = headerText.slice(fromMarker).replace(/^\sfrom\s/, "");
    let toIndex = -1;
    let scanDepth = 0;
    let scanIndex = 0;
    while (scanIndex < rest.length) {
      const ch = rest[scanIndex];
      if (ch === "(" || ch === "[" || ch === "{") { scanDepth += 1; }
      if (ch === ")" || ch === "]" || ch === "}") { scanDepth -= 1; }
      if (scanDepth === 0 && rest.slice(scanIndex, scanIndex + 4) === " to ") {
        if (!/^the power of\b/.test(rest.slice(scanIndex + 4))) {
          toIndex = scanIndex;
          break;
        }
      }
      scanIndex += 1;
    }
    if (toIndex < 0) {
      throw new Error("Range loop needs \"to\"");
    }
    const startText = rest.slice(0, toIndex).trim();
    const endAndStep = rest.slice(toIndex + 4).trim();
    let endText = endAndStep;
    let stepText = "1";
    scanDepth = 0;
    scanIndex = 0;
    let stepIndex = -1;
    while (scanIndex < endAndStep.length) {
      const ch = endAndStep[scanIndex];
      if (ch === "(" || ch === "[" || ch === "{") { scanDepth += 1; }
      if (ch === ")" || ch === "]" || ch === "}") { scanDepth -= 1; }
      if (scanDepth === 0 && endAndStep.slice(scanIndex, scanIndex + 6) === " step ") {
        stepIndex = scanIndex;
        break;
      }
      scanIndex += 1;
    }
    if (stepIndex >= 0) {
      endText = endAndStep.slice(0, stepIndex).trim();
      stepText = endAndStep.slice(stepIndex + 6).trim();
    }
    if (!validName(loopName)) {
      throw new Error("Bad loop variable \"" + loopName + "\"");
    }
    if (!startText || !endText) {
      throw new Error("Range loop needs start and end values");
    }
    return { loopName: loopName, startText: startText, endText: endText, stepText: stepText };
  }

  function toJs(source) {
    const lines = String(source).split("\n");
    const output = [];
    const blocks = [];
    const declared = {};
    let level = 0;
    for (let index = 0; index < lines.length; index++) {
      const lineNumber = index + 1;
      const trimmed = lines[index].trim();
      if (trimmed === "") {
        continue;
      }
      if (trimmed.startsWith("#")) {
        continue;
      }
      const fail = function (message) {
        throw new Error("Line " + lineNumber + ": " + message);
      };
      let match;
      if ((match = trimmed.match(/^if\s+(.+)\s+then$/))) {
        let condition;
        try {
          condition = translateExpressionToJs(match[1]);
        } catch (error) {
          fail(error.message);
        }
        output.push(indentJs(level) + "if (" + condition + ") {");
        blocks.push("if");
        level += 1;
        continue;
      }
      if ((match = trimmed.match(/^otherwise\s+if\s+(.+)\s+then$/))) {
        if (blocks[blocks.length - 1] !== "if") {
          fail("\"otherwise if\" without matching \"if\"");
        }
        let condition;
        try {
          condition = translateExpressionToJs(match[1]);
        } catch (error) {
          fail(error.message);
        }
        level -= 1;
        output.push(indentJs(level) + "} else if (" + condition + ") {");
        level += 1;
        continue;
      }
      if (/^otherwise(\s+then)?$/.test(trimmed)) {
        if (blocks[blocks.length - 1] !== "if") {
          fail("\"otherwise\" without matching \"if\"");
        }
        level -= 1;
        output.push(indentJs(level) + "} else {");
        level += 1;
        continue;
      }
      if (/^end\s+if$/.test(trimmed)) {
        if (blocks.pop() !== "if") {
          fail("\"end if\" without matching \"if\"");
        }
        level -= 1;
        output.push(indentJs(level) + "}");
        continue;
      }
      if ((match = trimmed.match(/^for\s+each\s+(.+)\s+then$/))) {
        const header = match[1];
        const inPosition = header.search(/\sin\s/);
        if (inPosition < 0) {
          fail("Loop needs \"for each NAME in LIST then\"");
        }
        const itemName = header.slice(0, inPosition).trim();
        const listText = header.slice(inPosition + 4).trim();
        if (!validName(itemName)) {
          fail("Bad loop variable \"" + itemName + "\"");
        }
        let listExpression;
        try {
          listExpression = translateExpressionToJs(listText);
        } catch (error) {
          fail(error.message);
        }
        output.push(indentJs(level) + "for (let " + itemName + " of __iter(" + listExpression + ")) {");
        blocks.push("for");
        level += 1;
        output.push(indentJs(level) + "__tick();");
        continue;
      }
      if ((match = trimmed.match(/^for\s+(.+)\s+then$/))) {
        let parsed;
        try {
          parsed = parseRangeHeader(match[1]);
        } catch (error) {
          fail(error.message);
        }
        let startExpression;
        let endExpression;
        let stepExpression;
        try {
          startExpression = translateExpressionToJs(parsed.startText);
          endExpression = translateExpressionToJs(parsed.endText);
          stepExpression = translateExpressionToJs(parsed.stepText);
        } catch (error) {
          fail(error.message);
        }
        output.push(indentJs(level) + "for (let " + parsed.loopName + " = " + startExpression + "; (" + stepExpression + ") >= 0 ? " + parsed.loopName + " <= (" + endExpression + ") : " + parsed.loopName + " >= (" + endExpression + "); " + parsed.loopName + " += (" + stepExpression + ")) {");
        blocks.push("for");
        level += 1;
        output.push(indentJs(level) + "__tick();");
        continue;
      }
      if ((match = trimmed.match(/^while\s+(.+)\s+then$/))) {
        let condition;
        try {
          condition = translateExpressionToJs(match[1]);
        } catch (error) {
          fail(error.message);
        }
        output.push(indentJs(level) + "while (" + condition + ") {");
        blocks.push("while");
        level += 1;
        output.push(indentJs(level) + "__tick();");
        continue;
      }
      if ((match = trimmed.match(/^repeat\s+(.+)\s+times\s+then$/))) {
        let countExpression;
        try {
          countExpression = translateExpressionToJs(match[1]);
        } catch (error) {
          fail(error.message);
        }
        output.push(indentJs(level) + "for (let _ = 0; _ < Number(" + countExpression + "); _++) {");
        blocks.push("repeat");
        level += 1;
        output.push(indentJs(level) + "__tick();");
        continue;
      }
      if (/^end\s+for$/.test(trimmed)) {
        const kind = blocks.pop();
        if (kind !== "for" && kind !== "repeat") {
          fail("\"end for\" without matching loop");
        }
        level -= 1;
        output.push(indentJs(level) + "}");
        continue;
      }
      if (/^end\s+while$/.test(trimmed)) {
        if (blocks.pop() !== "while") {
          fail("\"end while\" without matching \"while\"");
        }
        level -= 1;
        output.push(indentJs(level) + "}");
        continue;
      }
      if (/^end\s+repeat$/.test(trimmed)) {
        if (blocks.pop() !== "repeat") {
          fail("\"end repeat\" without matching \"repeat\"");
        }
        level -= 1;
        output.push(indentJs(level) + "}");
        continue;
      }
      if ((match = trimmed.match(/^define\s+function\s+([A-Za-z_]\w*)(?:\s+with\s+(.+?))?\s+then$/))) {
        const functionName = match[1];
        let params = [];
        if (match[2]) {
          params = match[2].split(/\s+and\s+|,\s*/).map(function (part) { return part.trim(); }).filter(function (part) { return part !== ""; });
          for (const name of params) {
            if (!validName(name)) {
              fail("Bad parameter name \"" + name + "\"");
            }
          }
        }
        declared[functionName] = true;
        output.push(indentJs(level) + "function " + functionName + "(" + params.join(", ") + ") {");
        blocks.push("function");
        level += 1;
        continue;
      }
      if (/^end\s+function$/.test(trimmed)) {
        if (blocks.pop() !== "function") {
          fail("\"end function\" without matching function");
        }
        level -= 1;
        output.push(indentJs(level) + "}");
        continue;
      }
      if (/^try\s+then$/.test(trimmed)) {
        output.push(indentJs(level) + "try {");
        blocks.push("try");
        level += 1;
        continue;
      }
      if ((match = trimmed.match(/^catch(?:\s+([A-Za-z_]\w*))?\s+then$/))) {
        if (blocks[blocks.length - 1] !== "try") {
          fail("\"catch\" without matching \"try\"");
        }
        level -= 1;
        if (match[1]) {
          output.push(indentJs(level) + "} catch (" + match[1] + ") {");
        } else {
          output.push(indentJs(level) + "} catch (__adderError) {");
        }
        level += 1;
        continue;
      }
      if (/^end\s+try$/.test(trimmed)) {
        if (blocks.pop() !== "try") {
          fail("\"end try\" without matching \"try\"");
        }
        level -= 1;
        output.push(indentJs(level) + "}");
        continue;
      }
      if ((match = trimmed.match(/^set\s+([A-Za-z_]\w*(?:\[[^\]]*\]|\.[A-Za-z_]\w*)*)\s+to\s+(.+)$/))) {
        let valueExpression;
        try {
          valueExpression = translateExpressionToJs(match[2]);
        } catch (error) {
          fail(error.message);
        }
        const target = match[1];
        if (validName(target) && !declared[target]) {
          declared[target] = true;
          output.push(indentJs(level) + "let " + target + " = " + valueExpression + ";");
        } else {
          output.push(indentJs(level) + target + " = " + valueExpression + ";");
        }
        continue;
      }
      if ((match = trimmed.match(/^display(?:\s+(.+))?$/))) {
        if (!match[1]) {
          fail("\"display\" needs a value");
        }
        let valueExpression;
        try {
          valueExpression = translateExpressionToJs(match[1]);
        } catch (error) {
          fail(error.message);
        }
        output.push(indentJs(level) + "__display(" + valueExpression + ");");
        continue;
      }
      if ((match = trimmed.match(/^add\s+(.+)\s+to\s+(\S+)$/))) {
        let valueExpression;
        try {
          valueExpression = translateExpressionToJs(match[1]);
        } catch (error) {
          fail(error.message);
        }
        output.push(indentJs(level) + match[2] + ".push(" + valueExpression + ");");
        continue;
      }
      if ((match = trimmed.match(/^remove\s+(.+)\s+from\s+(\S+)$/))) {
        let valueExpression;
        try {
          valueExpression = translateExpressionToJs(match[1]);
        } catch (error) {
          fail(error.message);
        }
        output.push(indentJs(level) + "__remove(" + match[2] + ", " + valueExpression + ");");
        continue;
      }
      if ((match = trimmed.match(/^throw\s+(.+)$/))) {
        let valueExpression;
        try {
          valueExpression = translateExpressionToJs(match[1]);
        } catch (error) {
          fail(error.message);
        }
        output.push(indentJs(level) + "throw (" + valueExpression + ");");
        continue;
      }
      if ((match = trimmed.match(/^return(?:\s+(.+))?$/))) {
        if (blocks.indexOf("function") < 0) {
          fail("\"return\" outside a function");
        }
        if (match[1]) {
          let valueExpression;
          try {
            valueExpression = translateExpressionToJs(match[1]);
          } catch (error) {
            fail(error.message);
          }
          output.push(indentJs(level) + "return " + valueExpression + ";");
        } else {
          output.push(indentJs(level) + "return;");
        }
        continue;
      }
      if (/^(break|continue)$/.test(trimmed)) {
        output.push(indentJs(level) + trimmed + ";");
        continue;
      }
      if (/^import\s+/.test(trimmed)) {
        fail("Imports are not supported in browser run");
      }
      if ((match = trimmed.match(/^call\s+([A-Za-z_]\w*)(?:\s+with\s+(.+))?$/))) {
        if (!validName(match[1])) {
          fail("Bad function name \"" + match[1] + "\"");
        }
        if (match[2]) {
          const args = splitCallArguments(match[2]);
          const translated = [];
          try {
            for (const arg of args) {
              translated.push(translateExpressionToJs(arg));
            }
          } catch (error) {
            fail(error.message);
          }
          output.push(indentJs(level) + match[1] + "(" + translated.join(", ") + ");");
        } else {
          output.push(indentJs(level) + match[1] + "();");
        }
        continue;
      }
      if (/^ask\s+/.test(trimmed)) {
        let valueExpression;
        try {
          valueExpression = translateExpressionToJs(trimmed);
        } catch (error) {
          fail(error.message);
        }
        output.push(indentJs(level) + valueExpression + ";");
        continue;
      }
      if (/^(if|otherwise|for|while|repeat|define|end|try|catch|set|display|add|remove|throw|return|call|import|break|continue|ask)\b/.test(trimmed)) {
        fail("Unknown statement. Expected set, display, if, for, while, repeat, define function, try, import, call, add, remove, throw, return, break or continue.");
      }
      try {
        const statementExpression = translateExpressionToJs(trimmed);
        output.push(indentJs(level) + statementExpression + ";");
      } catch (error) {
        fail("Unknown statement. Expected set, display, if, for, while, repeat, define function, try, import, call, add, remove, throw, return, break or continue.");
      }
    }
    if (blocks.length > 0) {
      throw new Error("Missing \"" + "end " + blocks[blocks.length - 1] + "\" for an open block");
    }
    return output.join("\n");
  }

  function run(source, options) {
    const settings = options || {};
    const collectedLines = [];
    let body;
    try {
      body = toJs(source);
    } catch (error) {
      return { output: "", error: String(error.message) };
    }
    const helpers = makeHelpers(collectedLines, settings.askFunction);
    let runner;
    try {
      runner = Function("__display", "__ask", "__contains", "__len", "__type", "__iter", "__remove", "__tick", "range", body);
    } catch (error) {
      return { output: "", error: String(error.message) };
    }
    try {
      runner(helpers.displayFunction, helpers.askHelper, helpers.containsHelper, helpers.lenHelper, helpers.typeHelper, helpers.iterHelper, helpers.removeHelper, helpers.tickHelper, helpers.rangeHelper);
    } catch (error) {
      const text = collectedLines.join("\n");
      return { output: text, error: String(error && error.message ? error.message : error) };
    }
    return { output: collectedLines.join("\n"), error: "" };
  }

  return {
    toJs: toJs,
    run: run,
    translateExpressionToJs: translateExpressionToJs
  };
})();

if (typeof window !== "undefined") {
  window.AdderRuntime = AdderRuntime;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = AdderRuntime;
}
