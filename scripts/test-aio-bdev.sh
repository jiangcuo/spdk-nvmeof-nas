#!/bin/bash

# SPDK AIO Bdev 和 NVMe Detach 功能测试脚本

BASE_URL="http://localhost:3000/api"
USERNAME="admin"
PASSWORD="admin123"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=================================="
echo "SPDK AIO Bdev & NVMe Detach Test"
echo "=================================="

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

# 2. 创建测试文件 (模拟 AIO 文件)
echo -e "\n${YELLOW}2. Creating test file for AIO bdev...${NC}"
TEST_FILE="/tmp/test_aio_file.img"
dd if=/dev/zero of="$TEST_FILE" bs=1M count=100 2>/dev/null
if [ $? -eq 0 ]; then
    echo -e "${GREEN}Test file created: $TEST_FILE (100MB)${NC}"
else
    echo -e "${RED}Failed to create test file${NC}"
    exit 1
fi

# 3. 创建 AIO bdev (使用时间戳确保唯一性)
TIMESTAMP=$(date +%s)
AIO_BDEV_NAME="test_aio_bdev_$TIMESTAMP"

echo -e "\n${YELLOW}3. Creating AIO bdev: $AIO_BDEV_NAME...${NC}"
AIO_RESPONSE=$(curl -s -X POST "$BASE_URL/bdevs/aio" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
        \"name\": \"$AIO_BDEV_NAME\",
        \"filename\": \"$TEST_FILE\",
        \"block_size\": 512
    }")

echo "Response: $AIO_RESPONSE"

if echo "$AIO_RESPONSE" | jq -e '.message' | grep -q "created successfully"; then
    echo -e "${GREEN}AIO bdev created successfully!${NC}"
else
    echo -e "${RED}AIO bdev creation failed${NC}"
fi

# 4. 列出所有 bdevs (验证创建的 AIO bdev)
echo -e "\n${YELLOW}4. Listing all bdevs...${NC}"
BDEVS_RESPONSE=$(curl -s -X GET "$BASE_URL/bdevs" \
    -H "Authorization: Bearer $TOKEN")

echo "Response: $BDEVS_RESPONSE"

# 5. 删除 AIO bdev
echo -e "\n${YELLOW}5. Deleting AIO bdev: $AIO_BDEV_NAME...${NC}"
DELETE_AIO_RESPONSE=$(curl -s -X DELETE "$BASE_URL/bdevs/aio/$AIO_BDEV_NAME" \
    -H "Authorization: Bearer $TOKEN")

echo "Response: $DELETE_AIO_RESPONSE"

if echo "$DELETE_AIO_RESPONSE" | jq -e '.message' | grep -q "deleted successfully"; then
    echo -e "${GREEN}AIO bdev deleted successfully!${NC}"
else
    echo -e "${RED}AIO bdev deletion failed${NC}"
fi

# 6. 测试 NVMe detach (这个会失败，因为没有实际的 NVMe 控制器)
echo -e "\n${YELLOW}6. Testing NVMe detach (expected to fail without real NVMe)...${NC}"
DETACH_RESPONSE=$(curl -s -X POST "$BASE_URL/bdevs/nvme/test_nvme/detach" \
    -H "Authorization: Bearer $TOKEN")

echo "Response: $DETACH_RESPONSE"

# 7. 清理测试文件
echo -e "\n${YELLOW}7. Cleaning up test file...${NC}"
rm -f "$TEST_FILE"
echo -e "${GREEN}Test file cleaned up${NC}"

echo -e "\n${YELLOW}8. Health check...${NC}"
HEALTH_RESPONSE=$(curl -s -X GET "$BASE_URL/system/health" \
    -H "Authorization: Bearer $TOKEN")

echo "Response: $HEALTH_RESPONSE"

echo -e "\n${GREEN}Test completed!${NC}"
echo "==================================" 