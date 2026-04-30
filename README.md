# @elyzesolutions/ulogo

Command-line client for the ulogo.it Developer API.

The CLI is API-first: it calls the documented `/api/v1` routes and does not
depend on private web app session endpoints.

## Install

```bash
npm install -g @elyzesolutions/ulogo
```

## Use

```bash
export ULOGO_API_KEY="your_api_key"

ulogo clean ./draft.png --wait --output ./brand --json
ulogo generate "Minimal geometric monogram for Ulogo" --wait
ulogo status <project-id> --json
ulogo download <project-id> --output ./brand
ulogo edit <project-id> "make the accent warmer" --wait
ulogo batch manifest.json --wait
ulogo webhooks test --url https://example.com/webhook --secret whsec_test
```

Set `ULOGO_BASE_URL` or pass `--base-url` when targeting a non-production API.

## API keys

Create an API key from your ulogo.it account developer settings:

https://ulogo.it/account/developer

Use the narrowest scopes needed for your workflow and keep live keys out of
source control.

## Release provenance

This package is published from GitHub Actions with npm trusted publishing and
provenance from the public `ElyzeSolutions/ulogo-cli` repository.
