#!/bin/bash

echo "=== DNS Troubleshooting for chairreads.space ==="
echo ""

echo "1. Checking current nameservers..."
nslookup -type=NS chairreads.space 8.8.8.8

echo ""
echo "2. Checking A records..."
nslookup chairreads.space 8.8.8.8

echo ""
echo "3. Checking with Cloudflare DNS..."
nslookup chairreads.space 1.1.1.1

echo ""
echo "4. Checking WHOIS info..."
whois chairreads.space | grep -i "name server"

echo ""
echo "=== Manual Steps ==="
echo "1. Clear browser cache (Ctrl+Shift+Delete)"
echo "2. Flush local DNS cache:"
echo "   Windows: ipconfig /flushdns"
echo "   Mac: sudo dscacheutil -flushcache"
echo "   Linux: sudo systemctl restart systemd-resolved"
echo ""
echo "3. Check DNS propagation at: https://dnschecker.org/"
echo "4. Verify domain registrar settings"