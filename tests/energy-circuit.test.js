import assert from "node:assert/strict";
import test from "node:test";
import { createEnergyCircuit } from "../src/energy-circuit.js";

function turnTo(circuit, index, ports) {
  for (let turn = 0; turn < 4; turn++) {
    if (circuit.snapshot().tiles[index].ports === ports) return;
    assert.equal(circuit.rotate(index), true);
  }
  assert.equal(circuit.snapshot().tiles[index].ports, ports);
}

function solve(circuit) {
  const original = circuit.snapshot();
  // Generated boards retain the orientation of their guaranteed route.
  // Restore the source last to keep the circuit active during setup.
  for (const index of [0, 1, 2, 4, 5, 6, 7, 8, 3]) {
    turnTo(circuit, index, original.tiles[index].basePorts);
  }
}

test("all generated boards start disconnected and can be solved", () => {
  let seed = 17;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const routes = new Set();
  for (let board = 0; board < 300; board++) {
    const circuit = createEnergyCircuit({ random });
    const initial = circuit.snapshot();
    assert.equal(initial.status, "active");
    assert.equal(initial.sourcePowered, false);
    assert.equal(initial.tiles.some((tile) => tile.powered), false);
    routes.add(initial.tiles.map((tile) => tile.basePorts).join(","));
    solve(circuit);
    const completed = circuit.snapshot();
    assert.equal(completed.status, "success");
    assert.equal(completed.tiles[5].powered, true);
    assert.ok(completed.tiles[5].ports & 2);
    assert.equal(completed.heat, 0.15);
    assert.deepEqual(circuit.advance(30), completed);
    assert.equal(circuit.rotate(3), false);
  }
  assert.ok(routes.size > 5);
});

test("electricity requires matching ports on both neighboring tiles", () => {
  const circuit = createEnergyCircuit({ random: () => 0 });
  turnTo(circuit, 3, 9); // source connects west and north
  turnTo(circuit, 0, 3); // north/east cannot accept electricity from below
  assert.equal(circuit.snapshot().tiles[3].powered, true);
  assert.equal(circuit.snapshot().tiles[0].powered, false);
  turnTo(circuit, 0, 6); // south/east accepts source
  assert.equal(circuit.snapshot().tiles[0].powered, true);
});

test("reaching the core tile is insufficient unless its output points east", () => {
  const circuit = createEnergyCircuit({ random: () => 0 });
  turnTo(circuit, 0, 6);
  turnTo(circuit, 1, 10);
  turnTo(circuit, 2, 12);
  turnTo(circuit, 5, 9); // accepts from north, but points west instead of east
  turnTo(circuit, 3, 9);
  assert.equal(circuit.snapshot().tiles[5].powered, true);
  assert.equal(circuit.snapshot().status, "active");
  turnTo(circuit, 5, 3);
  assert.equal(circuit.snapshot().status, "success");
});

test("electricity cannot wrap from the last column into the next row", () => {
  const circuit = createEnergyCircuit({ random: () => 0 });
  turnTo(circuit, 0, 3); // blocks the source's legitimate north connection
  turnTo(circuit, 2, 6); // east port adjacent in array, across a row boundary
  turnTo(circuit, 3, 9); // west port connects to source, not tile 2
  const state = circuit.snapshot();
  assert.equal(state.tiles[3].powered, true);
  assert.equal(state.tiles[2].powered, false);
  assert.equal(state.tiles[0].powered, false);
});

test("the 15-second deadline fails and freezes the circuit", () => {
  const circuit = createEnergyCircuit();
  circuit.advance(14.99);
  assert.equal(circuit.snapshot().status, "active");
  const failed = circuit.advance(0.01);
  assert.equal(failed.status, "failed");
  assert.equal(failed.remaining, 0);
  assert.equal(failed.heat, 1);
  assert.equal(circuit.rotate(3), false);
  assert.deepEqual(circuit.advance(5), failed);
});

test("pause, invalid inputs, and snapshots preserve state", () => {
  const circuit = createEnergyCircuit();
  circuit.advance(3);
  const state = circuit.snapshot();
  for (const index of [-1, 9, 1.5, undefined]) assert.equal(circuit.rotate(index), false);
  assert.deepEqual(circuit.advance(-4), state);
  for (let read = 0; read < 10; read++) assert.deepEqual(circuit.snapshot(), state);
  circuit.snapshot().tiles[3].ports = 15;
  assert.deepEqual(circuit.snapshot(), state);
  circuit.advance(1);
  assert.equal(circuit.snapshot().remaining, 11);
});

test("a fresh attempt resets time and heat after an overload", () => {
  const circuit = createEnergyCircuit();
  circuit.advance(15);
  const fresh = createEnergyCircuit().snapshot();
  assert.equal(fresh.status, "active");
  assert.equal(fresh.remaining, 15);
  assert.equal(fresh.heat, 0.25);
});
