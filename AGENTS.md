# Away Mode

Personal Manifest V3 Chrome extension. Read README.md and docs/feasibility.md first.

- Never modify a live Amazon delivery during research or automated tests. Chris must select the actual groups and targets before live validation.
- Use only rendered Amazon DOM and normal page controls. No private API replay, credentials, session-token capture, or hidden account objects.
- Never purchase, cancel, skip, change frequency, or change address to simulate rescheduling.
- Persist before Confirm. Unknown results require reconciliation, never blind retries.
- Keep all fixtures synthetic. Never commit account HTML, screenshots, addresses, or account identifiers.
- Release and site announcement require verified single-group and multi-group extension runs. Fixture tests alone do not pass that gate.
- Run npm run typecheck, npm test, npm run test:integration, and npm run build.
