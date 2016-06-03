// Copyright 2016 The Noms Authors. All rights reserved.
// Licensed under the Apache License, version 2.0:
// http://www.apache.org/licenses/LICENSE-2.0

/* eslint-disable max-len */
// @flow

import {suite, test} from 'mocha';
import {assert} from 'chai';

import Blob from './blob.js';
import Database from './database.js';
import Hash from './hash.js';
import List, {newListLeafSequence} from './list.js';
import Map from './map.js';
import Ref, {constructRef} from './ref.js';
import Set, {newSetLeafSequence} from './set.js';
import type Value from './value.js';
import type {NomsKind} from './noms-kind.js';
import {Kind} from './noms-kind.js';
import ValueDecoder from './value-decoder.js';
import ValueEncoder from './value-encoder.js';
import {encodeValue, decodeValue} from './codec.js';
import {equals} from './compare.js';
import {invariant} from './assert.js';
import {makeTestingBatchStore} from './batch-store-adaptor.js';
import {newStruct, newStructWithType} from './struct.js';
import {
  MetaTuple,
  newBlobMetaSequence,
  newListMetaSequence,
  newSetMetaSequence,
} from './meta-sequence.js';
import {
  boolType,
  makeListType,
  makeMapType,
  makeRefType,
  makeSetType,
  makeStructType,
  numberType,
  refOfBlobType,
  stringType,
  typeType,
} from './type.js';

function assertRoundTrips(v: Value) {
  const db = new Database(makeTestingBatchStore());
  const c = encodeValue(v, db);
  const out = decodeValue(c, db);
  assert.isTrue(equals(v, out));
}

suite('Encoding - roundtrip', () => {
  test('bools', () => {
    assertRoundTrips(false);
    assertRoundTrips(true);
  });

  test('numbers', () => {
    assertRoundTrips(1);
    assertRoundTrips(-0);
    assertRoundTrips(0);
    assertRoundTrips(-1);
  });

  test('strings', () => {
    assertRoundTrips('');
    assertRoundTrips('foo');
    assertRoundTrips('AINT NO THANG');
    assertRoundTrips('💩');
  });

  test('structs', () => {
    assertRoundTrips(newStruct('', {a: true, b: 'foo', c: 2.3}));
  });

  test('refs', () => {
    assertRoundTrips(new Ref(1));
  });

  test('list leaf', () => {
    assertRoundTrips(List.fromSequence(newListLeafSequence(null, [4, 5, 6, 7])));
  });

  test('compound list', () => {
    const leaf = List.fromSequence(newListLeafSequence(null, [4, 5, 6, 7]));
    const mts = [new MetaTuple(new Ref(leaf), 10, 10, null), new MetaTuple(new Ref(leaf), 20, 20, null)];
    assertRoundTrips(List.fromSequence(newListMetaSequence(null, mts)));
  });
});

suite('Encoding', () => {
  function uint8(v: NomsKind): NomsKind {
    return {type: 'uint8', value: v};
  }

  function uint32(v: NomsKind): NomsKind {
    return {type: 'uint32', value: v};
  }

  function uint64(v: NomsKind): NomsKind {
    return {type: 'uint64', value: v};
  }

  function float64(v: NomsKind): NomsKind {
    return {type: 'float64', value: v};
  }


  class TestReader {
    a: any[];
    i: number;

    constructor(a: any[]) {
      this.a = a;
      this.i = 0;
    }

    atEnd(): boolean {
      return this.i === this.a.length;
    }

    read(): any {
      invariant(!this.atEnd());
      return this.a[this.i++];
    }

    readBytes(): Uint8Array {
      const v = this.read();
      invariant(v instanceof Uint8Array);
      return v;
    }

    readUint8(): number {
      const tagged = this.read();
      invariant(tagged.type === 'uint8');
      return tagged.value;
    }

    readUint32(): number {
      const tagged = this.read();
      invariant(tagged.type === 'uint32');
      return tagged.value;
    }

    readUint64(): number {
      const tagged = this.read();
      invariant(tagged.type === 'uint64');
      return tagged.value;
    }

    readFloat64(): number {
      const tagged = this.read();
      invariant(tagged.type === 'float64');
      return tagged.value;
    }

    readBool(): boolean {
      const v = this.read();
      invariant(typeof v === 'boolean');
      return v;
    }

    readString(): string {
      const v = this.read();
      invariant(typeof v === 'string');
      return v;
    }

    readHash(): Hash {
      return new Hash(this.readString());
    }
  }

  class TestWriter {
    a: any[];
    i: number;

    constructor() {
      this.a = [];
    }

    write(v: any): void {
      this.a.push(v);
    }

    writeBytes(v: Uint8Array): void {
      this.write(v);
    }

    writeUint8(v: number): void {
      this.write(uint8(v));
    }

    writeUint32(v: number): void {
      this.write(uint32(v));
    }

    writeUint64(v: number): void {
      this.write(uint64(v));
    }

    writeFloat64(v: number): void {
      this.write(float64(v));
    }

    writeBool(v:boolean): void {
      this.write(v);
    }

    writeString(v: string): void {
      this.write(v);
    }

    writeHash(h: Hash): void {
      this.writeString(h.toString());
    }

    toArray(): any[] {
      return this.a;
    }
  }

  const BoolKind = Kind.Bool;
  const NumberKind = Kind.Number;
  const StringKind = Kind.String;
  const BlobKind = Kind.Blob;
  const ListKind = Kind.List;
  const MapKind = Kind.Map;
  const RefKind = Kind.Ref;
  const SetKind = Kind.Set;
  const StructKind = Kind.Struct;
  const TypeKind = Kind.Type;
  const CycleKind = Kind.Cycle;
  const UnionKind = Kind.Union;

  function assertEncoding(encoding: any[], v: Value) {
    const w = new TestWriter();
    const enc = new ValueEncoder(w, null);
    enc.writeValue(v);
    assert.deepEqual(encoding, w.toArray());

    const r = new TestReader(encoding);
    const dec = new ValueDecoder(r, null);
    const v2 = dec.readValue();
    assert.isTrue(equals(v, v2));
  }

  test('primitives', () => {
    assertEncoding([uint8(BoolKind), true], true);
    assertEncoding([uint8(BoolKind), false], false);
    assertEncoding([uint8(NumberKind), float64(0)], 0);
    assertEncoding([uint8(NumberKind), float64(1000000000000000000)], 1e18);
    assertEncoding([uint8(NumberKind), float64(10000000000000000000)], 1e19);
    assertEncoding([uint8(NumberKind), float64(1e20)], 1e20);
    assertEncoding([uint8(StringKind), 'hi'], 'hi');
  });

  test('types', () => {
    assertEncoding([uint8(TypeKind), uint8(BoolKind)], boolType);
    assertEncoding([uint8(TypeKind), uint8(TypeKind)], typeType);
    assertEncoding([uint8(TypeKind), uint8(ListKind), uint8(BoolKind)], makeListType(boolType));
    assertEncoding([uint8(TypeKind), uint8(SetKind), uint8(StringKind)], makeSetType(stringType));
    assertEncoding([uint8(TypeKind), uint8(MapKind), uint8(StringKind), uint8(NumberKind)], makeMapType(stringType, numberType));
  });

  test('simple blob', () => {
    assertEncoding([
      uint8(BlobKind), false, new Uint8Array([0, 1]),
    ], new Blob(new Uint8Array([0, 1])));
  });

  test('list', () => {
    assertEncoding([
      uint8(ListKind), uint8(NumberKind), false, uint32(4) /* len */, uint8(NumberKind), float64(0), uint8(NumberKind), float64(1), uint8(NumberKind), float64(2), uint8(NumberKind), float64(3),
    ],
    new List([0, 1, 2, 3]));
  });

  test('list of list', () => {
    assertEncoding([
      uint8(ListKind), uint8(ListKind), uint8(NumberKind), false,
      uint32(2), // len
      uint8(ListKind), uint8(NumberKind), false, uint32(1) /* len */, uint8(NumberKind), float64(0),
      uint8(ListKind), uint8(NumberKind), false, uint32(3) /* len */, uint8(NumberKind), float64(1), uint8(NumberKind), float64(2), uint8(NumberKind), float64(3),
    ],
    new List([new List([0]), new List([1, 2, 3])]));
  });

  test('set', () => {
    assertEncoding([
      uint8(SetKind), uint8(NumberKind), false, uint32(4) /* len */, uint8(NumberKind), float64(0), uint8(NumberKind), float64(1), uint8(NumberKind), float64(2), uint8(NumberKind), float64(3),
    ],
    new Set([3, 1, 2, 0]));
  });

  test('set of set', () => {
    assertEncoding([
      uint8(SetKind), uint8(SetKind), uint8(NumberKind), false,
      uint32(2), // len
      uint8(SetKind), uint8(NumberKind), false, uint32(1) /* len */, uint8(NumberKind), float64(0),
      uint8(SetKind), uint8(NumberKind), false, uint32(3) /* len */, uint8(NumberKind), float64(1), uint8(NumberKind), float64(2), uint8(NumberKind), float64(3),
    ],
    new Set([new Set([0]), new Set([1, 2, 3])]));
  });

  test('map', () => {
    assertEncoding([
      uint8(MapKind), uint8(StringKind), uint8(BoolKind), false, uint32(2) /* len */, uint8(StringKind), 'a', uint8(BoolKind), false, uint8(StringKind), 'b', uint8(BoolKind), true,
    ],
    new Map([['a', false], ['b', true]]));
  });

  test('map of map', () => {
    assertEncoding([
      uint8(MapKind), uint8(MapKind), uint8(StringKind), uint8(NumberKind), uint8(SetKind), uint8(BoolKind), false,
      uint32(1), // len
      uint8(MapKind), uint8(StringKind), uint8(NumberKind), false, uint32(1) /* len */, uint8(StringKind), 'a', uint8(NumberKind), float64(0),
      uint8(SetKind), uint8(BoolKind), false, uint32(1) /* len */, uint8(BoolKind), true,
    ],
    new Map([[new Map([['a', 0]]), new Set([true])]]));
  });

  test('compound blob', () => {
    const r1 = Hash.parse('sha1-0000000000000000000000000000000000000001');
    const r2 = Hash.parse('sha1-0000000000000000000000000000000000000002');
    const r3 = Hash.parse('sha1-0000000000000000000000000000000000000003');

    assertEncoding(
      [
        uint8(BlobKind), true,
        uint32(3), // len
        uint8(RefKind), uint8(BlobKind), r1.toString(), uint64(11), uint8(NumberKind), float64(20), uint64(20),
        uint8(RefKind), uint8(BlobKind), r2.toString(), uint64(22), uint8(NumberKind), float64(40), uint64(40),
        uint8(RefKind), uint8(BlobKind), r3.toString(), uint64(33), uint8(NumberKind), float64(60), uint64(60),
      ],
      Blob.fromSequence(newBlobMetaSequence(null, [
        new MetaTuple(constructRef(refOfBlobType, r1, 11), 20, 20, null),
        new MetaTuple(constructRef(refOfBlobType, r2, 22), 40, 40, null),
        new MetaTuple(constructRef(refOfBlobType, r3, 33), 60, 60, null),
      ]))
    );
  });

  test('empty struct', () => {
    assertEncoding([
      uint8(StructKind), 'S', uint32(0), /* len */
    ],
    newStruct('S', {}));
  });

  test('struct', () => {
    assertEncoding([
      uint8(StructKind), 'S', uint32(2) /* len */, 'b', uint8(BoolKind), 'x', uint8(NumberKind),
      uint8(BoolKind), true, uint8(NumberKind), float64(42),
    ],
    newStruct('S', {x: 42, b: true}));
  });

  test('struct with list', () => {
    // struct S {l: List<String>}({l: ['a', 'b']})
    assertEncoding([
      uint8(StructKind), 'S', uint32(1) /* len */, 'l', uint8(ListKind), uint8(StringKind),
      uint8(ListKind), uint8(StringKind), false, uint32(2) /* len */, uint8(StringKind), 'a', uint8(StringKind), 'b',
    ],
    newStruct('S', {l: new List(['a', 'b'])}));

    // struct S {l: List<>}({l: []})
    assertEncoding([
      uint8(StructKind), 'S', uint32(1) /* len */, 'l', uint8(ListKind), uint8(UnionKind), uint32(0),
      uint8(ListKind), uint8(UnionKind), uint32(0), false, uint32(0), /* len */
    ],
    newStruct('S', {l: new List()}));
  });

  test('struct with struct', () => {
    assertEncoding([
      uint8(StructKind), 'S',
      uint32(1), // len
      's', uint8(StructKind), 'S2', uint32(1) /* len */, 'x', uint8(NumberKind),
      uint8(StructKind), 'S2', uint32(1) /* len */, 'x', uint8(NumberKind),
      uint8(NumberKind), float64(42),
    ],
    newStruct('S', {s: newStruct('S2', {x: 42})}));
  });

  test('struct with blob', () => {
    assertEncoding([
      uint8(StructKind), 'S', uint32(1) /* len */, 'b', uint8(BlobKind), uint8(BlobKind), false, new Uint8Array([0, 1]),
    ],
    newStruct('S', {b: new Blob(new Uint8Array([0, 1]))}));
  });

  test('compound list', () => {
    const list1 = List.fromSequence(newListLeafSequence(null, [0]));
    const list2 = List.fromSequence(newListLeafSequence(null, [1, 2, 3]));

    assertEncoding([
      uint8(ListKind), uint8(NumberKind), true,
      uint32(2), // len,
      uint8(RefKind), uint8(ListKind), uint8(NumberKind), list1.hash.toString(), uint64(1), uint8(NumberKind), float64(1), uint64(1),
      uint8(RefKind), uint8(ListKind), uint8(NumberKind), list2.hash.toString(), uint64(1), uint8(NumberKind), float64(4), uint64(4),
    ],
    List.fromSequence(newListMetaSequence(null, [
      new MetaTuple(new Ref(list1), 1, 1, null),
      new MetaTuple(new Ref(list2), 4, 4, null),
    ]))
    );
  });


  test('compound set', () => {
    const set1 = Set.fromSequence(newSetLeafSequence(null, [0, 1]));
    const set2 = Set.fromSequence(newSetLeafSequence(null, [2, 3, 4]));

    assertEncoding(
      [
        uint8(SetKind), uint8(NumberKind), true,
        uint32(2), // len,
        uint8(RefKind), uint8(SetKind), uint8(NumberKind), set1.hash.toString(), uint64(1), uint8(NumberKind), float64(1), uint64(2),
        uint8(RefKind), uint8(SetKind), uint8(NumberKind), set2.hash.toString(), uint64(1), uint8(NumberKind), float64(4), uint64(3),
      ],
      Set.fromSequence(newSetMetaSequence(null, [
        new MetaTuple(new Ref(set1), 1, 2, null),
        new MetaTuple(new Ref(set2), 4, 3, null),
      ]))
    );
  });

  test('list of union', () => {
    assertEncoding([
      uint8(ListKind), uint8(UnionKind), uint32(3) /* len */, uint8(BoolKind), uint8(StringKind), uint8(NumberKind), false,
      uint32(4) /* len */, uint8(StringKind), '0', uint8(NumberKind), float64(1), uint8(StringKind), '2', uint8(BoolKind), true,
    ],
    new List(['0', 1, '2', true]));
  });

  test('list of struct', () => {
    assertEncoding([
      uint8(ListKind), uint8(StructKind), 'S', uint32(1) /* len */, 'x', uint8(NumberKind), false,
      uint32(1) /* len */, uint8(StructKind), 'S', uint32(1) /* len */, 'x', uint8(NumberKind), uint8(NumberKind), float64(42),
    ],
    new List([newStruct('S', {x: 42})]));
  });

  test('list of union with type', () => {
    const structType = makeStructType('S', {x: numberType});

    assertEncoding([
      uint8(ListKind), uint8(UnionKind), uint32(2) /* len */, uint8(BoolKind), uint8(TypeKind), false,
      uint32(4) /* len */, uint8(BoolKind), true, uint8(TypeKind), uint8(NumberKind), uint8(TypeKind), uint8(TypeKind), uint8(TypeKind), uint8(StructKind), 'S', uint32(1) /* len */, 'x', uint8(NumberKind),
    ],
    new List([true, numberType, typeType, structType]));
  });

  test('ref', () => {
    const type = makeRefType(numberType);
    const r = Hash.parse('sha1-0123456789abcdef0123456789abcdef01234567');

    assertEncoding([
      uint8(RefKind), uint8(NumberKind), r.toString(), uint64(4),
    ],
    constructRef(type, r, 4));
  });

  test('list of types', () => {
    assertEncoding([
      uint8(ListKind), uint8(TypeKind), false, uint32(2) /* len */, uint8(TypeKind), uint8(BoolKind), uint8(TypeKind), uint8(StringKind),
    ],
    new List([boolType, stringType]));
  });

  test('recursive struct', () => {
    const structType = makeStructType('A6', {
      v: numberType,
      cs: numberType, // placeholder
    });
    const listType = makeListType(structType);
    structType.desc.fields['cs'] = listType;

    assertEncoding([
      uint8(StructKind), 'A6', uint32(2) /* len */, 'cs', uint8(ListKind), uint8(CycleKind), uint32(0), 'v', uint8(NumberKind),
      uint8(ListKind), uint8(UnionKind), uint32(0) /* len */, false, uint32(0), /* len */
      uint8(NumberKind), float64(42),
    ],
    // {v: 42, cs: [{v: 555, cs: []}]}
    newStructWithType(structType, {v: 42, cs: new List()}));
  });

  test('union list', () => {
    assertEncoding([
      uint8(ListKind), uint8(UnionKind), uint32(2) /* len */, uint8(StringKind), uint8(NumberKind),
      false, uint32(2) /* len */, uint8(StringKind), 'hi', uint8(NumberKind), float64(42),
    ],
    new List(['hi', 42]));
  });

  test('empty union list', () => {
    assertEncoding([
      uint8(ListKind), uint8(UnionKind), uint32(0) /* len */, false, uint32(0), /* len */
    ],
    new List());
  });
});