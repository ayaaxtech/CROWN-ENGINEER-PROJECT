import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

globalThis.window = globalThis;
await import('../scan-parser.js');
const catalog = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const parser = globalThis.ScanParser;

test('extracts plate fields and exactly matches every catalog model code', () => {
  assert.equal(catalog.length, 15);
  for (const machine of catalog) {
    const alias = machine.model.split('/')[0].trim();
    const result = parser.parsePlate(
      `MANUFACTURER: T-Freemantle\nMODEL NO: ${alias}\nSERIAL NUMBER: SN-12345`,
      catalog
    );
    assert.equal(result.manufacturer, 'T-Freemantle', machine.model);
    assert.equal(result.model, alias, machine.model);
    assert.equal(result.serial, 'SN-12345', machine.model);
    assert.equal(result.match?.id, machine.id, machine.model);
  }
});

test('parses multiple OCR fields on a single line, including missing colons', () => {
  const result = parser.parsePlate('T-Freemantle MODEL NO S07S SERIAL NUMBER 17A-92', catalog);
  assert.equal(result.model, 'S07S');
  assert.equal(result.serial, '17A-92');
  assert.equal(result.match?.model, 'S07 / S07S');
});

test('normalizes separators in model codes but does not match code substrings in serials', () => {
  const normalized = parser.parsePlate('MODEL: BMC S\nS/N: 17-1096', catalog);
  assert.equal(normalized.match?.model, 'BMC-S');
  assert.equal(normalized.serial, '17-1096');

  const falsePositive = parser.parsePlate('SERIAL NUMBER: AS01B\nTYPE: UNKNOWN', catalog);
  assert.equal(falsePositive.match, null);
  assert.equal(parser.findCatalogMatch('MODEL S01X', 'S01X', catalog), null);
});
