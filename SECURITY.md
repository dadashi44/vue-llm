# Security Policy

## Supported versions

Security fixes go into the latest minor release of vue-llm.

## Reporting a vulnerability

Please **do not** open a public issue. Report it privately through [GitHub's private vulnerability reporting](https://github.com/dadashi44/vue-llm/security/advisories/new) instead.

Include what is affected, how to reproduce it and the impact you expect. You'll get a reply within a few days, and a fix or a plan before anything is disclosed.

## Scope

Typical issues worth reporting:

- API keys leaking to the browser despite the `dangerouslyAllowBrowser` guard
- XSS through model output in `StreamMarkdown`, `MessageParts` or the Chat UI components
- Bypasses of the rate limiting or validation in `createLLMHandler`

See also the [Security guide](https://vue-llm.js.org/guide/security) in the docs.
