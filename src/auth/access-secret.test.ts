import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { authorizeAccess } from "./access-secret.ts";

const envSecret = "segredo-do-ambiente";
const otherSecret = "segredo-apresentado";

function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

test("segredo igual devolve o owner_key do ambiente", () => {
  const result = authorizeAccess(`Bearer ${envSecret}`, envSecret);
  assert.deepEqual(result, { ok: true, ownerKey: sha256Hex(envSecret) });
});

test("header ausente, esquema errado ou segredo diferente falham sem vazar segredo", () => {
  const failures = [
    authorizeAccess(null, envSecret),
    authorizeAccess("Basic " + envSecret, envSecret),
    authorizeAccess(`Bearer ${otherSecret}`, envSecret),
    authorizeAccess(`Bearer ${envSecret}`, undefined),
    authorizeAccess(`Bearer ${envSecret}`, ""),
  ];

  for (const result of failures) {
    assert.equal(result.ok, false);
    if (result.ok) continue;
    assert.equal(result.message, "Não autorizado.");
    assert.equal(result.message.includes(envSecret), false);
    assert.equal(result.message.includes(otherSecret), false);
  }
});
