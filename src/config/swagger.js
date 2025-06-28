const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'SPDK NAS Manager API',
            version: '1.0.0',
            description: 'RESTful API for managing SPDK NVMe-oF, RAID, and block device components',
            contact: {
                name: 'SPDK NAS Manager Team',
                email: 'admin@localhost'
            },
            license: {
                name: 'MIT',
                url: 'https://opensource.org/licenses/MIT'
            }
        },
        servers: [
            {
                url: process.env.NODE_ENV === 'production' 
                    ? 'https://your-domain.com'
                    : `http://localhost:${process.env.PORT || 3000}`,
                description: process.env.NODE_ENV === 'production' 
                    ? 'Production server'
                    : 'Development server'
            }
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'JWT Authorization header using the Bearer scheme. Enter your token below.'
                }
            },
            responses: {
                UnauthorizedError: {
                    description: 'Access token is missing or invalid',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    error: {
                                        type: 'string',
                                        example: 'Invalid token'
                                    },
                                    message: {
                                        type: 'string',
                                        example: 'Please provide a valid access token'
                                    }
                                }
                            }
                        }
                    }
                },
                ValidationError: {
                    description: 'Request validation failed',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    error: {
                                        type: 'string',
                                        example: 'Validation failed'
                                    },
                                    message: {
                                        type: 'string',
                                        example: 'The request data is invalid'
                                    },
                                    details: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                field: {
                                                    type: 'string'
                                                },
                                                message: {
                                                    type: 'string'
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        tags: [
            {
                name: 'Authentication',
                description: 'User authentication and authorization'
            },
            {
                name: 'NQN Management',
                description: 'NVMe-oF subsystem and NQN management'
            },
            {
                name: 'Block Device Management',
                description: 'Block device (bdev) management'
            },
            {
                name: 'RAID Management',
                description: 'RAID array management'
            },
            {
                name: 'Configuration Management',
                description: 'SPDK configuration save and reload management'
            },
            {
                name: 'System Information',
                description: 'System status and health monitoring'
            }
        ]
    },
    apis: [
        path.join(__dirname, '../routes/*.js'),
        path.join(__dirname, '../middleware/*.js'),
        path.join(__dirname, '../app.js')
    ]
};

const specs = swaggerJsdoc(options);

module.exports = specs; 