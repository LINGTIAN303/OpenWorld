/**
 * modules/runtime/formula.ts — 轻量公式引擎
 *
 * 支持：
 *   - 四则运算: + - * / %
 *   - 比较: == != < > <= >=
 *   - 逻辑: && || !
 *   - 字段引用: {field_name} 或直接用字母标识符
 *   - 聚合: SUM(field), COUNT(field), AVG(field), MIN(field), MAX(field)
 *   - 括号分组
 *
 * 纯函数，无 eval，沙箱安全。
 */

type FieldValues = Record<string, unknown>

/** 分词 */
type Token =
  | { type: 'num'; value: number }
  | { type: 'str'; value: string }
  | { type: 'ident'; value: string }
  | { type: 'field'; value: string }   // {field_name}
  | { type: 'op'; value: string }
  | { type: 'paren'; value: '(' | ')' }
  | { type: 'comma'; value: ',' }
  | { type: 'func'; value: string }    // 函数名
  | { type: 'eof'; value?: undefined }

function tokenize(expr: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < expr.length) {
    const ch = expr[i]
    if (ch === ' ' || ch === '\t' || ch === '\n') { i++; continue }
    if (ch === '{') {
      const end = expr.indexOf('}', i)
      if (end < 0) throw new Error('\u672a\u5173\u95ed\u7684 {')
      tokens.push({ type: 'field', value: expr.slice(i + 1, end).trim() })
      i = end + 1
      continue
    }
    if ('0123456789.'.includes(ch)) {
      let num = ''
      while (i < expr.length && '0123456789.'.includes(expr[i])) { num += expr[i]; i++ }
      tokens.push({ type: 'num', value: parseFloat(num) })
      continue
    }
    if (ch === '"' || ch === "'") {
      const quote = ch; i++
      let str = ''
      while (i < expr.length && expr[i] !== quote) { str += expr[i]; i++ }
      if (i < expr.length) i++ // skip closing quote
      tokens.push({ type: 'str', value: str })
      continue
    }
    if ('+-*/%&|!='.includes(ch)) {
      let op = ch; i++
      if (i < expr.length && '=&\u007C'.includes(expr[i]) && (ch === expr[i] || (ch === '!' && expr[i] === '=') || (ch === '=' && expr[i] === '=') || (ch === '>' && expr[i] === '=') || (ch === '<' && expr[i] === '='))) {
        op += expr[i]; i++
      }
      tokens.push({ type: 'op', value: op })
      continue
    }
    if (ch === '(' || ch === ')') { tokens.push({ type: 'paren', value: ch }); i++; continue }
    if (ch === ',') { tokens.push({ type: 'comma', value: ',' }); i++; continue }
    // identifier (field name without braces, or function name)
    if (/[a-zA-Z_]/.test(ch)) {
      let id = ''
      while (i < expr.length && /[a-zA-Z0-9_.]/.test(expr[i])) { id += expr[i]; i++ }
      tokens.push({ type: 'ident', value: id })
      continue
    }
    throw new Error(`\u65e0\u6cd5\u8bc6\u522b\u7684\u5b57\u7b26: '${ch}'`)
  }
  tokens.push({ type: 'eof' })
  return tokens
}

/** 递归下降解析器 -> 求值 */
class Parser {
  private pos = 0
  private tokens: Token[]
  private fields: FieldValues
  private allEntities?: FieldValues[]

  constructor(tokens: Token[], fields: FieldValues, allEntities?: FieldValues[]) {
    this.tokens = tokens
    this.fields = fields
    this.allEntities = allEntities
  }

  private peek(): Token { return this.tokens[this.pos] || { type: 'eof' } }
  private consume(): Token { return this.tokens[this.pos++] || { type: 'eof' } }

  private expect(type: string, value?: string): Token {
    const t = this.consume()
    if (t.type !== type || (value !== undefined && t.value !== value)) {
      throw new Error(`\u671f\u671b ${type}(${value ?? '*'})\uff0c\u5b9e\u9645\u5f97\u5230 ${t.type}(${t.value})`)
    }
    return t
  }

  private getFieldValue(name: string): unknown {
    if (name in this.fields) return this.fields[name]
    // Try case-insensitive
    const lower = name.toLowerCase()
    for (const [k, v] of Object.entries(this.fields)) {
      if (k.toLowerCase() === lower) return v
    }
    return null
  }

  parse(): unknown { return this.orExpr() }

  private orExpr(): unknown {
    let left = this.andExpr()
    while (this.peek().type === 'op' && this.peek().value === '\u007C\u007C') {
      this.consume()
      const right = this.andExpr()
      left = Boolean(left) || Boolean(right)
    }
    return left
  }

  private andExpr(): unknown {
    let left = this.eqExpr()
    while (this.peek().type === 'op' && this.peek().value === '&&') {
      this.consume()
      const right = this.eqExpr()
      left = Boolean(left) && Boolean(right)
    }
    return left
  }

  private eqExpr(): unknown {
    let left = this.compExpr()
    while (this.peek().type === 'op' && ['==', '!=', '===', '!=='].includes(this.peek().value as string)) {
      const op = this.consume().value
      const right = this.compExpr()
      if (op === '==' || op === '===') left = left == right // eslint-disable-line eqeqeq
      else left = left != right
    }
    return left
  }

  private compExpr(): unknown {
    let left = this.addExpr()
    while (this.peek().type === 'op' && ['<', '>', '<=', '>='].includes(this.peek().value as string)) {
      const op = this.consume().value
      const right = this.addExpr()
      const l = Number(left); const r = Number(right)
      if (op === '<') left = l < r
      else if (op === '>') left = l > r
      else if (op === '<=') left = l <= r
      else if (op === '>=') left = l >= r
    }
    return left
  }

  private addExpr(): unknown {
    let left = this.mulExpr()
    while (this.peek().type === 'op' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.consume().value
      const right = this.mulExpr()
      if (op === '+') {
        // String concat if either is string
        if (typeof left === 'string' || typeof right === 'string') {
          left = String(left) + String(right)
        } else {
          left = Number(left) + Number(right)
        }
      } else {
        left = Number(left) - Number(right)
      }
    }
    return left
  }

  private mulExpr(): unknown {
    let left = this.unary()
    while (this.peek().type === 'op' && ['*', '/', '%'].includes(this.peek().value as string)) {
      const op = this.consume().value
      const right = this.unary()
      const l = Number(left); const r = Number(right)
      if (op === '*') left = l * r
      else if (op === '/') left = r !== 0 ? l / r : Infinity
      else left = l % r
    }
    return left
  }

  private unary(): unknown {
    if (this.peek().type === 'op' && this.peek().value === '!') {
      this.consume()
      return !this.primary()
    }
    if (this.peek().type === 'op' && this.peek().value === '-') {
      this.consume()
      return -Number(this.primary())
    }
    return this.primary()
  }

  private primary(): unknown {
    const t = this.peek()
    if (t.type === 'num') { this.consume(); return t.value }
    if (t.type === 'str') { this.consume(); return t.value }
    if (t.type === 'field') { this.consume(); return this.getFieldValue(t.value) }
    if (t.type === 'ident') {
      this.consume()
      // Function call?
      if (this.peek().type === 'paren' && this.peek().value === '(') {
        return this.callFunc(t.value)
      }
      // Field reference by name
      return this.getFieldValue(t.value)
    }
    if (t.type === 'paren' && t.value === '(') {
      this.consume()
      const val = this.orExpr()
      this.expect('paren', ')')
      return val
    }
    throw new Error(`\u610f\u5916\u7684\u8bcd\u6cd5\u5355\u5143: ${t.type}(${t.value})`)
  }

  private callFunc(name: string): unknown {
    this.expect('paren', '(')
    const args: unknown[] = []
    if (this.peek().type !== 'paren' || this.peek().value !== ')') {
      args.push(this.orExpr())
      while (this.peek().type === 'comma') {
        this.consume()
        args.push(this.orExpr())
      }
    }
    this.expect('paren', ')')

    const lower = name.toLowerCase()
    if (['sum', 'count', 'avg', 'min', 'max'].includes(lower)) {
      // Aggregate: first arg is field name
      const fieldName = String(args[0] ?? '')
      if (!this.allEntities) return null
      const values = this.allEntities.map(e => Number(e[fieldName] ?? 0)).filter(v => !isNaN(v))
      if (lower === 'sum') return values.reduce((a, b) => a + b, 0)
      if (lower === 'count') return values.length
      if (lower === 'avg') return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
      if (lower === 'min') return values.length ? Math.min(...values) : 0
      if (lower === 'max') return values.length ? Math.max(...values) : 0
    }

    if (lower === 'if') {
      const cond = Boolean(args[0])
      return cond ? args[1] : args[2]
    }

    return null
  }
}

/**
 * \u8ba1\u7b97\u516c\u5f0f\u8868\u8fbe\u5f0f
 * @param expr \u516c\u5f0f\u5b57\u7b26\u4e32\uff0c\u5982 "{price} * {quantity}"
 * @param fields \u5f53\u524d\u5b9e\u4f53\u7684\u5b57\u6bb5\u503c
 * @param allEntities \u53ef\u9009\uff0c\u540c\u7c7b\u578b\u6240\u6709\u5b9e\u4f53\uff08\u7528\u4e8e\u805a\u5408\uff09
 */
export function evaluateFormula(
  expr: string,
  fields: FieldValues,
  allEntities?: FieldValues[],
): unknown {
  try {
    const tokens = tokenize(expr)
    const parser = new Parser(tokens, fields, allEntities)
    return parser.parse()
  } catch (e: any) {
    return `\u516c\u5f0f\u9519\u8bef: ${e.message}`
  }
}

/**
 * \u63d0\u53d6\u516c\u5f0f\u4e2d\u5f15\u7528\u7684\u6240\u6709\u5b57\u6bb5\u540d
 */
export function extractFieldRefs(expr: string): string[] {
  const refs: string[] = []
  try {
    const tokens = tokenize(expr)
    for (const t of tokens) {
      if (t.type === 'field' || t.type === 'ident') {
        if (!['SUM', 'COUNT', 'AVG', 'MIN', 'MAX', 'IF', 'sum', 'count', 'avg', 'min', 'max', 'if'].includes(t.value)) {
          refs.push(t.value)
        }
      }
    }
  } catch { /* ignore parse errors */ }
  return [...new Set(refs)]
}
