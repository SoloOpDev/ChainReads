#!/bin/bash

echo "=== DNS Diagnostic for chainreads.space ==="
echo ""

echo "1. Current A Record:"
nslookup chainreads.space 8.8.8.8 | grep "Address:" | tail -n 1

echo ""
echo "2. Railway App Address:"
nslookup chainreads-production.up.railway.app 8.8.8.8 | grep "Address:" | tail -n 1

echo ""
echo "3. HTTP Response:"
curl -sI https://chainreads.space | head -n 5

echo ""
echo "4. Railway App Response:"
curl -sI https://chainreads-production.up.railway.app | head -n 5

echo ""
echo "5. DNS Propagation Status:"
echo "Check manually at: https://dnschecker.org/#A/chainreads.space"

echo ""
echo "=== What to do ==="
echo "If addresses in #1 and #2 don't match, update Hostinger DNS"
echo "If #3 shows Hostinger, DNS is not propagated yet"
echo "If #4 works but #3 doesn't, it's definitely a DNS issue"
