import { strict as assert } from "node:assert";
import { test } from "node:test";
import { getInvoiceProductName } from "./invoice-product-name";

test("recovers blank tyre descriptions from retained invoice details", () => {
  assert.equal(getInvoiceProductName({
    category: "tyres", productName: "", brand: "Michelin",
    pattern: "PS4 SUV", size: "235/60R18", specialMarkings: "107W",
  }), "Michelin PS4 SUV - 235/60R18 107W");
});

test("preserves custom and multiline invoice descriptions", () => {
  const productName = "Michelin PS4 SUV\nSpecial customer description";
  assert.equal(getInvoiceProductName({
    category: "tyres", productName, brand: "Michelin", pattern: "PS4 SUV",
  }), productName);
});

test("recovers wheel descriptions without missing-field placeholders", () => {
  assert.equal(getInvoiceProductName({
    category: "wheels", productName: null, brand: "BBS", model: "CH-R", size: "18",
  }), "BBS CH-R - 18");
  assert.equal(getInvoiceProductName({ category: "tyres", brand: "Michelin" }), "Michelin");
});

test("does not guess a description when no product details remain", () => {
  assert.equal(getInvoiceProductName({ category: "others", productName: "" }), "");
  assert.equal(getInvoiceProductName({ category: "tyres" }), "");
});