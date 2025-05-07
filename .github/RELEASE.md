# Release Process

This document describes the release process for the robust-axios-client library.

## Automated Release Process

We use GitHub Actions to automate the release process. The workflow is triggered manually and performs the following steps:

1. Runs tests and linting to ensure code quality
2. Builds the library
3. Updates the version number in package.json
4. Generates a changelog from recent commits
5. Creates a git tag and GitHub release
6. Publishes the package to npm

## Triggering a Release

To trigger a new release:

1. Go to the [Actions tab](../../actions) in the GitHub repository
2. Select the "Release" workflow
3. Click "Run workflow"
4. Choose the version increment:
   - `patch` (0.0.x) for backwards-compatible bug fixes
   - `minor` (0.x.0) for backwards-compatible features
   - `major` (x.0.0) for breaking changes
   - `prepatch`, `preminor`, `premajor`, `prerelease` for pre-releases
   - `custom` to specify a custom version number
5. If you selected `custom`, provide the custom version in the appropriate field
6. Click "Run workflow" to start the release process

## Required Secrets

The following secrets need to be configured in the repository settings:

- `NPM_TOKEN`: An npm access token with publish permissions
- `GH_TOKEN` (optional): A GitHub personal access token with repo scope (falls back to GITHUB_TOKEN)

## Manual Release (if needed)

In case the automated process fails, here's how to release manually:

1. Update the version in package.json: `npm version [patch|minor|major]`
2. Run tests: `npm test`
3. Build the package: `npm run build`
4. Push changes: `git push && git push --tags`
5. Publish to npm: `npm publish`

## Post-Release

After a release:

1. Verify the package is available on [npm](https://www.npmjs.com/package/robust-axios-client)
2. Check the [GitHub release](../../releases) for correctness
3. Inform users of the new release through appropriate channels 