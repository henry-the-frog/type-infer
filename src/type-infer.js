// type-infer.js — Hindley-Milner type inference (Algorithm W)
//
// Infers types for a simple functional language without type annotations.
// Supports: integers, booleans, lambdas, application, let-polymorphism, if-then-else.
//
// Algorithm W:
// 1. Walk the AST, generating fresh type variables and constraints
// 2. Unify constraints (Robinson's algorithm)
// 3. Apply substitution to get final types

// ===== Types =====
let nextTypeVar = 0;

export class TVar {
  constructor(name) { this.kind = 'var'; this.name = name ?? `t${nextTypeVar++}`; }
  toString() { return this.name; }
}

export class TCon {
  constructor(name) { this.kind = 'con'; this.name = name; }
  toString() { return this.name; }
}

export class TFun {
  constructor(from, to) { this.kind = 'fun'; this.from = from; this.to = to; }
  toString() { return `(${this.from} -> ${this.to})`; }
}

export const TInt = new TCon('Int');
export const TBool = new TCon('Bool');
export const TString = new TCon('String');

export function freshVar() { return new TVar(); }
export function resetVars() { nextTypeVar = 0; }

// ===== AST =====
export class Num { constructor(value) { this.kind = 'num'; this.value = value; } }
export class Bool { constructor(value) { this.kind = 'bool'; this.value = value; } }
export class Str { constructor(value) { this.kind = 'str'; this.value = value; } }
export class Var { constructor(name) { this.kind = 'var'; this.name = name; } }
export class Lam { constructor(param, body) { this.kind = 'lam'; this.param = param; this.body = body; } }
export class App { constructor(fn, arg) { this.kind = 'app'; this.fn = fn; this.arg = arg; } }
export class Let { constructor(name, value, body) { this.kind = 'let'; this.name = name; this.value = value; this.body = body; } }
export class If { constructor(cond, then, else_) { this.kind = 'if'; this.cond = cond; this.then = then; this.else_ = else_; } }
export class BinOp { constructor(op, left, right) { this.kind = 'binop'; this.op = op; this.left = left; this.right = right; } }

// ===== Substitution =====
class Subst {
  constructor(map = new Map()) { this.map = map; }

  apply(type) {
    if (type.kind === 'var') {
      const t = this.map.get(type.name);
      return t ? this.apply(t) : type;
    }
    if (type.kind === 'fun') {
      return new TFun(this.apply(type.from), this.apply(type.to));
    }
    return type; // TCon
  }

  compose(other) {
    // Apply this substitution to all values in other, then merge
    const newMap = new Map();
    for (const [k, v] of other.map) {
      newMap.set(k, this.apply(v));
    }
    for (const [k, v] of this.map) {
      if (!newMap.has(k)) newMap.set(k, v);
    }
    return new Subst(newMap);
  }

  static empty() { return new Subst(); }
}

// ===== Unification =====
function occursIn(varName, type) {
  if (type.kind === 'var') return type.name === varName;
  if (type.kind === 'fun') return occursIn(varName, type.from) || occursIn(varName, type.to);
  return false;
}

export function unify(t1, t2) {
  t1 = resolve(t1);
  t2 = resolve(t2);

  if (t1.kind === 'con' && t2.kind === 'con' && t1.name === t2.name) {
    return Subst.empty();
  }

  if (t1.kind === 'var') {
    if (t1.name === t2.name) return Subst.empty();
    if (occursIn(t1.name, t2)) throw new TypeError(`Infinite type: ${t1} occurs in ${t2}`);
    return new Subst(new Map([[t1.name, t2]]));
  }

  if (t2.kind === 'var') {
    return unify(t2, t1);
  }

  if (t1.kind === 'fun' && t2.kind === 'fun') {
    const s1 = unify(t1.from, t2.from);
    const s2 = unify(s1.apply(t1.to), s1.apply(t2.to));
    return s2.compose(s1);
  }

  throw new TypeError(`Cannot unify ${t1} with ${t2}`);
}

function resolve(t) { return t; } // Types are already resolved structurally

// ===== Type Environment =====
class TypeEnv {
  constructor(bindings = new Map()) { this.bindings = bindings; }

  extend(name, scheme) {
    const newBindings = new Map(this.bindings);
    newBindings.set(name, scheme);
    return new TypeEnv(newBindings);
  }

  lookup(name) {
    return this.bindings.get(name);
  }

  applySubst(subst) {
    const newBindings = new Map();
    for (const [k, v] of this.bindings) {
      newBindings.set(k, { ...v, type: subst.apply(v.type), vars: v.vars });
    }
    return new TypeEnv(newBindings);
  }
}

// Type scheme: ∀ vars. type (for let-polymorphism)
function scheme(vars, type) { return { vars, type }; }
function mono(type) { return scheme([], type); }

function freeVars(type) {
  if (type.kind === 'var') return new Set([type.name]);
  if (type.kind === 'fun') return new Set([...freeVars(type.from), ...freeVars(type.to)]);
  return new Set();
}

function freeVarsEnv(env) {
  const vars = new Set();
  for (const [, s] of env.bindings) {
    for (const v of freeVars(s.type)) {
      if (!s.vars.includes(v)) vars.add(v);
    }
  }
  return vars;
}

function generalize(env, type) {
  const envVars = freeVarsEnv(env);
  const typeVars = freeVars(type);
  const quantified = [...typeVars].filter(v => !envVars.has(v));
  return scheme(quantified, type);
}

function instantiate(s) {
  const subst = new Subst();
  for (const v of s.vars) {
    subst.map.set(v, freshVar());
  }
  return subst.apply(s.type);
}

// ===== Inference (Algorithm W) =====
export function infer(expr, env = defaultEnv()) {
  resetVars();
  const [subst, type] = algorithmW(expr, env);
  return subst.apply(type);
}

function algorithmW(expr, env) {
  switch (expr.kind) {
    case 'num':
      return [Subst.empty(), TInt];

    case 'bool':
      return [Subst.empty(), TBool];

    case 'str':
      return [Subst.empty(), TString];

    case 'var': {
      const s = env.lookup(expr.name);
      if (!s) throw new TypeError(`Unbound variable: ${expr.name}`);
      return [Subst.empty(), instantiate(s)];
    }

    case 'lam': {
      const paramType = freshVar();
      const newEnv = env.extend(expr.param, mono(paramType));
      const [s1, bodyType] = algorithmW(expr.body, newEnv);
      return [s1, new TFun(s1.apply(paramType), bodyType)];
    }

    case 'app': {
      const resultType = freshVar();
      const [s1, fnType] = algorithmW(expr.fn, env);
      const [s2, argType] = algorithmW(expr.arg, s1.compose(Subst.empty()).apply ? env.applySubst(s1) : env);
      const s3 = unify(s1.apply(fnType), new TFun(argType, resultType));
      return [s3.compose(s2).compose(s1), s3.apply(resultType)];
    }

    case 'let': {
      const [s1, valueType] = algorithmW(expr.value, env);
      const generalizedType = generalize(env.applySubst(s1), s1.apply(valueType));
      const newEnv = env.applySubst(s1).extend(expr.name, generalizedType);
      const [s2, bodyType] = algorithmW(expr.body, newEnv);
      return [s2.compose(s1), bodyType];
    }

    case 'if': {
      const [s1, condType] = algorithmW(expr.cond, env);
      const s1b = unify(condType, TBool);
      const env1 = env.applySubst(s1b.compose(s1));
      const [s2, thenType] = algorithmW(expr.then, env1);
      const [s3, elseType] = algorithmW(expr.else_, env1.applySubst(s2));
      const s4 = unify(s2.apply(thenType), elseType);
      return [s4.compose(s3).compose(s2).compose(s1b).compose(s1), s4.apply(elseType)];
    }

    case 'binop': {
      const [s1, leftType] = algorithmW(expr.left, env);
      const [s2, rightType] = algorithmW(expr.right, env.applySubst(s1));

      if (['+', '-', '*', '/'].includes(expr.op)) {
        const s3 = unify(s1.apply(leftType), TInt);
        const s4 = unify(s2.apply(rightType), TInt);
        return [s4.compose(s3).compose(s2).compose(s1), TInt];
      }

      if (['==', '!=', '<', '>', '<=', '>='].includes(expr.op)) {
        const s3 = unify(s1.apply(leftType), s2.apply(rightType));
        return [s3.compose(s2).compose(s1), TBool];
      }

      if (['&&', '||'].includes(expr.op)) {
        const s3 = unify(s1.apply(leftType), TBool);
        const s4 = unify(s2.apply(rightType), TBool);
        return [s4.compose(s3).compose(s2).compose(s1), TBool];
      }

      throw new TypeError(`Unknown operator: ${expr.op}`);
    }

    default:
      throw new TypeError(`Unknown expression: ${expr.kind}`);
  }
}

function defaultEnv() {
  return new TypeEnv();
}
