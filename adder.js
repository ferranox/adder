const Adder = (function () {
  const adderState = { active: true };

  function protectStrings(sourceText) {
    const table = [];
    const placeholder = function (index) {
      return "\u0001" + index + "\u0002";
    };
    const text = sourceText.replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, function (match) {
      table.push(match);
      return placeholder(table.length - 1);
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

  function splitTopLevelComma(sourceText) {
    const parts = [];
    let depth = 0;
    let current = "";
    for (let index = 0; index < sourceText.length; index++) {
      const ch = sourceText[index];
      if (ch === "(" || ch === "[" || ch === "{") {
        depth += 1;
        current += ch;
      } else if (ch === ")" || ch === "]" || ch === "}") {
        depth -= 1;
        current += ch;
      } else if (ch === "," && depth === 0) {
        parts.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    if (current.trim() !== "" || parts.length > 0) {
      parts.push(current.trim());
    }
    return parts.filter(function (part) { return part !== ""; });
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
      } else if (depth === 0 && sourceText.slice(index, index + 5) === " and " ) {
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
        if ((ch === "-" || ch === "*" || ch === "/" || ch === "<" || ch === ">" || ch === "=" || ch === "!") && endIndex > index) {
          const prev = sourceText[endIndex - 1];
          if (prev === " " || prev === "(" || prev === "[" || prev === "," || /[0-9A-Za-z_\u0001\u0002]/.test(prev)) {
            if (ch === "*" && sourceText[endIndex + 1] === "*") {
              break;
            }
            if ((ch === "<" || ch === ">" || ch === "=" || ch === "!") && sourceText[endIndex - 1] !== " ") {
              endIndex += 1;
              continue;
            }
            break;
          }
        }
        const rest = sourceText.slice(endIndex);
        if (/^ and\b/.test(rest) || /^ or\b/.test(rest) || /^ is\b/.test(rest) || /^ to the power of\b/.test(rest) || /^ with\b/.test(rest) || /^ by\b/.test(rest) || /^ from\b/.test(rest) || /^ then\b/.test(rest)) {
          break;
        }
      }
      endIndex += 1;
    }
    const operand = sourceText.slice(index, endIndex).trim();
    return { operand: operand, endIndex: endIndex };
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

  function indentPython(level) {
    return "    ".repeat(level);
  }

  function translateAdderExpressionToPython(rawExpression) {
    const expression = rawExpression.trim();
    if (expression === "") {
      throw new Error("Empty expression");
    }
    const guarded = protectStrings(expression);
    let text = guarded.text;
    text = replacePrefixKeyword(text, /\blength\s+of\b/g, function (operand) {
      return "len(" + operand + ")";
    });
    text = replacePrefixKeyword(text, /\btype\s+of\b/g, function (operand) {
      return "type(" + operand + ")";
    });
    text = replacePrefixKeyword(text, /\bstring\s+of\b/g, function (operand) {
      return "str(" + operand + ")";
    });
    text = replacePrefixKeyword(text, /\bnumber\s+of\b/g, function (operand) {
      return "float(" + operand + ")";
    });
    text = replacePrefixKeyword(text, /\bkeys\s+of\b/g, function (operand) {
      return "list(" + wrapOperand(operand) + ".keys())";
    });
    text = replacePrefixKeyword(text, /\bvalues\s+of\b/g, function (operand) {
      return "list(" + wrapOperand(operand) + ".values())";
    });
    text = replacePrefixKeyword(text, /\blowercase\b/g, function (operand) {
      return wrapOperand(operand) + ".lower()";
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
        const replacement = wrapOperand(second.operand) + ".join(" + first.operand + ")";
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
          replacement = wrapOperand(first.operand) + ".split(" + second.operand + ")";
          tail = second.endIndex;
        } else {
          replacement = wrapOperand(first.operand) + ".split()";
          tail = first.endIndex;
        }
        output = output.slice(0, match.index) + replacement + output.slice(tail);
        splitPattern.lastIndex = match.index + replacement.length;
      }
      return output;
    })();
    text = replacePrefixKeyword(text, /\buppercase\b/g, function (operand) {
      return wrapOperand(operand) + ".upper()";
    });
    text = (function () {
      let output = text;
      let match;
      const askNumberPattern = /\bask\s+number\b/g;
      askNumberPattern.lastIndex = 0;
      while ((match = askNumberPattern.exec(output)) !== null) {
        const found = readOperandFrom(output, match.index + match[0].length);
        if (!found.operand) {
          throw new Error("Missing value after \"ask number\"");
        }
        const replacement = "float(input(" + found.operand + "))";
        output = output.slice(0, match.index) + replacement + output.slice(found.endIndex);
        askNumberPattern.lastIndex = match.index + replacement.length;
      }
      const askPattern = /\bask\b/g;
      askPattern.lastIndex = 0;
      while ((match = askPattern.exec(output)) !== null) {
        const found = readOperandFrom(output, match.index + match[0].length);
        if (!found.operand) {
          throw new Error("Missing value after \"ask\"");
        }
        const replacement = "input(" + found.operand + ")";
        output = output.slice(0, match.index) + replacement + output.slice(found.endIndex);
        askPattern.lastIndex = match.index + replacement.length;
      }
      return output;
    })();
    text = text.replace(/\bto the power of\b/g, " ** ");
    text = (function () {
      let output = text;
      let match;
      const callPattern = /\bcall\s+([A-Za-z_]\w*)\s+with\b/g;
      callPattern.lastIndex = 0;
      while ((match = callPattern.exec(output)) !== null) {
        const name = match[1];
        const argsStart = match.index + match[0].length;
        let depth = 0;
        let endPos = argsStart;
        while (endPos < output.length) {
          const ch = output[endPos];
          if (ch === "(" || ch === "[" || ch === "{") { depth += 1; }
          if (ch === ")" || ch === "]" || ch === "}") {
            if (depth === 0) { break; }
            depth -= 1;
          }
          if (ch === "," && depth === 0) { break; }
          endPos += 1;
        }
        const argsText = output.slice(argsStart, endPos).trim();
        const args = splitCallArguments(argsText);
        const replacement = name + "(" + args.join(", ") + ")";
        output = output.slice(0, match.index) + replacement + output.slice(endPos);
        callPattern.lastIndex = match.index + replacement.length;
      }
      output = output.replace(/\bcall\s+([A-Za-z_]\w*)\s*\(\s*\)/g, "$1()");
      return output;
    })();
    text = text.replace(/\bis\s+not\s+in\b/g, " not in ");
    text = text.replace(/\bis\s+in\b/g, " in ");
    text = text.replace(/\bis\s+not\s+equal\s+to\b/g, " != ");
    text = text.replace(/\bis\s+equal\s+to\b/g, " == ");
    text = text.replace(/\bis\s+greater\s+than\b/g, " > ");
    text = text.replace(/\bis\s+less\s+than\b/g, " < ");
    text = text.replace(/\bis\s+at\s+least\b/g, " >= ");
    text = text.replace(/\bis\s+at\s+most\b/g, " <= ");
    text = text.replace(/\bis\s+not\b/g, " != ");
    text = text.replace(/\bis\b/g, " == ");
    text = text.replace(/\btrue\b/g, "True");
    text = text.replace(/\bfalse\b/g, "False");
    text = text.replace(/\bempty\b/g, "None");
    text = collapseSpaces(text).trim();
    return restoreStrings(text, guarded.table);
  }

  function translatePythonExpressionToAdder(rawExpression) {
    const expression = rawExpression.trim();
    if (expression === "") {
      throw new Error("Empty expression");
    }
    const guarded = protectStrings(expression);
    let text = guarded.text;
    text = text.replace(/\*\*/g, "\u0001POW\u0002");
    text = text.replace(/!=/g, "\u0001NE\u0002");
    text = text.replace(/==/g, "\u0001EQ\u0002");
    text = text.replace(/>=/g, "\u0001GE\u0002");
    text = text.replace(/<=/g, "\u0001LE\u0002");
    text = text.replace(/>/g, " is greater than ");
    text = text.replace(/</g, " is less than ");
    text = text.replace(/\u0001GE\u0002/g, " is at least ");
    text = text.replace(/\u0001LE\u0002/g, " is at most ");
    text = text.replace(/\u0001NE\u0002/g, " is not ");
    text = text.replace(/\u0001EQ\u0002/g, " is ");
    text = text.replace(/\bnot\s+in\b/g, "\u0001NIN\u0002");
    text = text.replace(/\bin\b/g, " is in ");
    text = text.replace(/\u0001NIN\u0002/g, " is not in ");
    text = text.replace(/\u0001POW\u0002/g, " to the power of ");
    text = text.replace(/\bfloat\s*\(\s*input\s*\((.*?)\)\s*\)/g, "ask number $1");
    text = text.replace(/\bint\s*\(\s*input\s*\((.*?)\)\s*\)/g, "ask number $1");
    text = text.replace(/\binput\s*\((.*?)\)/g, "ask $1");
    text = text.replace(/\blen\s*\(([^()]*)\)/g, "length of $1");
    text = text.replace(/\bstr\s*\(([^()]*)\)/g, "string of $1");
    text = text.replace(/\btype\s*\(([^()]*)\)/g, "type of $1");
    text = text.replace(/\b(float|int)\s*\(([^()]*)\)/g, "number of $2");
    text = text.replace(/\blist\s*\(\s*([A-Za-z_\u0001][\w.\u0001\u0002\[\]]*)\.keys\(\)\s*\)/g, "keys of $1");
    text = text.replace(/\blist\s*\(\s*([A-Za-z_\u0001][\w.\u0001\u0002\[\]]*)\.values\(\)\s*\)/g, "values of $1");
    text = text.replace(/([A-Za-z_\u0001][\w.\u0001\u0002\[\]]*)\.keys\(\)/g, "keys of $1");
    text = text.replace(/([A-Za-z_\u0001][\w.\u0001\u0002\[\]]*)\.values\(\)/g, "values of $1");
    text = text.replace(/((?:\([^()]*\)|[A-Za-z_\u0001][\w.\u0001\u0002\[\]]*?)+?)\.join\(([^()]*)\)/g, "join $2 with $1");
    text = text.replace(/((?:\([^()]*\)|[A-Za-z_\u0001][\w.\u0001\u0002\[\]]*?)+?)\.split\(\s*\)/g, "split $1");
    text = text.replace(/((?:\([^()]*\)|[A-Za-z_\u0001][\w.\u0001\u0002\[\]]*?)+?)\.split\(([^()]*)\)/g, "split $1 by $2");
    text = text.replace(/((?:\([^()]*\)|[A-Za-z_\u0001][\w.\u0001\u0002\[\]]*?)+?)\.lower\(\)/g, "lowercase $1");
    text = text.replace(/((?:\([^()]*\)|[A-Za-z_\u0001][\w.\u0001\u0002\[\]]*?)+?)\.upper\(\)/g, "uppercase $1");
    text = text.replace(/\bTrue\b/g, "true");
    text = text.replace(/\bFalse\b/g, "false");
    text = text.replace(/\bNone\b/g, "empty");
    text = collapseSpaces(text).trim();
    return restoreStrings(text, guarded.table);
  }

  function parseAdderRangeHeader(headerText) {
    const fromMarker = headerText.search(/\sfrom\s/);
    if (fromMarker < 0) {
      throw new Error("Range loop needs \"from\"");
    }
    const loopName = headerText.slice(0, fromMarker).trim();
    const rest = headerText.slice(fromMarker).replace(/^\sfrom\s/, "");
    let toParts = null;
    let scanDepth = 0;
    let scanIndex = 0;
    let toIndex = -1;
    while (scanIndex < rest.length) {
      const ch = rest[scanIndex];
      if (ch === "(" || ch === "[" || ch === "{") { scanDepth += 1; }
      if (ch === ")" || ch === "]" || ch === "}") { scanDepth -= 1; }
      if (scanDepth === 0 && rest.slice(scanIndex, scanIndex + 4) === " to ") {
        if (rest.slice(scanIndex + 4, scanIndex + 17) !== "to the power") {
          const afterTo = rest.slice(scanIndex + 4);
          if (!/^the power of\b/.test(afterTo)) {
            toIndex = scanIndex;
            break;
          }
        }
      }
      scanIndex += 1;
    }
    if (toIndex < 0) {
      throw new Error("Range loop needs \"to\"");
    }
    const startText = rest.slice(0, toIndex).trim();
    let endAndStep = rest.slice(toIndex + 4).trim();
    let endText = endAndStep;
    let stepText = null;
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
    if (stepText !== null && stepText === "") {
      throw new Error("Range loop step is empty");
    }
    return { loopName: loopName, startText: startText, endText: endText, stepText: stepText };
  }

  function toPython(source) {
    const lines = String(source).split("\n");
    const output = [];
    let level = 0;
    const blocks = [];
    for (let index = 0; index < lines.length; index++) {
      const lineNumber = index + 1;
      const raw = lines[index];
      const trimmed = raw.trim();
      if (trimmed === "") {
        output.push("");
        continue;
      }
      if (trimmed.startsWith("#")) {
        output.push(indentPython(level) + trimmed);
        continue;
      }
      const fail = function (message) {
        throw new Error("Line " + lineNumber + ": " + message);
      };
      let match;
      if ((match = trimmed.match(/^if\s+(.+)\s+then$/))) {
        let condition;
        try {
          condition = translateAdderExpressionToPython(match[1]);
        } catch (error) {
          fail(error.message);
        }
        output.push(indentPython(level) + "if " + condition + ":");
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
          condition = translateAdderExpressionToPython(match[1]);
        } catch (error) {
          fail(error.message);
        }
        level -= 1;
        output.push(indentPython(level) + "elif " + condition + ":");
        level += 1;
        continue;
      }
      if (/^otherwise(\s+then)?$/.test(trimmed)) {
        if (blocks[blocks.length - 1] !== "if") {
          fail("\"otherwise\" without matching \"if\"");
        }
        level -= 1;
        output.push(indentPython(level) + "else:");
        level += 1;
        continue;
      }
      if (/^end\s+if$/.test(trimmed)) {
        if (blocks.pop() !== "if") {
          fail("\"end if\" without matching \"if\"");
        }
        level -= 1;
        if (level < 0) { level = 0; }
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
          listExpression = translateAdderExpressionToPython(listText);
        } catch (error) {
          fail(error.message);
        }
        output.push(indentPython(level) + "for " + itemName + " in " + listExpression + ":");
        blocks.push("for");
        level += 1;
        continue;
      }
      if ((match = trimmed.match(/^for\s+(.+)\s+then$/))) {
        let parsed;
        try {
          parsed = parseAdderRangeHeader(match[1]);
        } catch (error) {
          fail(error.message);
        }
        let startExpression;
        let endExpression;
        let stepExpression = null;
        try {
          startExpression = translateAdderExpressionToPython(parsed.startText);
          endExpression = translateAdderExpressionToPython(parsed.endText);
          if (parsed.stepText !== null) {
            stepExpression = translateAdderExpressionToPython(parsed.stepText);
          }
        } catch (error) {
          fail(error.message);
        }
        let endPython = endExpression;
        if (!/^[A-Za-z_]\w*$/.test(endPython) && !/^-?\d+(\.\d+)?$/.test(endPython)) {
          endPython = "(" + endPython + ")";
        }
        let rangeText = "range(" + startExpression + ", " + endPython + " + 1)";
        if (stepExpression !== null) {
          rangeText = "range(" + startExpression + ", " + endPython + " + 1, " + stepExpression + ")";
        }
        output.push(indentPython(level) + "for " + parsed.loopName + " in " + rangeText + ":");
        blocks.push("for");
        level += 1;
        continue;
      }
      if ((match = trimmed.match(/^while\s+(.+)\s+then$/))) {
        let condition;
        try {
          condition = translateAdderExpressionToPython(match[1]);
        } catch (error) {
          fail(error.message);
        }
        output.push(indentPython(level) + "while " + condition + ":");
        blocks.push("while");
        level += 1;
        continue;
      }
      if ((match = trimmed.match(/^repeat\s+(.+)\s+times\s+then$/))) {
        let countExpression;
        try {
          countExpression = translateAdderExpressionToPython(match[1]);
        } catch (error) {
          fail(error.message);
        }
        output.push(indentPython(level) + "for _ in range(int(" + countExpression + ")):");
        blocks.push("repeat");
        level += 1;
        continue;
      }
      if (/^end\s+for$/.test(trimmed)) {
        const kind = blocks.pop();
        if (kind !== "for" && kind !== "repeat") {
          fail("\"end for\" without matching loop");
        }
        level -= 1;
        if (level < 0) { level = 0; }
        continue;
      }
      if (/^end\s+while$/.test(trimmed)) {
        if (blocks.pop() !== "while") {
          fail("\"end while\" without matching \"while\"");
        }
        level -= 1;
        if (level < 0) { level = 0; }
        continue;
      }
      if (/^end\s+repeat$/.test(trimmed)) {
        if (blocks.pop() !== "repeat") {
          fail("\"end repeat\" without matching \"repeat\"");
        }
        level -= 1;
        if (level < 0) { level = 0; }
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
        output.push(indentPython(level) + "def " + functionName + "(" + params.join(", ") + "):");
        blocks.push("function");
        level += 1;
        continue;
      }
      if (/^end\s+function$/.test(trimmed)) {
        if (blocks.pop() !== "function") {
          fail("\"end function\" without matching function");
        }
        level -= 1;
        if (level < 0) { level = 0; }
        continue;
      }
      if (/^try\s+then$/.test(trimmed)) {
        output.push(indentPython(level) + "try:");
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
          output.push(indentPython(level) + "except Exception as " + match[1] + ":");
        } else {
          output.push(indentPython(level) + "except Exception:");
        }
        level += 1;
        continue;
      }
      if (/^end\s+try$/.test(trimmed)) {
        if (blocks.pop() !== "try") {
          fail("\"end try\" without matching \"try\"");
        }
        level -= 1;
        if (level < 0) { level = 0; }
        continue;
      }
      if ((match = trimmed.match(/^set\s+([A-Za-z_]\w*(?:\[[^\]]*\]|\.[A-Za-z_]\w*)*)\s+to\s+(.+)$/))) {
        let valueExpression;
        try {
          valueExpression = translateAdderExpressionToPython(match[2]);
        } catch (error) {
          fail(error.message);
        }
        output.push(indentPython(level) + match[1] + " = " + valueExpression);
        continue;
      }
      if ((match = trimmed.match(/^display(?:\s+(.+))?$/))) {
        if (!match[1]) {
          fail("\"display\" needs a value");
        }
        let valueExpression;
        try {
          valueExpression = translateAdderExpressionToPython(match[1]);
        } catch (error) {
          fail(error.message);
        }
        output.push(indentPython(level) + "print(" + valueExpression + ")");
        continue;
      }
      if ((match = trimmed.match(/^add\s+(.+)\s+to\s+(\S+)$/))) {
        let valueExpression;
        try {
          valueExpression = translateAdderExpressionToPython(match[1]);
        } catch (error) {
          fail(error.message);
        }
        output.push(indentPython(level) + match[2] + ".append(" + valueExpression + ")");
        continue;
      }
      if ((match = trimmed.match(/^remove\s+(.+)\s+from\s+(\S+)$/))) {
        let valueExpression;
        try {
          valueExpression = translateAdderExpressionToPython(match[1]);
        } catch (error) {
          fail(error.message);
        }
        output.push(indentPython(level) + match[2] + ".remove(" + valueExpression + ")");
        continue;
      }
      if ((match = trimmed.match(/^throw\s+(.+)$/))) {
        let valueExpression;
        try {
          valueExpression = translateAdderExpressionToPython(match[1]);
        } catch (error) {
          fail(error.message);
        }
        output.push(indentPython(level) + "raise Exception(" + valueExpression + ")");
        continue;
      }
      if ((match = trimmed.match(/^return(?:\s+(.+))?$/))) {
        if (blocks.indexOf("function") < 0) {
          fail("\"return\" outside a function");
        }
        if (match[1]) {
          let valueExpression;
          try {
            valueExpression = translateAdderExpressionToPython(match[1]);
          } catch (error) {
            fail(error.message);
          }
          output.push(indentPython(level) + "return " + valueExpression);
        } else {
          output.push(indentPython(level) + "return");
        }
        continue;
      }
      if (/^(break|continue)$/.test(trimmed)) {
        output.push(indentPython(level) + trimmed);
        continue;
      }
      if ((match = trimmed.match(/^import\s+(.+)\s+from\s+([A-Za-z_]\w*)$/))) {
        const names = match[1].split(/\s+and\s+|,\s*/).map(function (part) { return part.trim(); }).filter(function (part) { return part !== ""; });
        for (const name of names) {
          if (!validName(name)) {
            fail("Bad import name \"" + name + "\"");
          }
        }
        if (names.length === 0) {
          fail("Bad import statement");
        }
        output.push(indentPython(level) + "from " + match[2] + " import " + names.join(", "));
        continue;
      }
      if ((match = trimmed.match(/^import\s+([A-Za-z_]\w*)(?:\s+as\s+([A-Za-z_]\w*))?$/))) {
        if (match[2]) {
          output.push(indentPython(level) + "import " + match[1] + " as " + match[2]);
        } else {
          output.push(indentPython(level) + "import " + match[1]);
        }
        continue;
      }
      if ((match = trimmed.match(/^call\s+([A-Za-z_]\w*)(?:\s+with\s+(.+))?$/))) {
        if (!validName(match[1])) {
          fail("Bad function name \"" + match[1] + "\"");
        }
        let callText = match[1] + "()";
        if (match[2]) {
          const args = splitCallArguments(match[2]);
          const translated = [];
          try {
            for (const arg of args) {
              translated.push(translateAdderExpressionToPython(arg));
            }
          } catch (error) {
            fail(error.message);
          }
          callText = match[1] + "(" + translated.join(", ") + ")";
        }
        output.push(indentPython(level) + callText);
        continue;
      }
      if ((match = trimmed.match(/^ask\s+.+$/)) || (match = trimmed.match(/^ask\s+number\s+.+$/))) {
        let valueExpression;
        try {
          valueExpression = translateAdderExpressionToPython(trimmed);
        } catch (error) {
          fail(error.message);
        }
        output.push(indentPython(level) + valueExpression);
        continue;
      }
      if (/^(if|otherwise|for|while|repeat|define|end|try|catch|set|display|add|remove|throw|return|call|import|break|continue|ask)\b/.test(trimmed)) {
        fail("Unknown statement. Expected set, display, if, for, while, repeat, define function, try, import, call, add, remove, throw, return, break or continue.");
      }
      try {
        const statementExpression = translateAdderExpressionToPython(trimmed);
        output.push(indentPython(level) + statementExpression);
      } catch (error) {
        fail("Unknown statement. Expected set, display, if, for, while, repeat, define function, try, import, call, add, remove, throw, return, break or continue.");
      }
    }
    if (blocks.length > 0) {
      throw new Error("Missing \"" + "end " + blocks[blocks.length - 1] + "\" for an open block");
    }
    void adderState.active;
    return output.join("\n");
  }

  function pythonIndentOf(rawLine) {
    let count = 0;
    for (const ch of rawLine) {
      if (ch === " ") { count += 1; }
      else if (ch === "\t") { count += 4; }
      else { break; }
    }
    return count;
  }

  function numericText(valueText) {
    return /^-?\d+(\.\d+)?$/.test(valueText.trim());
  }

  function toAdder(source) {
    const lines = String(source).split("\n");
    const output = [];
    const blocks = [];
    let adderLevel = 0;
    const adderIndent = function () {
      return "  ".repeat(adderLevel);
    };
    const closeToLevel = function (targetLevel, lineNumber) {
      while (blocks.length > 0 && blocks[blocks.length - 1].indent >= targetLevel) {
        const top = blocks.pop();
        adderLevel -= 1;
        if (adderLevel < 0) { adderLevel = 0; }
        if (top.kind === "if") { output.push(adderIndent() + "end if"); }
        else if (top.kind === "for") { output.push(adderIndent() + "end for"); }
        else if (top.kind === "repeat") { output.push(adderIndent() + "end repeat"); }
        else if (top.kind === "while") { output.push(adderIndent() + "end while"); }
        else if (top.kind === "function") { output.push(adderIndent() + "end function"); }
        else if (top.kind === "try") { output.push(adderIndent() + "end try"); }
        else {
          throw new Error("Line " + lineNumber + ": Cannot close block");
        }
      }
    };
    for (let index = 0; index < lines.length; index++) {
      const lineNumber = index + 1;
      const raw = lines[index];
      const level = pythonIndentOf(raw);
      const trimmed = raw.trim();
      if (trimmed === "") {
        output.push("");
        continue;
      }
      if (trimmed.startsWith("#")) {
        output.push(adderIndent() + trimmed);
        continue;
      }
      const fail = function (message) {
        throw new Error("Line " + lineNumber + ": " + message);
      };
      let match;
      if ((match = trimmed.match(/^if\s+(.+):$/))) {
        closeToLevel(level, lineNumber);
        let condition;
        try {
          condition = translatePythonExpressionToAdder(match[1]);
        } catch (error) {
          fail(error.message);
        }
        output.push(adderIndent() + "if " + condition + " then");
        blocks.push({ kind: "if", indent: level });
        adderLevel += 1;
        continue;
      }
      if ((match = trimmed.match(/^elif\s+(.+):$/))) {
        const top = blocks[blocks.length - 1];
        if (!top || top.kind !== "if" || top.indent !== level) {
          fail("\"elif\" without matching \"if\"");
        }
        let condition;
        try {
          condition = translatePythonExpressionToAdder(match[1]);
        } catch (error) {
          fail(error.message);
        }
        output.push("  ".repeat(adderLevel - 1) + "otherwise if " + condition + " then");
        continue;
      }
      if (/^else\s*:$/.test(trimmed)) {
        const top = blocks[blocks.length - 1];
        if (!top || top.indent !== level) {
          fail("\"else\" without matching block");
        }
        output.push("  ".repeat(adderLevel - 1) + "otherwise");
        continue;
      }
      if ((match = trimmed.match(/^for\s+([A-Za-z_]\w*)\s+in\s+(.+):$/))) {
        closeToLevel(level, lineNumber);
        const loopName = match[1];
        const iterated = match[2].trim();
        const rangeMatch = iterated.match(/^range\((.*)\)$/);
        if (rangeMatch) {
          const args = splitTopLevelComma(rangeMatch[1]);
          const adderArgs = [];
          try {
            for (const arg of args) {
              adderArgs.push(translatePythonExpressionToAdder(arg));
            }
          } catch (error) {
            fail(error.message);
          }
          if (loopName === "_" && args.length === 1 && /^int\((.*)\)$/.test(args[0].trim())) {
            const inner = args[0].trim().replace(/^int\((.*)\)$/, "$1");
            let innerAdder;
            try {
              innerAdder = translatePythonExpressionToAdder(inner);
            } catch (error) {
              fail(error.message);
            }
            output.push(adderIndent() + "repeat " + innerAdder + " times then");
            blocks.push({ kind: "repeat", indent: level });
            adderLevel += 1;
            continue;
          }
          if (args.length === 1) {
            const only = args[0].trim();
            let upperAdder;
            if (numericText(only)) {
              upperAdder = String(Number(only) - 1);
            } else {
              try {
                upperAdder = translatePythonExpressionToAdder(only + " - 1");
              } catch (error) {
                fail(error.message);
              }
            }
            output.push(adderIndent() + "for " + loopName + " from 0 to " + upperAdder + " then");
            blocks.push({ kind: "for", indent: level });
            adderLevel += 1;
            continue;
          }
          if (args.length === 2 || args.length === 3) {
            let startAdder = adderArgs[0];
            let endRaw = args[1].trim();
            let endAdder;
            const plusOne = endRaw.match(/^(.*)\+\s*1\s*$/);
            if (plusOne) {
              try {
                endAdder = translatePythonExpressionToAdder(plusOne[1]);
              } catch (error) {
                fail(error.message);
              }
            } else if (numericText(endRaw)) {
              endAdder = String(Number(endRaw) - 1);
            } else {
              try {
                endAdder = translatePythonExpressionToAdder(endRaw + " - 1");
              } catch (error) {
                fail(error.message);
              }
            }
            let stepAdder = "";
            if (args.length === 3) {
              stepAdder = " step " + adderArgs[2];
            }
            output.push(adderIndent() + "for " + loopName + " from " + startAdder + " to " + endAdder + stepAdder + " then");
            blocks.push({ kind: "for", indent: level });
            adderLevel += 1;
            continue;
          }
          fail("Unsupported range loop");
        }
        let listAdder;
        try {
          listAdder = translatePythonExpressionToAdder(iterated);
        } catch (error) {
          fail(error.message);
        }
        output.push(adderIndent() + "for each " + loopName + " in " + listAdder + " then");
        blocks.push({ kind: "for", indent: level });
        adderLevel += 1;
        continue;
      }
      if ((match = trimmed.match(/^while\s+(.+):$/))) {
        closeToLevel(level, lineNumber);
        let condition;
        try {
          condition = translatePythonExpressionToAdder(match[1]);
        } catch (error) {
          fail(error.message);
        }
        output.push(adderIndent() + "while " + condition + " then");
        blocks.push({ kind: "while", indent: level });
        adderLevel += 1;
        continue;
      }
      if ((match = trimmed.match(/^def\s+([A-Za-z_]\w*)\s*\((.*)\)\s*:$/))) {
        closeToLevel(level, lineNumber);
        const functionName = match[1];
        const rawParams = match[2].trim();
        let params = [];
        if (rawParams !== "") {
          params = splitTopLevelComma(rawParams).map(function (part) { return part.trim(); });
          for (const name of params) {
            if (!validName(name)) {
              fail("Unsupported parameter \"" + name + "\"");
            }
          }
        }
        let header = "define function " + functionName + " then";
        if (params.length > 0) {
          header = "define function " + functionName + " with " + params.join(" and ") + " then";
        }
        output.push(adderIndent() + header);
        blocks.push({ kind: "function", indent: level });
        adderLevel += 1;
        continue;
      }
      if ((match = trimmed.match(/^return(?:\s+(.+))?$/))) {
        closeToLevel(level, lineNumber);
        if (match[1]) {
          let valueAdder;
          try {
            valueAdder = translatePythonExpressionToAdder(match[1]);
          } catch (error) {
            fail(error.message);
          }
          output.push(adderIndent() + "return " + valueAdder);
        } else {
          output.push(adderIndent() + "return");
        }
        continue;
      }
      if (/^try\s*:$/.test(trimmed)) {
        closeToLevel(level, lineNumber);
        output.push(adderIndent() + "try then");
        blocks.push({ kind: "try", indent: level });
        adderLevel += 1;
        continue;
      }
      if ((match = trimmed.match(/^except(?:\s+([A-Za-z_][\w.]*))?(?:\s+as\s+([A-Za-z_]\w*))?\s*:$/))) {
        const top = blocks[blocks.length - 1];
        if (!top || top.kind !== "try" || top.indent !== level) {
          fail("\"except\" without matching \"try\"");
        }
        if (match[2]) {
          output.push("  ".repeat(adderLevel - 1) + "catch " + match[2] + " then");
        } else {
          output.push("  ".repeat(adderLevel - 1) + "catch then");
        }
        continue;
      }
      if ((match = trimmed.match(/^raise\s+Exception\s*\((.*)\)$/)) || (match = trimmed.match(/^raise\s+(.+)$/))) {
        closeToLevel(level, lineNumber);
        let valueAdder;
        try {
          valueAdder = translatePythonExpressionToAdder(match[1]);
        } catch (error) {
          fail(error.message);
        }
        output.push(adderIndent() + "throw " + valueAdder);
        continue;
      }
      if (/^(break|continue)$/.test(trimmed)) {
        closeToLevel(level, lineNumber);
        output.push(adderIndent() + trimmed);
        continue;
      }
      if ((match = trimmed.match(/^from\s+([A-Za-z_]\w*)\s+import\s+(.+)$/))) {
        closeToLevel(level, lineNumber);
        const names = splitTopLevelComma(match[2]).map(function (part) { return part.trim(); });
        output.push(adderIndent() + "import " + names.join(" and ") + " from " + match[1]);
        continue;
      }
      if ((match = trimmed.match(/^import\s+([A-Za-z_]\w*)(?:\s+as\s+([A-Za-z_]\w*))?$/))) {
        closeToLevel(level, lineNumber);
        output.push(adderIndent() + trimmed);
        continue;
      }
      if ((match = trimmed.match(/^print\s*\((.*)\)$/))) {
        closeToLevel(level, lineNumber);
        const inner = match[1].trim();
        if (inner === "") {
          output.push(adderIndent() + "display \"\"");
          continue;
        }
        const args = splitTopLevelComma(inner);
        const adderArgs = [];
        try {
          for (const arg of args) {
            adderArgs.push(translatePythonExpressionToAdder(arg));
          }
        } catch (error) {
          fail(error.message);
        }
        output.push(adderIndent() + "display " + adderArgs.join(", "));
        continue;
      }
      if ((match = trimmed.match(/^([A-Za-z_][\w.\[\]\"']*)\.append\((.*)\)$/))) {
        closeToLevel(level, lineNumber);
        let valueAdder;
        try {
          valueAdder = translatePythonExpressionToAdder(match[2]);
        } catch (error) {
          fail(error.message);
        }
        output.push(adderIndent() + "add " + valueAdder + " to " + match[1]);
        continue;
      }
      if ((match = trimmed.match(/^([A-Za-z_][\w.\[\]\"']*)\.remove\((.*)\)$/))) {
        closeToLevel(level, lineNumber);
        let valueAdder;
        try {
          valueAdder = translatePythonExpressionToAdder(match[2]);
        } catch (error) {
          fail(error.message);
        }
        output.push(adderIndent() + "remove " + valueAdder + " from " + match[1]);
        continue;
      }
      if ((match = trimmed.match(/^([A-Za-z_]\w*(?:\[[^\]]*\]|\.[A-Za-z_]\w*)*)\s*=\s*(.+)$/))) {
        if (match[2].trim().startsWith("=")) {
          fail("Unsupported statement \"" + trimmed + "\"");
        }
        closeToLevel(level, lineNumber);
        let valueAdder;
        try {
          valueAdder = translatePythonExpressionToAdder(match[2]);
        } catch (error) {
          fail(error.message);
        }
        output.push(adderIndent() + "set " + match[1] + " to " + valueAdder);
        continue;
      }
      if ((match = trimmed.match(/^([A-Za-z_]\w*)\s*\((.*)\)$/))) {
        closeToLevel(level, lineNumber);
        const functionName = match[1];
        const rawArgs = match[2].trim();
        if (rawArgs === "") {
          output.push(adderIndent() + "call " + functionName);
          continue;
        }
        const args = splitTopLevelComma(rawArgs);
        const adderArgs = [];
        try {
          for (const arg of args) {
            adderArgs.push(translatePythonExpressionToAdder(arg));
          }
        } catch (error) {
          fail(error.message);
        }
        output.push(adderIndent() + "call " + functionName + " with " + adderArgs.join(" and "));
        continue;
      }
      fail("Unsupported Python feature \"" + trimmed + "\"");
    }
    while (blocks.length > 0) {
      const top = blocks.pop();
      adderLevel -= 1;
      if (adderLevel < 0) { adderLevel = 0; }
      if (top.kind === "if") { output.push(adderIndent() + "end if"); }
      else if (top.kind === "for") { output.push(adderIndent() + "end for"); }
      else if (top.kind === "repeat") { output.push(adderIndent() + "end repeat"); }
      else if (top.kind === "while") { output.push(adderIndent() + "end while"); }
      else if (top.kind === "function") { output.push(adderIndent() + "end function"); }
      else if (top.kind === "try") { output.push(adderIndent() + "end try"); }
    }
    return output.join("\n");
  }

  return {
    toPython: toPython,
    toAdder: toAdder,
    translateAdderExpressionToPython: translateAdderExpressionToPython,
    translatePythonExpressionToAdder: translatePythonExpressionToAdder
  };
})();

if (typeof window !== "undefined") {
  window.Adder = Adder;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = Adder;
}
