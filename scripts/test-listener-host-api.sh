#!/bin/bash

# SPDK NAS Manager - Listener and Host Management API Test Script

# Configuration
BASE_URL="http://localhost:8000/api"
USERNAME="admin"
PASSWORD="admin123"
TEST_NQN="nqn.2016-06.io.spdk:cnode1"
TEST_IP="10.13.16.50"
TEST_PORT="4420"
TEST_HOST_NQN="nqn.2020-12.io.client:initiator1"

echo "=========================================="
echo "SPDK NAS Manager Listener & Host API Test"
echo "=========================================="

# Function to check if server is running
check_server() {
    if ! curl -s -f "$BASE_URL" > /dev/null 2>&1; then
        echo "❌ Error: Server is not running at $BASE_URL"
        echo "Please start the server with: npm start"
        exit 1
    fi
    echo "✅ Server is running"
}

# Function to login and get token
get_token() {
    echo "🔐 Logging in..."
    local response=$(curl -s -X POST "$BASE_URL/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")
    
    local token=$(echo "$response" | jq -r '.token // empty')
    
    if [[ -z "$token" || "$token" == "null" ]]; then
        echo "❌ Login failed: $response"
        exit 1
    fi
    
    echo "✅ Login successful"
    echo "$token"
}

# Function to make authenticated API request
api_request() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    local token="$4"
    
    if [[ -n "$data" ]]; then
        curl -s -X "$method" "$BASE_URL$endpoint" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            -d "$data"
    else
        curl -s -X "$method" "$BASE_URL$endpoint" \
            -H "Authorization: Bearer $token"
    fi
}

# Check server
check_server

# Get authentication token
TOKEN=$(get_token)

echo ""
echo "==============================================="
echo "1. Testing Listener Management"
echo "==============================================="

# Get initial listeners
echo "📋 Getting current listeners..."
response=$(api_request "GET" "/nqns/$TEST_NQN/listeners" "" "$TOKEN")
echo "Response: $response" | jq .

# Add a listener
echo "➕ Adding listener..."
listener_data='{
    "trtype": "TCP",
    "traddr": "'$TEST_IP'",
    "trsvcid": "'$TEST_PORT'",
    "adrfam": "ipv4"
}'
response=$(api_request "POST" "/nqns/$TEST_NQN/listeners" "$listener_data" "$TOKEN")
echo "Response: $response" | jq .

# Get listeners again to verify addition
echo "📋 Getting listeners after addition..."
response=$(api_request "GET" "/nqns/$TEST_NQN/listeners" "" "$TOKEN")
echo "Response: $response" | jq .

# Try to add duplicate listener (should fail)
echo "❌ Trying to add duplicate listener (should fail)..."
response=$(api_request "POST" "/nqns/$TEST_NQN/listeners" "$listener_data" "$TOKEN")
echo "Response: $response" | jq .

# Delete the listener
echo "🗑️ Deleting listener..."
listener_id="TCP:$TEST_IP:$TEST_PORT"
response=$(api_request "DELETE" "/nqns/$TEST_NQN/listeners/$listener_id" "" "$TOKEN")
echo "Response: $response" | jq .

# Get listeners after deletion
echo "📋 Getting listeners after deletion..."
response=$(api_request "GET" "/nqns/$TEST_NQN/listeners" "" "$TOKEN")
echo "Response: $response" | jq .

echo ""
echo "==============================================="
echo "2. Testing Host Management"
echo "==============================================="

# Get initial hosts
echo "📋 Getting current hosts..."
response=$(api_request "GET" "/nqns/$TEST_NQN/hosts" "" "$TOKEN")
echo "Response: $response" | jq .

# Add a host
echo "➕ Adding host..."
host_data='{
    "host_nqn": "'$TEST_HOST_NQN'"
}'
response=$(api_request "POST" "/nqns/$TEST_NQN/hosts" "$host_data" "$TOKEN")
echo "Response: $response" | jq .

# Get hosts again to verify addition
echo "📋 Getting hosts after addition..."
response=$(api_request "GET" "/nqns/$TEST_NQN/hosts" "" "$TOKEN")
echo "Response: $response" | jq .

# Try to add duplicate host (should fail)
echo "❌ Trying to add duplicate host (should fail)..."
response=$(api_request "POST" "/nqns/$TEST_NQN/hosts" "$host_data" "$TOKEN")
echo "Response: $response" | jq .

# Delete the host
echo "🗑️ Deleting host..."
response=$(api_request "DELETE" "/nqns/$TEST_NQN/hosts/$TEST_HOST_NQN" "" "$TOKEN")
echo "Response: $response" | jq .

# Get hosts after deletion
echo "📋 Getting hosts after deletion..."
response=$(api_request "GET" "/nqns/$TEST_NQN/hosts" "" "$TOKEN")
echo "Response: $response" | jq .

echo ""
echo "==============================================="
echo "3. Testing Error Cases"
echo "==============================================="

# Test with non-existent subsystem
FAKE_NQN="nqn.2016-06.io.spdk:nonexistent"

echo "❌ Testing with non-existent subsystem..."
response=$(api_request "GET" "/nqns/$FAKE_NQN/listeners" "" "$TOKEN")
echo "Response: $response" | jq .

# Test with invalid listener data
echo "❌ Testing with invalid listener data..."
invalid_listener_data='{
    "trtype": "INVALID",
    "traddr": "invalid-ip",
    "trsvcid": "invalid-port"
}'
response=$(api_request "POST" "/nqns/$TEST_NQN/listeners" "$invalid_listener_data" "$TOKEN")
echo "Response: $response" | jq .

# Test with invalid host NQN
echo "❌ Testing with invalid host NQN..."
invalid_host_data='{
    "host_nqn": "invalid-nqn-format"
}'
response=$(api_request "POST" "/nqns/$TEST_NQN/hosts" "$invalid_host_data" "$TOKEN")
echo "Response: $response" | jq .

echo ""
echo "==============================================="
echo "✅ Test Complete!"
echo "==============================================="
echo "All API endpoints have been tested."
echo "Check the responses above for verification." 