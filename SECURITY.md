# Security Policy

Feelcoin Desktop is designed to keep wallet behavior explicit and reviewable.

## Security principles

- The official desktop wallet does **not** bundle a cryptocurrency miner.
- The application must never mine silently.
- The project does not ask users to disable antivirus software or create broad antivirus exclusions.
- Executable packers and code obfuscation are not used for official builds.
- Wallet secrets must never be committed to this repository.
- Official release artifacts should publish SHA-256 checksums.
- Code signing should be used for official Windows releases when signing infrastructure is available.

## Reporting a vulnerability

Please do not publish wallet-security vulnerabilities as a public issue before maintainers have had a reasonable opportunity to investigate.

Contact the Feelcoin project through the official channels listed at:

https://feelcoin.org

Do not send seed phrases, private spend keys, wallet files, passwords, or other secrets in a vulnerability report.
