const Joi = require('joi');
const logger = require('../utils/logger');

/**
 * 通用验证中间件
 */
const validate = (schema, property = 'body') => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req[property], {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            const errors = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message
            }));

            logger.warn('Validation error:', { errors, data: req[property] });

            return res.status(400).json({
                error: 'Validation failed',
                message: 'The request data is invalid',
                details: errors
            });
        }

        // 将验证后的数据替换原始数据
        req[property] = value;
        next();
    };
};

// ========== 用户相关验证模式 ==========

const userSchemas = {
    register: Joi.object({
        username: Joi.string().alphanum().min(3).max(30).required(),
        email: Joi.string().email().required(),
        password: Joi.string().min(6).required(),
        role: Joi.string().valid('admin', 'user').default('user')
    }),

    login: Joi.object({
        username: Joi.string().required(),
        password: Joi.string().required()
    }),

    updateProfile: Joi.object({
        email: Joi.string().email(),
        password: Joi.string().min(6)
    }).min(1),

    changePassword: Joi.object({
        currentPassword: Joi.string().required().messages({
            'any.required': '请输入当前密码',
            'string.empty': '当前密码不能为空'
        }),
        newPassword: Joi.string().min(6).required().messages({
            'any.required': '请输入新密码',
            'string.min': '新密码至少需要6个字符',
            'string.empty': '新密码不能为空'
        }),
        confirmPassword: Joi.string().required().valid(Joi.ref('newPassword')).messages({
            'any.required': '请确认新密码',
            'any.only': '确认密码与新密码不匹配',
            'string.empty': '确认密码不能为空'
        })
    })
};

// ========== NQN相关验证模式 ==========

const nqnSchemas = {
    create: Joi.object({
        nqn: Joi.string().pattern(/^nqn\.\d{4}-\d{2}\.[\w\-\.]+:[\w\-\.]+/).required()
            .messages({
                'string.pattern.base': 'NQN must follow the format: nqn.yyyy-mm.reverse-domain:identifier (e.g., nqn.2016-06.io.spdk:cnode1)'
            }),
        serial_number: Joi.string().max(50).optional(),
        model_number: Joi.string().max(50).optional(),
        allow_any_host: Joi.boolean().default(false),
        transport_type: Joi.string().valid('tcp', 'rdma', 'fc').default('tcp'),
        target_address: Joi.string().ip().optional(),
        target_port: Joi.number().integer().min(1).max(65535).optional()
    }),

    update: Joi.object({
        subsystem_name: Joi.string().min(1).max(100),
        serial_number: Joi.string().max(50).allow(''),
        model_number: Joi.string().max(50).allow(''),
        max_namespaces: Joi.number().integer().min(1).max(1024),
        allow_any_host: Joi.boolean(),
        transport_type: Joi.string().valid('tcp', 'rdma', 'fc'),
        target_address: Joi.string().ip().allow(''),
        target_port: Joi.number().integer().min(1).max(65535)
    }).min(1),

    addNamespace: Joi.object({
        namespace_id: Joi.number().integer().min(1).required(),
        bdev_name: Joi.string().min(1).required(),
        uuid: Joi.string().uuid().optional()
    }),

    addListener: Joi.object({
        trtype: Joi.string().valid('TCP', 'RDMA', 'FC').required(),
        traddr: Joi.string().ip().required(),
        trsvcid: Joi.alternatives().try(
            Joi.string(),
            Joi.number().integer().min(1).max(65535)
        ).required(),
        adrfam: Joi.string().valid('ipv4', 'ipv6', 'ib', 'fc').default('ipv4')
    }),

    addHost: Joi.object({
        host_nqn: Joi.string().pattern(/^nqn\.\d{4}-\d{2}\.[\w\-\.]+:[\w\-\.]+/).required()
            .messages({
                'string.pattern.base': 'Host NQN must follow the format: nqn.yyyy-mm.reverse-domain:identifier'
            })
    })
};

// LV Store validation schemas
const lvstoreSchemas = {
    create: Joi.object({
        bdev_name: Joi.string().min(1).required(),
        lvs_name: Joi.string().min(1).required(),
        cluster_sz: Joi.number().integer().positive().optional()
    }),

    rename: Joi.object({
        old_name: Joi.string().min(1).required(),
        new_name: Joi.string().min(1).required()
    }),

    grow: Joi.object({
        uuid: Joi.string().uuid().required()
    }),

    delete: Joi.object({
        uuid: Joi.string().uuid().required()
    })
};

// LVol validation schemas
const lvolSchemas = {
    create: Joi.object({
        uuid: Joi.string().uuid().required(),
        lvol_name: Joi.string().min(1).required(),
        size_in_mib: Joi.number().integer().positive().required(),
        thin_provision: Joi.boolean().default(true),
        clear_method: Joi.string().valid('none', 'unmap', 'write_zeroes').optional()
    }),

    snapshot: Joi.object({
        lvol_name: Joi.string().min(1).required(),
        snapshot_name: Joi.string().min(1).required()
    }),

    clone: Joi.object({
        snapshot_name: Joi.string().min(1).required(),
        clone_name: Joi.string().min(1).required()
    }),

    cloneBdev: Joi.object({
        bdev_name: Joi.string().min(1).required(),
        lvol_name: Joi.string().min(1).required(),
        lvol_store_uuid: Joi.string().uuid().required()
    }),

    rename: Joi.object({
        old_name: Joi.string().min(1).required(),
        new_name: Joi.string().min(1).required()
    }),

    inflate: Joi.object({
        name: Joi.string().min(1).required()
    }),

    decouple: Joi.object({
        name: Joi.string().min(1).required()
    }),

    resize: Joi.object({
        name: Joi.string().min(1).required(),
        size: Joi.number().integer().positive().required()
    }),

    setReadOnly: Joi.object({
        name: Joi.string().min(1).required()
    }),

    delete: Joi.object({
        name: Joi.string().min(1).required()
    }),

    shallowCopy: Joi.object({
        src_lvol_name: Joi.string().min(1).required(),
        dst_bdev_name: Joi.string().min(1).required()
    }),

    checkShallowCopy: Joi.object({
        name: Joi.string().min(1).required()
    }),

    setParent: Joi.object({
        name: Joi.string().min(1).required(),
        parent_name: Joi.string().min(1).required()
    }),

    setParentBdev: Joi.object({
        name: Joi.string().min(1).required(),
        parent_bdev_name: Joi.string().min(1).required()
    })
};

// ========== Bdev相关验证模式 ==========

const bdevSchemas = {
    attachNvme: Joi.object({
        name: Joi.string().min(1).required(),
        trtype: Joi.string().valid('pcie', 'tcp', 'rdma', 'fc').required(),
        traddr: Joi.string().required(),
        adrfam: Joi.string().valid('ipv4', 'ipv6', 'ib', 'fc').optional(),
        trsvcid: Joi.string().optional()
    }),

    createMalloc: Joi.object({
        name: Joi.string().min(1).required(),
        num_blocks: Joi.number().integer().min(1).required(),
        block_size: Joi.number().integer().valid(512, 1024, 2048, 4096).default(512)
    }),

    createAio: Joi.object({
        name: Joi.string().min(1).required(),
        filename: Joi.string().min(1).required(),
        block_size: Joi.number().integer().valid(512, 1024, 2048, 4096).default(512)
    })
};

// ========== RAID相关验证模式 ==========

const raidSchemas = {
    create: Joi.object({
        name: Joi.string().min(1).required(),
        raid_level: Joi.string().valid('raid0', 'raid1', 'raid5f', 'concat').required(),
        base_bdevs: Joi.array().items(Joi.string().min(1)).min(1).required(),
        strip_size: Joi.number().integer().min(1).optional()
    }),

    addBaseBdev: Joi.object({
        raid_bdev: Joi.string().min(1).required(),
        base_bdev: Joi.string().min(1).required()
    }),

    removeBaseBdev: Joi.object({
        raid_bdev: Joi.string().min(1).required(),
        base_bdev: Joi.string().min(1).required()
    })
};

// ========== 系统配置验证模式 ==========

const systemSchemas = {
    spdkConfig: Joi.object({
        socket_path: Joi.string().min(1).required(),
        timeout: Joi.number().integer().min(1000).max(120000).optional()
    })
};

// ========== 物理磁盘相关验证模式 ==========

const diskSchemas = {
    getDiskInfo: Joi.object({
        device_name: Joi.string().min(1).required()
    }),

    getDiskHealth: Joi.object({
        device_name: Joi.string().min(1).required()
    }),

    getDiskSmart: Joi.object({
        device_name: Joi.string().min(1).required()
    })
};

module.exports = {
    validate,
    userSchemas,
    nqnSchemas,
    bdevSchemas,
    raidSchemas,
    systemSchemas,
    lvstoreSchemas,
    lvolSchemas,
    diskSchemas
}; 