# Changelog

## 0.1.5

- Publish the first trusted-publishing release for `ulogo-cli`.

## 0.1.4

- Move the CLI source and npm trusted publishing workflow to the public
  `ElyzeSolutions/ulogo-cli` repository.
- Restore npm provenance publishing now that the source repository is public.
- Rename the npm package to `ulogo-cli`; the installed command remains `ulogo`.

## 0.1.3

- Fix the npm-installed `ulogo` binary so it runs through npm's `.bin` symlink.
- Send upload MIME types from file extensions so valid PNG, JPG, WebP, and SVG
  files are accepted by the production API.

## 0.1.2

- License the CLI package under MIT.
- Disable npm provenance while the source repository remains private; trusted
  publishing still uses GitHub Actions OIDC without long-lived npm tokens.
- Keep npm README content user-facing only.

## 0.1.1

- Rename the npm package to `@elyzesolutions/ulogo` for the existing
  ElyzeSolutions npm organization.
- Prepare trusted publishing from GitHub Actions after the first manual package
  reservation.

## 0.1.0

- Initial `@elyzesolutions/ulogo` release for cleanup, generation, status polling,
  downloads, edits, batch manifests, usage inspection, and webhook tests.
