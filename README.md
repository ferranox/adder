# Adder

Adder is a small English-like language that reads like plain sentences and converts directly to Python.

Live site: https://random-life.ferranox.xyz/

## Conversions

| Adder | Python |
|---|---|
| `set x to 5` | `x = 5` |
| `display x, y` | `print(x, y)` |
| `set name to ask "Your name?"` | `name = input("Your name?")` |
| `set age to ask number "Age?"` | `age = float(input("Age?"))` |
| `true`, `false`, `empty` | `True`, `False`, `None` |
| `and`, `or`, `not` | `and`, `or`, `not` |
| `x is 1` | `x == 1` |
| `x is not 1` | `x != 1` |
| `x is equal to 1` | `x == 1` |
| `x is not equal to 1` | `x != 1` |
| `x is greater than 1` | `x > 1` |
| `x is less than 1` | `x < 1` |
| `x is at least 1` | `x >= 1` |
| `x is at most 1` | `x <= 1` |
| `x is in items` | `x in items` |
| `x is not in items` | `x not in items` |
| `x to the power of 2` | `x ** 2` |
| `length of items` | `len(items)` |
| `type of x` | `type(x)` |
| `string of x` | `str(x)` |
| `number of x` | `float(x)` |
| `keys of person` | `list(person.keys())` |
| `values of person` | `list(person.values())` |
| `lowercase name` | `name.lower()` |
| `uppercase name` | `name.upper()` |
| `add "cherry" to fruits` | `fruits.append("cherry")` |
| `remove "banana" from fruits` | `fruits.remove("banana")` |
| `join words with ", "` | `(", ").join(words)` |
| `split text by ","` | `text.split(",")` |
| `split text` | `text.split()` |
| `if x is greater than 5 then` ... `otherwise if x is 5 then` ... `otherwise` ... `end if` | `if x > 5:` ... `elif x == 5:` ... `else:` |
| `for each fruit in fruits then` ... `end for` | `for fruit in fruits:` |
| `for i from 1 to 5 then` ... `end for` | `for i in range(1, 5 + 1):` |
| `for i from 1 to 10 step 2 then` ... `end for` | `for i in range(1, 10 + 1, 2):` |
| `while x is less than 10 then` ... `end while` | `while x < 10:` |
| `repeat 3 times then` ... `end repeat` | `for _ in range(int(3)):` |
| `break`, `continue` | `break`, `continue` |
| `define function greet with name then` ... `return message` ... `end function` | `def greet(name):` ... `return message` |
| `call greet with "Ada"` | `greet("Ada")` |
| `call greet` | `greet()` |
| `try then` ... `catch problem then` ... `end try` | `try:` ... `except Exception as problem:` |
| `catch then` | `except Exception:` |
| `throw "oops"` | `raise Exception("oops")` |
| `import math` | `import math` |
| `import math as m` | `import math as m` |
| `import greet from helpers` | `from helpers import greet` |
| `# note` | `# note` |
