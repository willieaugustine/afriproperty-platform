const express = require('express');
const router = express.Router();
const multer = require('multer');
const { supabase } = require('../server');
const { authenticateUser } = require('../middleware/auth');
const sharp = require('sharp');
const path = require('path');

// Configure multer
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Invalid file type'));
  }
});

// Upload document
router.post('/document', authenticateUser, upload.single('file'), async (req, res) => {
  try {
    const { file } = req;
    const { document_type, property_id, description } = req.body;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const filename = `${req.user.id}/${timestamp}-${file.originalname}`;
    const bucket = document_type === 'kyc_document' || document_type === 'id_document' 
      ? 'kyc-documents' 
      : 'documents';

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filename, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(filename);

    // Save to database
    const { data: document, error: dbError } = await supabase
      .from('documents')
      .insert({
        uploaded_by: req.user.id,
        property_id,
        file_name: file.originalname,
        file_type: path.extname(file.originalname),
        file_size: file.size,
        mime_type: file.mimetype,
        storage_path: filename,
        storage_bucket: bucket,
        public_url: urlData.publicUrl,
        document_type,
        description,
        is_public: bucket === 'documents'
      })
      .select()
      .single();

    if (dbError) throw dbError;

    res.json({
      success: true,
      document
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload property images
router.post('/property-images', authenticateUser, upload.array('images', 10), async (req, res) => {
  try {
    const { files } = req;
    const { property_id } = req.body;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Verify property ownership
    const { data: property } = await supabase
      .from('properties')
      .select('owner_id')
      .eq('id', property_id)
      .single();

    if (!property || property.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const uploadedImages = [];

    for (const file of files) {
      // Optimize image
      const optimizedBuffer = await sharp(file.buffer)
        .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();

      const filename = `properties/${property_id}/${Date.now()}-${file.originalname}`;

      // Upload to Supabase
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('property-images')
        .upload(filename, optimizedBuffer, {
          contentType: 'image/jpeg',
          cacheControl: '31536000'
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('property-images')
        .getPublicUrl(filename);

      uploadedImages.push(urlData.publicUrl);
    }

    // Update property images
    const { data: updatedProperty } = await supabase
      .from('properties')
      .update({
        images_url: uploadedImages
      })
      .eq('id', property_id)
      .select()
      .single();

    res.json({
      success: true,
      images: uploadedImages,
      property: updatedProperty
    });

  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get document
router.get('/document/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: document, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    // Check permissions
    if (!document.is_public && document.uploaded_by !== req.user.id) {
      // Check if user is admin or property owner
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', req.user.id)
        .single();

      if (!profile?.is_admin) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    }

    res.json({ document });

  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
