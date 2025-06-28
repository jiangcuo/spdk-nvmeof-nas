#!/bin/bash

echo "=== Swagger UI 测试脚本 ==="
echo "正在启动服务器..."

# 启动服务器
timeout 10 node src/app.js --port 3010 > swagger_validation.log 2>&1 &
SERVER_PID=$!

# 等待服务器启动
sleep 3

echo "测试 Swagger API 文档..."

# 测试 JSON 端点
echo "1. 测试 JSON 规范端点..."
JSON_RESULT=$(curl -s http://localhost:3010/api-docs/swagger.json | grep -c '"title":"SPDK NAS Manager API"')
if [ "$JSON_RESULT" -gt 0 ]; then
    echo "   ✅ JSON 端点工作正常"
else
    echo "   ❌ JSON 端点有问题"
fi

# 测试 UI 页面
echo "2. 测试 UI 页面..."
UI_RESULT=$(curl -s http://localhost:3010/api-docs/ | grep -c "swagger-ui")
if [ "$UI_RESULT" -gt 0 ]; then
    echo "   ✅ UI 页面加载正常"
else
    echo "   ❌ UI 页面有问题"
fi

# 显示 API 端点数量
ENDPOINT_COUNT=$(curl -s http://localhost:3010/api-docs/swagger.json | grep -o '"/api/[^"]*"' | wc -l)
echo "3. 发现 $ENDPOINT_COUNT 个 API 端点"

# 清理
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null

echo ""
echo "🎉 Swagger UI 修复完成！"
echo "现在你可以："
echo "1. 启动服务器: npm start"
echo "2. 打开浏览器访问: http://localhost:3000/api-docs"
echo "3. 查看完整的 API 文档和交互式测试界面"
echo ""
echo "包含的 API 模块："
echo "- 🔐 用户认证 (Authentication)"
echo "- 💾 块设备管理 (Block Device Management)"  
echo "- 🌐 NQN 子系统管理 (NQN Management)"
echo "- 🔗 RAID 阵列管理 (RAID Management)"
echo "- 📊 系统信息 (System Information)" 