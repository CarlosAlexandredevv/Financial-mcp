import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { authorizeAccess } from "./access-secret.ts";
import {
  authorizationServerMetadata,
  authorizeMcp,
  decideAuthorize,
  decideToken,
  normalizePublicUrl,
  protectedResourceMetadata,
  redirectMatches,
  signAccessToken,
  validateClientMetadata,
  verifyAccessToken,
  verifyPkce,
  wwwAuthenticateHeader,
} from "./oauth.ts";

const issuer = "https://financeiro.exemplo.com";
const secret = "segredo-do-ambiente";

function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

test("normalizePublicUrl remove barra final e trata vazio", () => {
  assert.equal(
    normalizePublicUrl("https://financeiro.exemplo.com/"),
    "https://financeiro.exemplo.com",
  );
  assert.equal(normalizePublicUrl(undefined), null);
  assert.equal(normalizePublicUrl(""), null);
});

test("metadados de descoberta", () => {
  assert.deepEqual(protectedResourceMetadata(issuer), {
    resource: `${issuer}/mcp`,
    authorization_servers: [issuer],
    scopes_supported: ["financial"],
    bearer_methods_supported: ["header"],
  });
  const asMeta = authorizationServerMetadata(issuer);
  assert.equal(asMeta.issuer, issuer);
  assert.equal(asMeta.authorization_endpoint, `${issuer}/authorize`);
  assert.equal(
    "client_id_metadata_document_supported" in asMeta,
    false,
  );
  assert.equal("offline_access" in asMeta, false);
});

test("redirectMatches", () => {
  assert.equal(
    redirectMatches("https://app/cb", "https://app/cb"),
    true,
  );
  assert.equal(
    redirectMatches("http://localhost:3000/cb", "http://localhost:9999/cb"),
    true,
  );
  assert.equal(
    redirectMatches("http://127.0.0.1:3000/cb", "http://127.0.0.1:1/cb"),
    true,
  );
  assert.equal(
    redirectMatches("https://exemplo.com:8443/cb", "https://exemplo.com/cb"),
    false,
  );
  assert.equal(
    redirectMatches("https://exemplo.com/a", "https://exemplo.com/b"),
    false,
  );
});

test("validateClientMetadata", () => {
  assert.deepEqual(
    validateClientMetadata({
      redirect_uris: ["https://app/cb"],
    }),
    { ok: true, redirectUris: ["https://app/cb"] },
  );
  assert.deepEqual(
    validateClientMetadata({
      redirect_uris: ["http://localhost/cb", "http://127.0.0.1/cb"],
    }),
    {
      ok: true,
      redirectUris: ["http://localhost/cb", "http://127.0.0.1/cb"],
    },
  );
  assert.equal(
    validateClientMetadata({ redirect_uris: ["http://exemplo.com/cb"] }).ok,
    false,
  );
  assert.equal(
    validateClientMetadata({ redirect_uris: ["https://app/cb#x"] }).ok,
    false,
  );
  assert.equal(validateClientMetadata({ redirect_uris: [] }).ok, false);
  assert.equal(
    validateClientMetadata({
      redirect_uris: ["https://app/cb"],
      client_secret: "x",
    }).ok,
    false,
  );
  assert.equal(
    validateClientMetadata({
      redirect_uris: ["https://app/cb"],
      token_endpoint_auth_method: "client_secret_basic",
    }).ok,
    false,
  );
  assert.equal(
    validateClientMetadata({
      redirect_uris: ["https://app/cb"],
      grant_types: ["refresh_token"],
    }).ok,
    false,
  );
});

test("PKCE S256", () => {
  const verifier = "verifier-seguro-123";
  const challenge = pkceChallenge(verifier);
  assert.equal(verifyPkce(verifier, challenge), true);
  assert.equal(verifyPkce("outro", challenge), false);
});

test("JWT access token", () => {
  const now = 1_700_000_000;
  const ownerKey = sha256Hex(secret);
  const token = signAccessToken({
    secret,
    issuer,
    audience: `${issuer}/mcp`,
    ownerKey,
    nowSeconds: now,
  });
  assert.deepEqual(
    verifyAccessToken(token, {
      secret,
      issuer,
      audience: `${issuer}/mcp`,
      nowSeconds: now,
    }),
    { ok: true, ownerKey },
  );

  const parts = token.split(".");
  const badSig = `${parts[0]}.${parts[1]}.assinatura-invalida`;
  assert.equal(
    verifyAccessToken(badSig, {
      secret,
      issuer,
      audience: `${issuer}/mcp`,
      nowSeconds: now,
    }).ok,
    false,
  );

  const wrongAud = signAccessToken({
    secret,
    issuer,
    audience: "https://outro/mcp",
    ownerKey,
    nowSeconds: now,
  });
  assert.equal(
    verifyAccessToken(wrongAud, {
      secret,
      issuer,
      audience: `${issuer}/mcp`,
      nowSeconds: now,
    }).ok,
    false,
  );

  const expired = signAccessToken({
    secret,
    issuer,
    audience: `${issuer}/mcp`,
    ownerKey,
    nowSeconds: now - 3_000_000,
  });
  assert.equal(
    verifyAccessToken(expired, {
      secret,
      issuer,
      audience: `${issuer}/mcp`,
      nowSeconds: now,
    }).ok,
    false,
  );

  const header = Buffer.from(
    JSON.stringify({ alg: "none", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: issuer,
      aud: `${issuer}/mcp`,
      sub: ownerKey,
      scope: "financial",
      exp: now + 1000,
    }),
  ).toString("base64url");
  assert.equal(
    verifyAccessToken(`${header}.${payload}.x`, {
      secret,
      issuer,
      audience: `${issuer}/mcp`,
      nowSeconds: now,
    }).ok,
    false,
  );
});

test("authorizeMcp", () => {
  const now = 1_700_000_000;
  const ownerKey = sha256Hex(secret);
  const token = signAccessToken({
    secret,
    issuer,
    audience: `${issuer}/mcp`,
    ownerKey,
    nowSeconds: now,
  });

  assert.deepEqual(
    authorizeMcp({
      authorizationHeader: `Bearer ${secret}`,
      envSecret: secret,
      publicUrl: issuer,
      nowSeconds: now,
    }),
    { ok: true, ownerKey },
  );
  assert.deepEqual(
    authorizeAccess(`Bearer ${secret}`, secret),
    { ok: true, ownerKey },
  );

  assert.deepEqual(
    authorizeMcp({
      authorizationHeader: `Bearer ${token}`,
      envSecret: secret,
      publicUrl: issuer,
      nowSeconds: now,
    }),
    { ok: true, ownerKey },
  );

  const denied = authorizeMcp({
    authorizationHeader: "Bearer lixo",
    envSecret: secret,
    publicUrl: issuer,
    nowSeconds: now,
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.message, "Não autorizado.");
    assert.equal(denied.wwwAuthenticate, wwwAuthenticateHeader(issuer));
    assert.equal(denied.message.includes(secret), false);
  }

  const deniedNoPublic = authorizeMcp({
    authorizationHeader: `Bearer ${token}`,
    envSecret: secret,
    publicUrl: undefined,
    nowSeconds: now,
  });
  assert.equal(deniedNoPublic.ok, false);
  if (!deniedNoPublic.ok) {
    assert.equal(deniedNoPublic.wwwAuthenticate, undefined);
  }
});

test("decideAuthorize", () => {
  const baseQuery = {
    response_type: "code",
    client_id: "client-1",
    redirect_uri: "https://app/cb",
    code_challenge: "challenge",
    code_challenge_method: "S256",
    resource: `${issuer}/mcp`,
  };

  assert.deepEqual(
    decideAuthorize({
      query: baseQuery,
      issuer,
      registeredRedirectUris: ["https://app/cb"],
    }).kind,
    "consent",
  );

  assert.deepEqual(
    decideAuthorize({
      query: { ...baseQuery, client_id: "desconhecido" },
      issuer,
      registeredRedirectUris: null,
    }),
    { kind: "html-400" },
  );

  const badScope = decideAuthorize({
    query: { ...baseQuery, scope: "admin" },
    issuer,
    registeredRedirectUris: ["https://app/cb"],
  });
  assert.equal(badScope.kind, "redirect-error");
  if (badScope.kind === "redirect-error") {
    assert.equal(badScope.error, "invalid_scope");
    assert.equal(badScope.iss, issuer);
  }
});

test("decideToken", () => {
  const now = 1_700_000_000;
  const ownerKey = sha256Hex(secret);
  const verifier = "verifier-ok";
  const challenge = pkceChallenge(verifier);
  const consumed = {
    clientId: "c1",
    redirectUri: "https://app/cb",
    codeChallenge: challenge,
    resource: `${issuer}/mcp`,
  };

  assert.equal(
    decideToken({
      grantType: "refresh_token",
      clientId: "c1",
      redirectUri: "https://app/cb",
      codeVerifier: verifier,
      resource: `${issuer}/mcp`,
      consumed,
      secret,
      issuer,
      ownerKey,
      nowSeconds: now,
    }).ok,
    false,
  );

  assert.equal(
    decideToken({
      grantType: "authorization_code",
      clientId: undefined,
      redirectUri: "https://app/cb",
      codeVerifier: verifier,
      resource: `${issuer}/mcp`,
      consumed,
      secret,
      issuer,
      ownerKey,
      nowSeconds: now,
    }).ok,
    false,
  );

  assert.deepEqual(
    decideToken({
      grantType: "authorization_code",
      clientId: "c1",
      redirectUri: "https://app/cb",
      codeVerifier: verifier,
      resource: `${issuer}/mcp`,
      consumed: null,
      secret,
      issuer,
      ownerKey,
      nowSeconds: now,
    }),
    { ok: false, error: "invalid_grant" },
  );

  const badPkce = decideToken({
    grantType: "authorization_code",
    clientId: "c1",
    redirectUri: "https://app/cb",
    codeVerifier: "errado",
    resource: `${issuer}/mcp`,
    consumed,
    secret,
    issuer,
    ownerKey,
    nowSeconds: now,
  });
  assert.deepEqual(badPkce, { ok: false, error: "invalid_grant" });

  const success = decideToken({
    grantType: "authorization_code",
    clientId: "c1",
    redirectUri: "https://app/cb",
    codeVerifier: verifier,
    resource: `${issuer}/mcp`,
    consumed,
    secret,
    issuer,
    ownerKey,
    nowSeconds: now,
  });
  assert.equal(success.ok, true);
  if (success.ok) {
    assert.equal(success.expires_in, 2_592_000);
    assert.equal(success.scope, "financial");
    assert.equal(success.token_type, "Bearer");
    assert.equal(
      verifyAccessToken(success.access_token, {
        secret,
        issuer,
        audience: `${issuer}/mcp`,
        nowSeconds: now,
      }).ok,
      true,
    );
  }
});
