<template>
  <div class="verification-code">
    <div class="code-display" ref="codeCanvas" @click="generateCode">
      <canvas 
        ref="canvas" 
        :width="120" 
        :height="40"
        class="code-canvas"
      ></canvas>
    </div>
    <div class="code-input">
      <el-input
        v-model="inputValue"
        placeholder="请输入验证码"
        maxlength="4"
        @input="handleInput"
        @keyup.enter="verify"
      />
    </div>
    <div class="code-actions">
      <el-button size="small" @click="generateCode">刷新</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:modelValue', 'verify'])

const canvas = ref(null)
const codeCanvas = ref(null)
const currentCode = ref('')
const inputValue = ref('')

// 生成随机验证码
const generateRandomCode = () => {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnprstuvwxyz23456789'
  let code = ''
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

// 在画布上绘制验证码
const drawCode = (code) => {
  const ctx = canvas.value.getContext('2d')
  
  // 清除画布
  ctx.clearRect(0, 0, 120, 40)
  
  // 设置背景
  ctx.fillStyle = '#f5f5f5'
  ctx.fillRect(0, 0, 120, 40)
  
  // 添加噪点
  for (let i = 0; i < 50; i++) {
    ctx.fillStyle = `rgb(${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)})`
    ctx.fillRect(Math.random() * 120, Math.random() * 40, 1, 1)
  }
  
  // 绘制验证码字符
  ctx.font = '18px Arial'
  ctx.textBaseline = 'middle'
  
  for (let i = 0; i < code.length; i++) {
    const char = code[i]
    const x = 15 + i * 25
    const y = 20 + (Math.random() - 0.5) * 8 // 添加随机偏移
    const angle = (Math.random() - 0.5) * 0.3 // 添加随机旋转
    
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)
    
    // 随机颜色
    const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c']
    ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)]
    
    ctx.fillText(char, 0, 0)
    ctx.restore()
  }
  
  // 添加干扰线
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = `rgb(${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)})`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(Math.random() * 120, Math.random() * 40)
    ctx.lineTo(Math.random() * 120, Math.random() * 40)
    ctx.stroke()
  }
}

// 生成新验证码
const generateCode = () => {
  currentCode.value = generateRandomCode()
  drawCode(currentCode.value)
}

// 处理输入
const handleInput = (value) => {
  inputValue.value = value.toUpperCase()
  emit('update:modelValue', inputValue.value)
}

// 验证
const verify = () => {
  const isValid = inputValue.value.toUpperCase() === currentCode.value.toUpperCase()
  emit('verify', isValid)
  return isValid
}

// 暴露验证方法
defineExpose({
  verify,
  generateCode,
  getCurrentCode: () => currentCode.value
})

// 组件挂载时生成验证码
onMounted(() => {
  generateCode()
})

// 监听外部值变化
watch(() => props.modelValue, (newVal) => {
  if (newVal !== inputValue.value) {
    inputValue.value = newVal
  }
})
</script>

<style scoped>
.verification-code {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.code-display {
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  cursor: pointer;
  transition: border-color 0.3s;
}

.code-display:hover {
  border-color: #409eff;
}

.code-canvas {
  display: block;
  border-radius: 4px;
}

.code-input {
  flex: 1;
  min-width: 120px;
}

.code-actions {
  display: flex;
  gap: 8px;
}

@media (max-width: 600px) {
  .verification-code {
    flex-direction: column;
    align-items: stretch;
  }
  
  .code-input {
    min-width: auto;
  }
}
</style> 