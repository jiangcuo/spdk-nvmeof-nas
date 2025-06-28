import { api } from '@/services/api'

export const nvmeDiscoveryAPI = {
  // Discover NVMe devices
  discover() {
    return api.get('/nvme/discover')
  },

  // Get NVMe devices summary
  getSummary() {
    return api.get('/nvme/discover/summary')
  }
} 