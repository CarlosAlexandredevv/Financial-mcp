import { createRequire } from "node:module";
import type { ReactNode } from "react";

const { renderToStaticMarkup } = createRequire(import.meta.url)(
  "next/dist/compiled/react-dom/server.node.js",
) as { renderToStaticMarkup: (node: ReactNode) => string };

import type { AuthorizeParams } from "./oauth";

const FONTS =
  "https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@700&family=Source+Sans+3:wght@400;600&display=swap";

const CSS = `
  :root {
    --ink: #2b241c;
    --muted: #8d847b;
    --paper: #f6efe8;
    --card: #fffdfb;
    --line: #f0d3bf;
    --coral: #f07158;
    --coral-ink: #e25b45;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body {
    background: var(--paper);
    color: var(--ink);
    font-family: "Source Sans 3", sans-serif;
    font-size: 1.05rem;
    line-height: 1.45;
  }
  .stage {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 1.5rem;
  }
  .card {
    width: min(26rem, 100%);
    padding: 2.4rem 2rem 1.8rem;
    background: var(--card);
    border-radius: 1.35rem;
    box-shadow: 0 16px 40px rgb(90 60 40 / 0.08);
    text-align: center;
  }
  h1 {
    margin: 0 0 0.45rem;
    font-family: "Libre Baskerville", serif;
    font-size: 2rem;
    font-weight: 700;
    line-height: 1.15;
  }
  .lead { margin: 0 0 1.5rem; color: var(--muted); }
  .host { color: var(--ink); font-weight: 600; }
  .quiet {
    margin: -0.7rem 0 1.2rem;
    color: var(--muted);
    font-size: 0.92rem;
  }
  .alert {
    margin: 0 0 0.85rem;
    color: var(--coral-ink);
    font-weight: 600;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  input[type="password"] {
    width: 100%;
    padding: 0.9rem 1rem;
    border: 1px solid var(--line);
    border-radius: 0.7rem;
    background: #fff;
    color: var(--ink);
    font: inherit;
  }
  input[type="password"]::placeholder { color: #b7aea6; }
  input[type="password"]:focus {
    outline: 2px solid var(--coral);
    outline-offset: 2px;
    border-color: var(--coral);
  }
  button {
    width: 100%;
    margin-top: 1rem;
    padding: 0.85rem 1rem;
    border: 0;
    border-radius: 0.7rem;
    background: var(--coral);
    color: #fff;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  button:hover { background: #e4634a; }
  button:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 3px;
  }
`;

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#f6efe8" />
        <title>{title}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONTS} />
        <style>{CSS}</style>
      </head>
      <body>
        <main className="stage">{children}</main>
      </body>
    </html>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <section className="card">{children}</section>;
}

function hiddenFields(params: AuthorizeParams) {
  const fields: Array<[string, string]> = [
    ["response_type", params.responseType],
    ["client_id", params.clientId],
    ["redirect_uri", params.redirectUri],
    ["code_challenge", params.codeChallenge],
    ["code_challenge_method", params.codeChallengeMethod],
    ["resource", params.resource],
    ["scope", params.scope],
  ];
  if (params.state !== undefined) fields.push(["state", params.state]);
  return fields.map(([name, value]) => (
    <input key={name} type="hidden" name={name} value={value} />
  ));
}

function ConsentPage(input: {
  host: string;
  loopback: boolean;
  params: AuthorizeParams;
  errorMessage?: string;
}) {
  return (
    <Page title="Finanças">
      <Card>
        <h1>Finanças</h1>
        <p className="lead">
          O aplicativo em <span className="host">{input.host}</span> quer consultar
          e lançar nas suas finanças.
        </p>
        {input.loopback ? (
          <p className="quiet">
            Este retorno é local. Qualquer processo nesta máquina pode ocupar a
            porta.
          </p>
        ) : null}
        <form method="post">
          {hiddenFields(input.params)}
          {input.errorMessage === undefined ? null : (
            <p className="alert" role="alert">
              {input.errorMessage}
            </p>
          )}
          <label className="sr" htmlFor="secret">
            Segredo de acesso
          </label>
          <input
            id="secret"
            name="secret"
            type="password"
            placeholder="Segredo de acesso"
            autoComplete="current-password"
            required
            autoFocus
            aria-invalid={input.errorMessage === undefined ? undefined : true}
          />
          <button type="submit">Liberar</button>
        </form>
      </Card>
    </Page>
  );
}

function InvalidRequestPage() {
  return (
    <Page title="Solicitação inválida">
      <Card>
        <h1>Solicitação inválida</h1>
        <p className="lead">
          O aplicativo não está registrado, ou o endereço de retorno não confere.
        </p>
      </Card>
    </Page>
  );
}

function html(node: ReactNode): string {
  return `<!DOCTYPE html>${renderToStaticMarkup(node)}`;
}

export function consentDocument(input: {
  host: string;
  loopback: boolean;
  params: AuthorizeParams;
  errorMessage?: string;
}): string {
  return html(<ConsentPage {...input} />);
}

export function invalidRequestDocument(): string {
  return html(<InvalidRequestPage />);
}
