#!/usr/bin/env bash
set -e

# Register a test user with the DEFRA ID stub
# This must be done before attempting OAuth login

echo "Registering test user with DEFRA ID stub..."

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3200/cdp-defra-id-stub/API/register \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "86a7607c-a1e7-41e5-a0b6-a41680d05a2a",
    "email": "test@example.com",
    "firstName": "BenTest",
    "lastName": "UserLast",
    "loa": "1",
    "aal": "1",
    "enrolmentCount": 1,
    "enrolmentRequestCount": 1,
    "relationships": [
      {
        "organisationName": "Test Imports Organisation",
        "relationshipRole": "Employee",
        "roleName": "Admin",
        "roleStatus": "1"
      }
    ]
  }')

# Extract HTTP status code (last line)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
# Extract response body (everything except last line)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 201 ]; then
  echo "✓ User registered successfully"
  echo ""
  echo "Test User Credentials:"
  echo "  Email: test@example.com"
  echo "  User ID: 86a7607c-a1e7-41e5-a0b6-a41680d05a2a"
  echo ""
  echo "You can now log in at: http://localhost:3000/dashboard"
  echo ""
  echo "Note: Since the stub uses memory cache, this user will be lost"
  echo "      if the stub container restarts. Re-run this script if needed."
  exit 0
else
  echo "✗ Registration failed (HTTP $HTTP_CODE)"
  echo "$BODY"
  exit 1
fi
