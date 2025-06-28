/**
 * NQN生成器工具
 * 基于NVMe规范生成合法的NQN (NVMe Qualified Name)
 */

/**
 * 生成随机字符串
 * @param {number} length 长度
 * @param {string} charset 字符集
 * @returns {string} 随机字符串
 */
function generateRandomString(length, charset = 'abcdefghijklmnopqrstuvwxyz0123456789') {
  let result = ''
  for (let i = 0; i < length; i++) {
    result += charset.charAt(Math.floor(Math.random() * charset.length))
  }
  return result
}

/**
 * 生成UUID格式的字符串
 * @returns {string} UUID字符串 (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
 */
function generateUUID() {
  const hexChars = '0123456789abcdef'
  const sections = [8, 4, 4, 4, 12]
  
  return sections.map(length => generateRandomString(length, hexChars)).join('-')
}

/**
 * 获取当前年月格式 (yyyy-mm)
 * @returns {string} 年月字符串
 */
function getCurrentYearMonth() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

/**
 * 生成域名格式的NQN
 * 格式: nqn.yyyy-mm.reverse-domain:identifier
 * @param {Object} options 选项
 * @param {string} options.domain 域名 (如 'io.spdk')
 * @param {string} options.identifier 标识符
 * @param {string} options.yearMonth 年月 (可选，默认当前年月)
 * @returns {string} NQN字符串
 */
export function generateDomainNQN(options = {}) {
  const {
    domain = 'io.spdk',
    identifier = null,
    yearMonth = null
  } = options
  
  const actualYearMonth = yearMonth || getCurrentYearMonth()
  const actualIdentifier = identifier || `cnode-${generateRandomString(10, '0123456789')}`
  
  return `nqn.${actualYearMonth}.${domain}:${actualIdentifier}`
}

/**
 * 生成UUID格式的NQN
 * 格式: nqn.2014-08.org.nvmexpress:uuid:<uuid>
 * @returns {string} NQN字符串
 */
export function generateUuidNQN() {
  const uuid = generateUUID()
  return `nqn.2014-08.org.nvmexpress:uuid:${uuid}`
}

/**
 * 生成Discovery NQN
 * @returns {string} Discovery NQN
 */
export function generateDiscoveryNQN() {
  return 'nqn.2014-08.org.nvmexpress.discovery'
}

/**
 * 生成简单的域名格式NQN（使用默认参数）
 * @param {string} prefix 前缀 (可选)
 * @returns {string} NQN字符串
 */
export function generateSimpleNQN(prefix = 'test') {
  return generateDomainNQN({
    domain: 'io.spdk',
    identifier: `${prefix}-${generateRandomString(10, '0123456789')}`
  })
}

/**
 * 验证NQN格式是否合法（基础验证）
 * @param {string} nqn NQN字符串
 * @returns {boolean} 是否合法
 */
export function validateNQN(nqn) {
  if (!nqn || typeof nqn !== 'string') {
    return false
  }
  
  // 检查长度
  if (nqn.length > 223) {
    return false
  }
  
  // Discovery NQN
  if (nqn === 'nqn.2014-08.org.nvmexpress.discovery') {
    return true
  }
  
  // UUID格式 NQN
  const uuidPattern = /^nqn\.2014-08\.org\.nvmexpress:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (uuidPattern.test(nqn)) {
    return true
  }
  
  // 域名格式 NQN
  const domainPattern = /^nqn\.\d{4}-\d{2}\.[\w\-\.]+:[\w\-\.]+$/
  if (domainPattern.test(nqn)) {
    return true
  }
  
  return false
}

/**
 * 获取NQN生成选项列表
 * @returns {Array} 选项列表
 */
export function getNQNGeneratorOptions() {
  return [
    {
      label: '简单NQN',
      description: '生成简单的域名格式NQN，适合测试使用',
      type: 'simple',
      generator: () => generateSimpleNQN()
    },
    {
      label: 'UUID格式NQN',
      description: '基于UUID的标准NQN格式',
      type: 'uuid',
      generator: () => generateUuidNQN()
    },
    {
      label: '自定义域名NQN',
      description: '生成自定义域名和标识符的NQN',
      type: 'custom',
      generator: (options) => generateDomainNQN(options)
    },
    {
      label: 'Discovery NQN',
      description: 'NVMe-oF Discovery子系统专用NQN',
      type: 'discovery',
      generator: () => generateDiscoveryNQN()
    }
  ]
}

export default {
  generateDomainNQN,
  generateUuidNQN,
  generateDiscoveryNQN,
  generateSimpleNQN,
  validateNQN,
  getNQNGeneratorOptions
} 