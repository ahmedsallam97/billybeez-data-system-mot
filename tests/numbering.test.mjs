import assert from "node:assert/strict";
import test from "node:test";
import numbering from "../lib/numbering.js";

test("formatDeviceInvoiceSerial combines padded device and sequence", () => {
  assert.equal(numbering.formatDeviceInvoiceSerial(2, 1), "0000200001");
  assert.equal(numbering.formatDeviceInvoiceSerial(10, 27), "0001000027");
});

test("formatDeviceInvoiceSerial falls back to minimum positive values", () => {
  assert.equal(numbering.formatDeviceInvoiceSerial(0, 0), "0000100001");
  assert.equal(numbering.formatDeviceInvoiceSerial(undefined, undefined), "0000100001");
});
