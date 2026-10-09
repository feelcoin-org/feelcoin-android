# Antivirus and False-Positive Policy

Cryptocurrency software can receive additional scrutiny from antivirus products because malicious programs sometimes abuse miners or wallet software without user consent.

Feelcoin Desktop is intentionally structured to minimize avoidable false positives.

## What the desktop wallet does not do

Feelcoin Desktop does not:

- bundle XMRig or another cryptocurrency miner;
- start mining in the background;
- hide processes;
- install persistence outside the normal application installation flow;
- use executable packers such as UPX for official binaries;
- obfuscate official release executables;
- ask users to disable Windows Defender;
- ask users to create broad antivirus exclusions.

## Daemon separation

A local Feelcoin daemon may be used by the desktop wallet to synchronize with the network. The daemon is a blockchain node, not a miner.

Future packaging may either:

1. bundle an official Feelcoin daemon with the wallet installer; or
2. download a versioned official daemon after explicit user approval.

The final method must include integrity verification and visible user consent.

## Mining remains separate

Mining is a separate, optional activity and is maintained outside the core desktop-wallet package.

This separation is both a security decision and a trust decision: a person installing a wallet should not unexpectedly receive mining software.

## Release hygiene

For official release builds we aim to provide:

- reproducible or repeatable build instructions;
- SHA-256 checksums;
- source tags matching binary releases;
- code signing for Windows when signing infrastructure is available;
- clear release notes describing included executables;
- malware-vendor false-positive submissions when a clean official binary is incorrectly classified.

A detection should never be “fixed” by telling users to disable their security software globally.
