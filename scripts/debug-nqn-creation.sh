#!/bin/bash

# SPDK NQN 创建问题诊断脚本

BASE_URL="http://localhost:3000/api"
USERNAME="admin"
PASSWORD="admin123"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "========================================"
echo "SPDK NQN Creation Debug Script"
echo "========================================"

# 1. 登录获取token
echo -e "\n${YELLOW}1. Logging in...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{
        \"username\": \"$USERNAME\",
        \"password\": \"$PASSWORD\"
    }")

TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.token // empty')

if [ -z "$TOKEN" ]; then
    echo -e "${RED}Login failed!${NC}"
    echo "Response: $LOGIN_RESPONSE"
    exit 1
fi

echo -e "${GREEN}Login successful!${NC}"

# 2. 检查当前的 subsystems 和 transports
echo -e "\n${YELLOW}2. Checking current subsystems...${NC}"
SUBSYSTEMS_RESPONSE=$(curl -s -X GET "$BASE_URL/nqns" \
    -H "Authorization: Bearer $TOKEN")

echo -e "${BLUE}Current subsystems:${NC}"
echo $SUBSYSTEMS_RESPONSE | jq '.subsystems | length'
echo $SUBSYSTEMS_RESPONSE | jq '.subsystems[].nqn'

# 3. 测试错误的 NQN 格式
echo -e "\n${YELLOW}3. Testing invalid NQN format (user's original)...${NC}"
INVALID_RESPONSE=$(curl -s -X POST "$BASE_URL/nqns" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
        \"nqn\": \"nqn.2016-06.io.spd2:dsadasdd\",
        \"transport_type\": \"tcp\",
        \"target_address\": \"10.13.16.50\",
        \"target_port\": 2121
    }")

echo -e "${BLUE}Invalid NQN Response:${NC} $INVALID_RESPONSE"

# 4. 测试正确的 NQN 格式
echo -e "\n${YELLOW}4. Testing correct NQN format...${NC}"
CORRECT_NQN="nqn.2016-06.io.spdk:test-$(date +%s)"
CORRECT_RESPONSE=$(curl -s -X POST "$BASE_URL/nqns" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
        \"nqn\": \"$CORRECT_NQN\",
        \"allow_any_host\": false,
        \"transport_type\": \"tcp\",
        \"target_address\": \"10.13.16.50\",
        \"target_port\": 2121
    }")

echo -e "${BLUE}Correct NQN Response:${NC} $CORRECT_RESPONSE"

if echo "$CORRECT_RESPONSE" | jq -e '.message' | grep -q "created successfully"; then
    echo -e "${GREEN}✅ Subsystem created successfully!${NC}"
    
    # 5. 清理测试数据
    echo -e "\n${YELLOW}5. Cleaning up test subsystem...${NC}"
    ENCODED_NQN=$(echo "$CORRECT_NQN" | sed 's/:/%3A/g')
    DELETE_RESPONSE=$(curl -s -X DELETE "$BASE_URL/nqns/$ENCODED_NQN" \
        -H "Authorization: Bearer $TOKEN")
    echo -e "${BLUE}Delete Response:${NC} $DELETE_RESPONSE"
else
    echo -e "${RED}❌ Subsystem creation failed${NC}"
fi

# 6. 测试最小参数创建
echo -e "\n${YELLOW}6. Testing minimal parameters...${NC}"
MINIMAL_NQN="nqn.2016-06.io.spdk:minimal-$(date +%s)"
MINIMAL_RESPONSE=$(curl -s -X POST "$BASE_URL/nqns" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
        \"nqn\": \"$MINIMAL_NQN\"
    }")

echo -e "${BLUE}Minimal Parameters Response:${NC} $MINIMAL_RESPONSE"

if echo "$MINIMAL_RESPONSE" | jq -e '.message' | grep -q "created successfully"; then
    echo -e "${GREEN}✅ Minimal subsystem created successfully!${NC}"
    
    # 清理
    ENCODED_MINIMAL_NQN=$(echo "$MINIMAL_NQN" | sed 's/:/%3A/g')
    curl -s -X DELETE "$BASE_URL/nqns/$ENCODED_MINIMAL_NQN" \
        -H "Authorization: Bearer $TOKEN" > /dev/null
else
    echo -e "${RED}❌ Minimal subsystem creation failed${NC}"
fi

echo -e "\n${GREEN}Debug completed!${NC}"
echo "========================================" 