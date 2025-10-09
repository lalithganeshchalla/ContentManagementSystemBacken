const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 2148;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ PERMANENT STORAGE: JSON file for content
const DATA_FILE = 'content-data.json';

// ✅ Initialize data file if it doesn't exist
const initializeDataFile = () => {
  if (!fs.existsSync(DATA_FILE)) {
    const initialData = [
      {
        id: '1',
        title: 'Welcome to the Content Management System',
        description: 'This is a sample content item that will persist even after server restart.',
        imageUrl: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
    console.log('✅ Created new data file with sample content');
  }
};

// ✅ Read content from file
const readContentFromFile = () => {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading data file:', error);
    return [];
  }
};

// ✅ Write content to file
const writeContentToFile = (content) => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(content, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing to data file:', error);
    return false;
  }
};

// Initialize data file on server start
initializeDataFile();

// Create uploads directory
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads', { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads');
  },
  filename: (req, file, cb) => {
    const uniqName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqName);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

// ✅ Multer error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum 5MB allowed.'
      });
    }
  }
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
  next();
});

// ✅ Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🚀 CMS Backend API is running!',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      content: '/api/content',
      uploads: '/uploads'
    },
    documentation: 'Use /api/health to check server status'
  });
});

// ✅ Health check endpoint
app.get('/api/health', (req, res) => {
  const content = readContentFromFile();
  res.json({ 
    success: true, 
    message: 'Server is running with permanent storage',
    timestamp: new Date().toISOString(),
    totalItems: content.length,
    environment: process.env.NODE_ENV || 'development'
  });
});

// ✅ Get all content - FROM FILE
app.get('/api/content', (req, res) => {
  try {
    const content = readContentFromFile();
    
    // ✅ FIX: Ensure image URLs are properly formatted for production
    const contentWithFixedUrls = content.map(item => {
      if (item.imageUrl && !item.imageUrl.startsWith('http')) {
        // Convert relative paths to absolute URLs
        return {
          ...item,
          imageUrl: `${req.protocol}://${req.get('host')}${item.imageUrl}`
        };
      }
      return item;
    });

    res.json({
      success: true,
      data: contentWithFixedUrls,
      count: contentWithFixedUrls.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching content: ' + error.message
    });
  }
});

// ✅ Add new content - SAVE TO FILE (FIXED IMAGE URLS)
app.post('/api/content', upload.single('image'), (req, res) => {
  try {
    console.log('Request body:', req.body);
    console.log('Request file:', req.file);

    const { title, description } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({
        success: false,
        message: 'Title and description are required'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Image is required'
      });
    }

    // Read current content from file
    const currentContent = readContentFromFile();

    // ✅ FIX: Use proper URL format for deployed environment
    const newItem = {
      id: uuidv4(),
      title: title.trim(),
      description: description.trim(),
      // ✅ CORRECT: Use relative path that will be converted in GET endpoint
      imageUrl: `/uploads/${req.file.filename}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Add new item to beginning of array
    const updatedContent = [newItem, ...currentContent];

    // Save to file
    const writeSuccess = writeContentToFile(updatedContent);

    if (!writeSuccess) {
      return res.status(500).json({
        success: false,
        message: 'Failed to save content to storage'
      });
    }

    // ✅ Return the item with proper image URL for immediate use
    const responseItem = {
      ...newItem,
      imageUrl: `${req.protocol}://${req.get('host')}${newItem.imageUrl}`
    };

    res.json({
      success: true,
      message: 'Content added successfully!',
      data: responseItem
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

// ✅ Fix ALL existing image URLs (run this once)
app.post('/api/fix-image-urls', (req, res) => {
  try {
    const content = readContentFromFile();
    console.log('Fixing image URLs for', content.length, 'items');
    
    let fixedCount = 0;
    const fixedContent = content.map(item => {
      if (item.imageUrl) {
        // If it contains local IP, convert to relative path
        if (item.imageUrl.includes('10.185.32.235') || item.imageUrl.includes('localhost')) {
          const filename = item.imageUrl.split('/').pop();
          fixedCount++;
          return {
            ...item,
            imageUrl: `/uploads/${filename}`
          };
        }
      }
      return item;
    });
    
    const writeSuccess = writeContentToFile(fixedContent);
    
    if (writeSuccess) {
      res.json({
        success: true,
        message: `Fixed ${fixedCount} image URLs!`,
        data: fixedContent
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to fix image URLs'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error: ' + error.message
    });
  }
});

// ✅ Delete content - UPDATE FILE
app.delete('/api/content/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Content ID is required'
      });
    }

    // Read current content from file
    const currentContent = readContentFromFile();
    const initialLength = currentContent.length;
    
    const updatedContent = currentContent.filter(item => item.id.toString() !== id.toString());
    
    if (updatedContent.length === initialLength) {
      return res.status(404).json({
        success: false,
        message: 'Content not found'
      });
    }

    // Save updated content to file
    const writeSuccess = writeContentToFile(updatedContent);

    if (!writeSuccess) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update storage after deletion'
      });
    }

    res.json({
      success: true,
      message: 'Content deleted permanently!',
      deletedId: id
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting content: ' + error.message
    });
  }
});

// ✅ Reset to sample data (optional endpoint)
app.post('/api/reset', (req, res) => {
  try {
    const sampleData = [
      {
        id: '1',
        title: 'Welcome to Content Management System',
        description: 'This is permanent sample content. Your data survives server restarts!',
        imageUrl: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    
    const writeSuccess = writeContentToFile(sampleData);
    
    if (writeSuccess) {
      res.json({
        success: true,
        message: 'Reset to sample data successfully!',
        data: sampleData
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to reset data'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error resetting data: ' + error.message
    });
  }
});

// ✅ Get storage info
app.get('/api/storage-info', (req, res) => {
  try {
    const content = readContentFromFile();
    const stats = fs.statSync(DATA_FILE);
    
    res.json({
      success: true,
      data: {
        totalItems: content.length,
        fileSize: `${(stats.size / 1024).toFixed(2)} KB`,
        storageFile: DATA_FILE,
        lastModified: stats.mtime,
        serverTime: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error getting storage info: ' + error.message
    });
  }
});

// ✅ Get single content item by ID
app.get('/api/content/:id', (req, res) => {
  try {
    const { id } = req.params;
    const content = readContentFromFile();
    const item = content.find(item => item.id.toString() === id.toString());
    
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Content not found'
      });
    }

    // Ensure proper image URL
    const itemWithFixedUrl = {
      ...item,
      imageUrl: item.imageUrl && !item.imageUrl.startsWith('http') 
        ? `${req.protocol}://${req.get('host')}${item.imageUrl}`
        : item.imageUrl
    };

    res.json({
      success: true,
      data: itemWithFixedUrl
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching content: ' + error.message
    });
  }
});

// ✅ 404 handler for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    availableEndpoints: {
      GET: ['/', '/api/health', '/api/content', '/api/content/:id', '/api/storage-info'],
      POST: ['/api/content', '/api/fix-image-urls', '/api/reset'],
      DELETE: ['/api/content/:id']
    }
  });
});

// ✅ Global error handler
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  const content = readContentFromFile();
  console.log(`🎯 CMS Backend Server running with PERMANENT STORAGE!`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📁 API Base: http://localhost:${PORT}/api`);
  console.log(`📁 Uploads: http://localhost:${PORT}/uploads`);
  console.log(`💾 Storage: ${DATA_FILE} (${content.length} items loaded)`);
  console.log(`🔧 Available Endpoints:`);
  console.log(`   GET  /api/health          - Health check`);
  console.log(`   GET  /api/content         - Get all content`);
  console.log(`   POST /api/content         - Add new content`);
  console.log(`   DELETE /api/content/:id   - Delete content`);
  console.log(`   POST /api/fix-image-urls  - Fix existing image URLs`);
  console.log(`   GET  /api/storage-info    - Storage information`);
});