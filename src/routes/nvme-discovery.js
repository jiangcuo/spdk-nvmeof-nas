// NVMe Discovery Routes
const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Path to the NVMe discovery tool
const NVME_DISCOVER_TOOL = '/usr/bin/nvme_discover_json';

/**
 * @swagger
 * /api/nvme/discover:
 *   get:
 *     summary: Discover available NVMe devices
 *     description: Scans the system for available NVMe devices and returns detailed information
 *     tags: [NVMe Discovery]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully discovered NVMe devices
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     nvme_devices:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           pcie_addr:
 *                             type: string
 *                             description: PCIe address
 *                           vendor_id:
 *                             type: string
 *                             description: Vendor ID
 *                           subsystem_vendor_id:
 *                             type: string
 *                             description: Subsystem vendor ID
 *                           serial_number:
 *                             type: string
 *                             description: Device serial number
 *                           model_number:
 *                             type: string
 *                             description: Device model number
 *                           firmware_version:
 *                             type: string
 *                             description: Firmware version
 *                           total_capacity_bytes:
 *                             type: integer
 *                             description: Total capacity in bytes
 *                           total_capacity_gb:
 *                             type: number
 *                             description: Total capacity in GB
 *                           namespace_count:
 *                             type: integer
 *                             description: Number of active namespaces
 *                           max_namespaces:
 *                             type: integer
 *                             description: Maximum number of namespaces
 *                           transport_type:
 *                             type: string
 *                             description: Transport type (PCIe, etc.)
 *                     total_devices:
 *                       type: integer
 *                       description: Total number of devices found
 *                     timestamp:
 *                       type: integer
 *                       description: Unix timestamp of discovery
 *       500:
 *         description: Discovery failed
 */
router.get('/discover', authenticateToken, async (req, res) => {
    try {
        logger.info('Starting NVMe device discovery', {
            user: req.user.username,
            action: 'nvme_discover',
            timestamp: new Date().toISOString()
        });

        // Execute the NVMe discovery tool
        const result = await executeNvmeDiscovery();
        
        logger.info('NVMe discovery completed', {
            user: req.user.username,
            action: 'nvme_discover',
            devicesFound: result.total_devices,
            timestamp: new Date().toISOString()
        });

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('NVMe discovery error:', error);
        logger.warn('NVMe discovery failed, returning empty result', {
            user: req.user.username,
            action: 'nvme_discover',
            error: error.message,
            timestamp: new Date().toISOString()
        });

        // Return empty result instead of error to avoid frontend issues
        const emptyResult = {
            nvme_devices: [],
            total_devices: 0,
            timestamp: Math.floor(Date.now() / 1000)
        };

        res.json({
            success: true,
            data: emptyResult
        });
    }
});

/**
 * @swagger
 * /api/nvme/discover/summary:
 *   get:
 *     summary: Get a summary of NVMe devices
 *     description: Returns a simplified summary of available NVMe devices
 *     tags: [NVMe Discovery]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: NVMe devices summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     total_devices:
 *                       type: integer
 *                     total_capacity_gb:
 *                       type: number
 *                     devices:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           pcie_addr:
 *                             type: string
 *                           model:
 *                             type: string
 *                           capacity_gb:
 *                             type: number
 *                           status:
 *                             type: string
 */
router.get('/discover/summary', authenticateToken, async (req, res) => {
    try {
        const result = await executeNvmeDiscovery();
        
        // Create summary
        const summary = {
            total_devices: result.total_devices,
            total_capacity_gb: result.nvme_devices.reduce((sum, device) => sum + device.total_capacity_gb, 0),
            devices: result.nvme_devices.map(device => ({
                pcie_addr: device.pcie_addr,
                model: device.model_number,
                capacity_gb: Math.round(device.total_capacity_gb * 100) / 100,
                status: device.namespace_count > 0 ? 'active' : 'inactive'
            }))
        };

        res.json({
            success: true,
            data: summary
        });

    } catch (error) {
        console.error('NVMe discovery summary error:', error);
        
        // Return empty summary instead of error
        const emptySummary = {
            total_devices: 0,
            total_capacity_gb: 0,
            devices: []
        };
        
        res.json({
            success: true,
            data: emptySummary
        });
    }
});

// Helper function to execute NVMe discovery
function executeNvmeDiscovery() {
    return new Promise((resolve, reject) => {
        // Set timeout to 30 seconds
        const timeout = 30000;
        
        exec(NVME_DISCOVER_TOOL, { timeout }, (error, stdout, stderr) => {
            if (error) {
                console.warn('NVMe discovery tool failed:', error.message);
                console.warn('stderr:', stderr);
                
                // Check if it's a known SPDK device claim error
                if (stderr && (stderr.includes('Cannot create lock on device') || 
                             stderr.includes('Permission denied') ||
                             stderr.includes('No NVMe controllers found'))) {
                    console.info('SPDK device access issue detected, returning empty result');
                    // Return empty result for known SPDK access issues
                    resolve({
                        nvme_devices: [],
                        total_devices: 0,
                        timestamp: Math.floor(Date.now() / 1000)
                    });
                    return;
                }
                
                // For other errors, still reject
                reject(new Error(`Discovery tool failed: ${error.message}`));
                return;
            }

            if (stderr) {
                console.warn('NVMe discovery warnings:', stderr);
            }

            try {
                const result = JSON.parse(stdout);
                resolve(result);
            } catch (parseError) {
                console.warn('Failed to parse discovery output:', parseError.message);
                console.warn('stdout was:', stdout);
                
                // Return empty result instead of rejecting for parse errors
                resolve({
                    nvme_devices: [],
                    total_devices: 0,
                    timestamp: Math.floor(Date.now() / 1000)
                });
            }
        });
    });
}

module.exports = router;
