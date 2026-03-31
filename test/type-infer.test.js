import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  infer, Num, Bool, Str, Var, Lam, App, Let, If, BinOp,
  TInt, TBool, TString, TFun, TVar
} from '../src/index.js';

describe('Literal types', () => {
  it('should infer Int for numbers', () => {
    assert.equal(infer(new Num(42)).toString(), 'Int');
  });
  it('should infer Bool for booleans', () => {
    assert.equal(infer(new Bool(true)).toString(), 'Bool');
  });
  it('should infer String for strings', () => {
    assert.equal(infer(new Str('hello')).toString(), 'String');
  });
});

describe('Lambda types', () => {
  it('should infer identity function type', () => {
    // \x -> x : t0 -> t0
    const type = infer(new Lam('x', new Var('x')));
    assert.equal(type.kind, 'fun');
    assert.equal(type.from.name, type.to.name); // Same type variable
  });
  it('should infer constant function type', () => {
    // \x -> 42 : t0 -> Int
    const type = infer(new Lam('x', new Num(42)));
    assert.equal(type.kind, 'fun');
    assert.equal(type.to.toString(), 'Int');
  });
});

describe('Application', () => {
  it('should infer application of lambda', () => {
    // (\x -> x) 42 : Int
    const type = infer(new App(new Lam('x', new Var('x')), new Num(42)));
    assert.equal(type.toString(), 'Int');
  });
  it('should infer nested application', () => {
    // (\f -> \x -> f x) (\y -> y) 42 : Int
    const expr = new App(
      new App(
        new Lam('f', new Lam('x', new App(new Var('f'), new Var('x')))),
        new Lam('y', new Var('y'))
      ),
      new Num(42)
    );
    assert.equal(infer(expr).toString(), 'Int');
  });
});

describe('Let bindings', () => {
  it('should infer let with simple value', () => {
    // let x = 42 in x : Int
    const type = infer(new Let('x', new Num(42), new Var('x')));
    assert.equal(type.toString(), 'Int');
  });
  it('should infer let-polymorphism', () => {
    // let id = \x -> x in id 42 : Int
    const type = infer(new Let('id', new Lam('x', new Var('x')), new App(new Var('id'), new Num(42))));
    assert.equal(type.toString(), 'Int');
  });
  it('should use polymorphic binding at different types', () => {
    // let id = \x -> x in (id 42, id true)
    // We test: let id = \x -> x in id true : Bool
    const type = infer(new Let('id', new Lam('x', new Var('x')), new App(new Var('id'), new Bool(true))));
    assert.equal(type.toString(), 'Bool');
  });
});

describe('If-then-else', () => {
  it('should infer matching branch types', () => {
    // if true then 1 else 2 : Int
    const type = infer(new If(new Bool(true), new Num(1), new Num(2)));
    assert.equal(type.toString(), 'Int');
  });
  it('should reject mismatched branches', () => {
    // if true then 1 else true → type error
    assert.throws(() => infer(new If(new Bool(true), new Num(1), new Bool(true))));
  });
  it('should reject non-bool condition', () => {
    assert.throws(() => infer(new If(new Num(1), new Num(2), new Num(3))));
  });
});

describe('Binary operations', () => {
  it('should infer arithmetic types', () => {
    assert.equal(infer(new BinOp('+', new Num(1), new Num(2))).toString(), 'Int');
    assert.equal(infer(new BinOp('*', new Num(3), new Num(4))).toString(), 'Int');
  });
  it('should infer comparison types', () => {
    assert.equal(infer(new BinOp('==', new Num(1), new Num(2))).toString(), 'Bool');
    assert.equal(infer(new BinOp('<', new Num(1), new Num(2))).toString(), 'Bool');
  });
  it('should infer logical types', () => {
    assert.equal(infer(new BinOp('&&', new Bool(true), new Bool(false))).toString(), 'Bool');
  });
  it('should reject arithmetic on non-int', () => {
    assert.throws(() => infer(new BinOp('+', new Bool(true), new Num(1))));
  });
});

describe('Error cases', () => {
  it('should reject unbound variables', () => {
    assert.throws(() => infer(new Var('undefined_var')));
  });
  it('should detect infinite types', () => {
    // \x -> x x (self-application) → occurs check failure
    assert.throws(() => infer(new Lam('x', new App(new Var('x'), new Var('x')))));
  });
});

describe('Complex expressions', () => {
  it('should infer compose function type', () => {
    // \f -> \g -> \x -> f (g x)
    const compose = new Lam('f', new Lam('g', new Lam('x',
      new App(new Var('f'), new App(new Var('g'), new Var('x')))
    )));
    const type = infer(compose);
    assert.equal(type.kind, 'fun');
    // Should be (b -> c) -> (a -> b) -> a -> c
  });

  it('should infer factorial-like structure', () => {
    // let f = \n -> if n == 0 then 1 else n * (f (n - 1))
    // Can't do recursion without fix point, but let's test the non-recursive parts
    // \n -> if (n == 0) then 1 else n
    const expr = new Lam('n',
      new If(
        new BinOp('==', new Var('n'), new Num(0)),
        new Num(1),
        new Var('n')
      )
    );
    const type = infer(expr);
    assert.equal(type.kind, 'fun');
    assert.equal(type.from.toString(), 'Int');
    assert.equal(type.to.toString(), 'Int');
  });
});
