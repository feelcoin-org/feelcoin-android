# Feelcoin Android v1.0.0 — QA candidate

This branch derives from the officially released v0.3.1 source commit `f2797c246fe3943f734f275568304397702136f1`. The production package is still `org.feelcoin.wallet` with versionCode 10000 and must retain the ORIGINAL release signing certificate for any in-place update.

Android is a light wallet using remote Feelcoin chain APIs and a pinned local WASM signing engine: it does not embed the Linux or Windows Core. Difficulty/timestamp v17 activates at block index 21205. The unsigned/QA app selects forkVersion 16 until a full verified wallet scan confirms the chain includes block 21205 (API count 21206), after which sends select 17. Scanner, send, replay, recovery and fee compatibility must still be device-tested against upgraded v17 nodes.

GitHub QA builds use a SEPARATE package identity `org.feelcoin.wallet.qa` and debug signing to protect any installed official v0.3.1 app. Do not use real funds, import real secrets, uninstall the official wallet or clear its data to test. This is not an official release and hardfork height 21205 is not authorized until consensus checks and adequate notice.
