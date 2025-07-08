# GitCache CLI

> Universal Git-dependency cache & proxy — *CLI client*

![CI](https://github.com/grata-labs/gitcache-cli/actions/workflows/ci.yml/badge.svg)
[![npm version](https://badge.fury.io/js/%40grata-labs%2Fgitcache-cli.svg)](https://badge.fury.io/js/%40grata-labs%2Fgitcache-cli)

A TypeScript CLI for caching Git repositories locally and (coming soon) syncing with team-shared GitCache proxies.

## Installation

```bash
npm install -g @grata-labs/gitcache-cli
```

## Usage

### Cache a Git repository locally

```bash
# Cache a repository to ~/.gitcache/
gitcache cache https://github.com/user/repo.git

# Force overwrite if it already exists
gitcache cache https://github.com/user/repo.git --force
```

### Get help

```bash
gitcache --help
gitcache cache --help
```

## How it works

GitCache CLI mirrors Git repositories to `~/.gitcache/` using `git clone --mirror`. This creates a bare repository that can be used as a local cache for faster subsequent clones and fetches.

## Roadmap

- ✅ **Local cache** — mirror repos to `~/.gitcache`
- ⏳ **Team cache** — push mirrors to S3-backed GitCache proxy
- ⏳ **Integrity verification** — signed manifests
- ⏳ **Build-tool plugins** — npm, pip, go mod, cargo

## Development

```bash
# Clone and setup
git clone https://github.com/grata-labs/gitcache-cli.git
cd gitcache-cli
npm install

# Development
npm run dev -- cache https://github.com/user/repo.git
npm run build
npm test
npm run lint
```

## Contributing

PRs & issues welcome! This is an open-source project from [Grata Labs](https://grata.co).

## License

MIT - see [LICENSE](LICENSE) file.
