#!/bin/bash
# RFC 3161 Trusted Timestamping — test script
# Usage: chmod +x tsa-test.sh && ./tsa-test.sh
# With tamper test: ./tsa-test.sh --tamper

set -e

echo "=== RFC 3161 Trusted Timestamping test ==="
echo ""

# 1. Create test data (simulated Tagesabschluss)
echo '{"date":"2026-03-28","total_in":1500.00,"total_out":320.50,"hash_chain":"abc123"}' > tagesabschluss.json
echo "[1/5] Test data created: tagesabschluss.json"

# 2. Show SHA-256 hash (this is what gets sent to the TSA, not the data)
echo "[2/5] SHA-256 hash:"
sha256sum tagesabschluss.json

# 3. Create TimeStampRequest
openssl ts -query -data tagesabschluss.json -sha256 -cert -out request.tsq
echo "[3/5] TimeStampRequest created: request.tsq"

# 4. Download FreeTSA certificates (needed for verification)
curl -s https://freetsa.org/files/tsa.crt -o tsa.crt
curl -s https://freetsa.org/files/cacert.pem -o cacert.pem
echo "[4/5] FreeTSA certificates downloaded"

# 5. Send to FreeTSA
curl -s -H "Content-Type: application/timestamp-query" \
  --data-binary '@request.tsq' \
  https://freetsa.org/tsr > response.tsr
echo "[5/5] TimeStampResponse received: response.tsr"

echo ""
echo "=== Verification ==="

echo ""
echo "--- TSA response details ---"
openssl ts -reply -in response.tsr -text

echo ""
echo "--- Verification result ---"
openssl ts -verify -in response.tsr -queryfile request.tsq \
  -CAfile cacert.pem -untrusted tsa.crt

echo ""
echo "=== Done ==="
echo "Files: tagesabschluss.json, request.tsq, response.tsr, tsa.crt, cacert.pem"

# Tamper test only with --tamper flag
if [[ "$1" == "--tamper" ]]; then
  echo ""
  echo "=== Tamper test ==="
  echo '{"date":"2026-03-28","total_in":9999.99,"total_out":320.50,"hash_chain":"abc123"}' > tagesabschluss_modified.json
  openssl ts -query -data tagesabschluss_modified.json -sha256 -cert -out request_modified.tsq
  echo "Verifying with tampered data (this MUST fail):"
  openssl ts -verify -in response.tsr -queryfile request_modified.tsq \
    -CAfile cacert.pem -untrusted tsa.crt 2>&1 || echo ">>> EXPECTED FAILURE: tampered data does not match the timestamp"
fi
