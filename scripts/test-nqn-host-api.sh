#!/bin/bash

# SPDK NQN 和 Host 管理 API 测试脚本

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
echo "SPDK NQN & Host Management API Test"
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

# 2. 列出所有 subsystems
echo -e "\n${YELLOW}2. Listing all NVMe-oF subsystems...${NC}"
SUBSYSTEMS_RESPONSE=$(curl -s -X GET "$BASE_URL/nqns" \
    -H "Authorization: Bearer $TOKEN")

echo -e "${BLUE}Response:${NC} $SUBSYSTEMS_RESPONSE"
echo

# 3. 创建新的 subsystem
TEST_NQN="nqn.2024-06.io.spdk.test:cnode-$(date +%s)"
echo -e "\n${YELLOW}3. Creating new NVMe-oF subsystem: $TEST_NQN...${NC}"
CREATE_RESPONSE=$(curl -s -X POST "$BASE_URL/nqns" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
        \"nqn\": \"$TEST_NQN\",
        \"allow_any_host\": false,
        \"serial_number\": \"TEST123\",
        \"model_number\": \"SPDK Test\"
    }")

echo -e "${BLUE}Response:${NC} $CREATE_RESPONSE"

if echo "$CREATE_RESPONSE" | jq -e '.message' | grep -q "created successfully"; then
    echo -e "${GREEN}Subsystem created successfully!${NC}"
else
    echo -e "${RED}Subsystem creation failed${NC}"
fi

# 4. 查询特定的 subsystem
echo -e "\n${YELLOW}4. Getting subsystem details: $TEST_NQN...${NC}"
# URL encode the NQN for the path parameter
ENCODED_NQN=$(echo "$TEST_NQN" | sed 's/:/%3A/g')
GET_RESPONSE=$(curl -s -X GET "$BASE_URL/nqns/$ENCODED_NQN" \
    -H "Authorization: Bearer $TOKEN")

echo -e "${BLUE}Response:${NC} $GET_RESPONSE"

# 5. 获取 subsystem 的 hosts
echo -e "\n${YELLOW}5. Getting hosts for subsystem: $TEST_NQN...${NC}"
HOSTS_RESPONSE=$(curl -s -X GET "$BASE_URL/nqns/$ENCODED_NQN/hosts" \
    -H "Authorization: Bearer $TOKEN")

echo -e "${BLUE}Response:${NC} $HOSTS_RESPONSE"

# 6. 添加 host 到 subsystem
TEST_HOST_NQN="nqn.2014-08.org.nvmexpress:uuid:$(uuidgen)"
echo -e "\n${YELLOW}6. Adding host to subsystem: $TEST_HOST_NQN...${NC}"
ADD_HOST_RESPONSE=$(curl -s -X POST "$BASE_URL/nqns/$ENCODED_NQN/hosts" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
        \"host_nqn\": \"$TEST_HOST_NQN\"
    }")

echo -e "${BLUE}Response:${NC} $ADD_HOST_RESPONSE"

if echo "$ADD_HOST_RESPONSE" | jq -e '.message' | grep -q "added successfully"; then
    echo -e "${GREEN}Host added successfully!${NC}"
else
    echo -e "${RED}Host addition failed${NC}"
fi

# 7. 再次获取 hosts 列表以验证
echo -e "\n${YELLOW}7. Verifying hosts list after addition...${NC}"
HOSTS_AFTER_RESPONSE=$(curl -s -X GET "$BASE_URL/nqns/$ENCODED_NQN/hosts" \
    -H "Authorization: Bearer $TOKEN")

echo -e "${BLUE}Response:${NC} $HOSTS_AFTER_RESPONSE"

# 8. 删除 host
ENCODED_HOST_NQN=$(echo "$TEST_HOST_NQN" | sed 's/:/%3A/g')
echo -e "\n${YELLOW}8. Removing host from subsystem: $TEST_HOST_NQN...${NC}"
REMOVE_HOST_RESPONSE=$(curl -s -X DELETE "$BASE_URL/nqns/$ENCODED_NQN/hosts/$ENCODED_HOST_NQN" \
    -H "Authorization: Bearer $TOKEN")

echo -e "${BLUE}Response:${NC} $REMOVE_HOST_RESPONSE"

if echo "$REMOVE_HOST_RESPONSE" | jq -e '.message' | grep -q "removed successfully"; then
    echo -e "${GREEN}Host removed successfully!${NC}"
else
    echo -e "${RED}Host removal failed${NC}"
fi

# 9. 删除 subsystem
echo -e "\n${YELLOW}9. Deleting subsystem: $TEST_NQN...${NC}"
DELETE_RESPONSE=$(curl -s -X DELETE "$BASE_URL/nqns/$ENCODED_NQN" \
    -H "Authorization: Bearer $TOKEN")

echo -e "${BLUE}Response:${NC} $DELETE_RESPONSE"

if echo "$DELETE_RESPONSE" | jq -e '.message' | grep -q "deleted successfully"; then
    echo -e "${GREEN}Subsystem deleted successfully!${NC}"
else
    echo -e "${RED}Subsystem deletion failed${NC}"
fi

# 10. 系统健康检查
echo -e "\n${YELLOW}10. Health check...${NC}"
HEALTH_RESPONSE=$(curl -s -X GET "$BASE_URL/system/health" \
    -H "Authorization: Bearer $TOKEN")

echo -e "${BLUE}Response:${NC} $HEALTH_RESPONSE"

echo -e "\n${GREEN}Test completed!${NC}"
echo "========================================" 