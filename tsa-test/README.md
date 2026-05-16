# RFC 3161 Trusted Timestamping — Test Script

Proof of concept for adding external timestamp verification to GoBD-compliant applications.

## What it does

The script creates a test data file, computes its SHA-256 hash, sends the hash to a free RFC 3161 Timestamp Authority (FreeTSA.org), and verifies the response. Only the hash leaves the system — the original data stays local.

## Requirements

- `openssl`
- `curl`

## Usage

```bash
chmod +x tsa-test.sh

# Normal run — timestamp + verify
./tsa-test.sh

# With tamper detection test
./tsa-test.sh --tamper
```

## Output files

| File | Purpose |
|---|---|
| `tagesabschluss.json` | Simulated daily closing data |
| `request.tsq` | TimeStampRequest (hash sent to TSA) |
| `response.tsr` | Signed TimeStampResponse from TSA |
| `tsa.crt` | FreeTSA signing certificate |
| `cacert.pem` | FreeTSA root CA certificate |

With `--tamper`:

| File | Purpose |
|---|---|
| `tagesabschluss_modified.json` | Tampered data (amount changed) |
| `request_modified.tsq` | TSQ from tampered data |

## How it works

1. Test data is created (`tagesabschluss.json`)
2. SHA-256 hash is computed
3. Hash is wrapped in a TimeStampRequest (`.tsq`)
4. Request is sent to FreeTSA.org via HTTP POST
5. Signed TimeStampResponse (`.tsr`) is stored
6. Verification checks: hash match + valid TSA signature + timestamp

The `--tamper` flag modifies the data and attempts verification against the original timestamp — this must fail with `message imprint mismatch`.

## TSA services

| Service | URL | Notes |
|---|---|---|
| FreeTSA.org | `https://freetsa.org/tsr` | Free, unlimited, Würzburg DE |
| DigiCert | `http://timestamp.digicert.com` | Free |
| rfc3161.ai.moda | `https://rfc3161.ai.moda` | Aggregator with failover |

## Verification by third party

Anyone can verify a timestamp with the `.tsr` file and FreeTSA's public certificates:

```bash
openssl ts -verify -in response.tsr -queryfile request.tsq \
  -CAfile cacert.pem -untrusted tsa.crt
```

No access to the original system required.
