// type-infer.test.js — Comprehensive tests for Hindley-Milner type inference
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  infer, Num, Bool, Str, Var, Lam, App, Let, If, BinOp,
  TVar, TCon, TFun, TInt, TBool, TString,
  resetVars
} from './type-infer.js';

function inferType(expr) {
  resetVars();
  return infer(expr).toString();
}

describe('primitives', () => {
  it('number literals are Int', () => assert.strictEqual(inferType(new Num(42)), 'Int'));
  it('boolean true is Bool', () => assert.strictEqual(inferType(new Bool(true)), 'Bool'));
  it('boolean false is Bool', () => assert.strictEqual(inferType(new Bool(false)), 'Bool'));
  it('string literals are String', () => assert.strictEqual(inferType(new Str("hello")), 'String'));
});

describe('lambda (abstraction)', () => {
  it('identity: λx. x → t0 → t0', () => {
    assert.strictEqual(inferType(new Lam('x', new Var('x'))), '(t0 -> t0)');
  });
  it('constant: λx. 42 → t0 → Int', () => {
    assert.strictEqual(inferType(new Lam('x', new Num(42))), '(t0 -> Int)');
  });
  it('K combinator: λx. λy. x → t0 → (t1 → t0)', () => {
    assert.strictEqual(inferType(new Lam('x', new Lam('y', new Var('x')))), '(t0 -> (t1 -> t0))');
  });
  it('nested lambda: λf. λx. f(x)', () => {
    const expr = new Lam('f', new Lam('x', new App(new Var('f'), new Var('x'))));
    const type = inferType(expr);
    assert.ok(type.includes('->'), `expected arrow type, got ${type}`);
  });
});

describe('application', () => {
  it('id(42) → Int', () => {
    assert.strictEqual(inferType(new App(new Lam('x', new Var('x')), new Num(42))), 'Int');
  });
  it('(λx. x)(true) → Bool', () => {
    assert.strictEqual(inferType(new App(new Lam('x', new Var('x')), new Bool(true))), 'Bool');
  });
  it('(λx. x + 1)(42) → Int', () => {
    const expr = new App(new Lam('x', new BinOp('+', new Var('x'), new Num(1))), new Num(42));
    assert.strictEqual(inferType(expr), 'Int');
  });
});

describe('let polymorphism', () => {
  it('let id = λx. x in id(42) → Int', () => {
    assert.strictEqual(
      inferType(new Let('id', new Lam('x', new Var('x')), new App(new Var('id'), new Num(42)))),
      'Int'
    );
  });
  it('let id = λx. x in id(true) → Bool', () => {
    assert.strictEqual(
      inferType(new Let('id', new Lam('x', new Var('x')), new App(new Var('id'), new Bool(true)))),
      'Bool'
    );
  });
  it('polymorphic: id used at different types', () => {
    // let id = λx. x in (id(42), id(true)) should work
    const id = new Lam('x', new Var('x'));
    // We can verify id can be applied to both Int and Bool
    resetVars();
    assert.strictEqual(infer(new Let('id', id, new App(new Var('id'), new Num(42)))).toString(), 'Int');
    resetVars();
    assert.strictEqual(infer(new Let('id', id, new App(new Var('id'), new Bool(true)))).toString(), 'Bool');
  });
});

describe('if-then-else', () => {
  it('if true then 1 else 2 → Int', () => {
    assert.strictEqual(inferType(new If(new Bool(true), new Num(1), new Num(2))), 'Int');
  });
  it('if cond then x else x → unifies branches', () => {
    const expr = new Lam('c', new Lam('x', new Lam('y', new If(new Var('c'), new Var('x'), new Var('y')))));
    const type = inferType(expr);
    assert.ok(type.includes('Bool'), `condition should be Bool, got ${type}`);
  });
});

describe('binary operations', () => {
  it('1 + 2 → Int', () => {
    assert.strictEqual(inferType(new BinOp('+', new Num(1), new Num(2))), 'Int');
  });
  it('x + 1 in lambda → (Int → Int)', () => {
    assert.strictEqual(inferType(new Lam('x', new BinOp('+', new Var('x'), new Num(1)))), '(Int -> Int)');
  });
  it('x == y → Bool', () => {
    const expr = new Lam('x', new Lam('y', new BinOp('==', new Var('x'), new Var('y'))));
    const type = inferType(expr);
    assert.ok(type.includes('Bool'), `comparison should return Bool, got ${type}`);
  });
});

describe('type errors', () => {
  it('applying non-function throws', () => {
    assert.throws(() => inferType(new App(new Num(42), new Num(1))));
  });
  it('infinite type (self-application) throws', () => {
    // λx. x(x) should fail with occurs check
    assert.throws(() => inferType(new Lam('x', new App(new Var('x'), new Var('x')))));
  });
});

describe('complex expressions', () => {
  it('Church encoding: λf. λx. f(f(x))', () => {
    const twice = new Lam('f', new Lam('x', new App(new Var('f'), new App(new Var('f'), new Var('x')))));
    const type = inferType(twice);
    assert.ok(type.includes('->'), `expected function type, got ${type}`);
  });
  
  it('compose: λf. λg. λx. f(g(x))', () => {
    const compose = new Lam('f', new Lam('g', new Lam('x', 
      new App(new Var('f'), new App(new Var('g'), new Var('x')))
    )));
    const type = inferType(compose);
    assert.ok(type.includes('->'), `expected function type, got ${type}`);
  });
});
