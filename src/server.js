const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 2148;

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

// ✅ Health check endpoint
app.get('/api/health', (req, res) => {
  const content = readContentFromFile();
  res.json({ 
    success: true, 
    message: 'Server is running with permanent storage',
    timestamp: new Date().toISOString(),
    totalItems: content.length,
    port: PORT
  });
});

// ✅ Get all content - FROM FILE
app.get('/api/content', (req, res) => {
  const content = readContentFromFile();
  res.json({
    success: true,
    data: content
  });
});

// ✅ Add new content - SAVE TO FILE
// ✅ ADD THIS MISSING ENDPOINT - Add new content
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

    // Use your computer's IP for image URLs
    const newItem = {
      id: uuidv4(),
      title,
      description,
      imageUrl: `http://10.185.32.235:${PORT}/uploads/${req.file.filename}`,
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

// ✅ Fix ALL image URLs (run this once)
app.get('/api/fix-all-images', (req, res) => {
  try {
    const content = readContentFromFile();
    console.log('Fixing images in', content.length, 'items');
    
    const fixedContent = content.map(item => {
      if (item.imageUrl) {
        // Replace localhost with your IP
        const fixedUrl = item.imageUrl.replace('localhost', '10.185.32.235');
        console.log('Fixed:', item.imageUrl, '→', fixedUrl);
        return {
          ...item,
          imageUrl: fixedUrl
        };
      }
      return item;
    });
    
    const writeSuccess = writeContentToFile(fixedContent);
    
    if (writeSuccess) {
      res.json({
        success: true,
        message: `Fixed ${content.length} image URLs!`,
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
  const { id } = req.params;
  
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
    message: 'Content deleted permanently!'
  });
});

// ✅ Reset to sample data (optional endpoint)
app.post('/api/reset', (req, res) => {
  const sampleData = [
    {
      id: '1',
      title: 'Welcome to Content Management',
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
      message: 'Reset to sample data successfully!'
    });
  } else {
    res.status(500).json({
      success: false,
      message: 'Failed to reset data'
    });
  }
});

// ✅ Get storage info
app.get('/api/storage-info', (req, res) => {
  const content = readContentFromFile();
  const stats = fs.statSync(DATA_FILE);
  
  res.json({
    success: true,
    data: {
      totalItems: content.length,
      fileSize: `${(stats.size / 1024).toFixed(2)} KB`,
      storageFile: DATA_FILE,
      lastModified: stats.mtime
    }
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  const content = readContentFromFile();
  console.log(`🎯 Backend Server running with PERMANENT STORAGE!`);
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`📁 API: http://localhost:${PORT}/api/content`);
  console.log(`📁 Uploads: http://localhost:${PORT}/uploads`);
  console.log(`💾 Storage: ${DATA_FILE} (${content.length} items loaded)`);
  console.log(`🔧 Endpoints: /api/health, /api/storage-info, /api/reset`);
});