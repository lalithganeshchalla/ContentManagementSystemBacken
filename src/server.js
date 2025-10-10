const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 2148;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
        imageBase64: null,
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

// ✅ Configure multer for memory storage (base64 conversion)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
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
    storage: 'Base64 Image Storage',
    endpoints: {
      health: '/api/health',
      content: '/api/content',
    }
  });
});

// ✅ Health check endpoint
app.get('/api/health', (req, res) => {
  const content = readContentFromFile();
  res.json({ 
    success: true, 
    message: 'Server is running with Base64 image storage',
    timestamp: new Date().toISOString(),
    totalItems: content.length,
    environment: process.env.NODE_ENV || 'development'
  });
});

// ✅ Get all content
app.get('/api/content', (req, res) => {
  try {
    const content = readContentFromFile();
    
    res.json({
      success: true,
      data: content,
      count: content.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching content: ' + error.message
    });
  }
});

// ✅ Add new content with Base64 image
app.post('/api/content', upload.single('image'), (req, res) => {
  try {
    console.log('Request body:', req.body);
    console.log('Request file received:', req.file ? `Size: ${req.file.size} bytes` : 'No file');

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

    // ✅ Convert image to base64
    const imageBase64 = req.file.buffer.toString('base64');
    const imageMimeType = req.file.mimetype;

    const newItem = {
      id: uuidv4(),
      title: title.trim(),
      description: description.trim(),
      imageBase64: `data:${imageMimeType};base64,${imageBase64}`,
      imageUrl: null, // Keep for compatibility
      mimeType: imageMimeType,
      fileSize: req.file.size,
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

    res.json({
      success: true,
      message: 'Content added successfully!',
      data: newItem
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

// ✅ Delete content
app.delete('/api/content/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Content ID is required'
      });
    }

    const currentContent = readContentFromFile();
    const initialLength = currentContent.length;
    
    const updatedContent = currentContent.filter(item => item.id.toString() !== id.toString());
    
    if (updatedContent.length === initialLength) {
      return res.status(404).json({
        success: false,
        message: 'Content not found'
      });
    }

    const writeSuccess = writeContentToFile(updatedContent);

    if (!writeSuccess) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update storage after deletion'
      });
    }

    res.json({
      success: true,
      message: 'Content deleted successfully!',
      deletedId: id
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting content: ' + error.message
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

    res.json({
      success: true,
      data: item
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching content: ' + error.message
    });
  }
});

// ✅ Get storage info
app.get('/api/storage-info', (req, res) => {
  try {
    const content = readContentFromFile();
    const stats = fs.statSync(DATA_FILE);
    
    // Calculate total base64 image size
    const totalImageSize = content.reduce((total, item) => {
      return total + (item.fileSize || 0);
    }, 0);

    res.json({
      success: true,
      data: {
        totalItems: content.length,
        fileSize: `${(stats.size / 1024).toFixed(2)} KB`,
        totalImageSize: `${(totalImageSize / 1024 / 1024).toFixed(2)} MB`,
        storageFile: DATA_FILE,
        storageType: 'Base64 in JSON',
        lastModified: stats.mtime
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error getting storage info: ' + error.message
    });
  }
});

// ✅ FIXED: 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    availableEndpoints: {
      GET: ['/', '/api/health', '/api/content', '/api/content/:id', '/api/storage-info'],
      POST: ['/api/content'],
      DELETE: ['/api/content/:id']
    }
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  const content = readContentFromFile();
  console.log(`🎯 CMS Backend Server running with BASE64 IMAGE STORAGE!`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`💾 Storage: ${DATA_FILE} (${content.length} items loaded)`);
  console.log(`🔧 Available Endpoints:`);
  console.log(`   GET  /api/health          - Health check`);
  console.log(`   GET  /api/content         - Get all content`);
  console.log(`   POST /api/content         - Add new content (with Base64 image)`);
  console.log(`   DELETE /api/content/:id   - Delete content`);
});