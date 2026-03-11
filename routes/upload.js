const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { authRequired, requireRole } = require('../middleware/auth');
const { cloudinary, uploadBufferToCloudinary } = require('../utils/cloudinary');
const db = require('../db');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 200 * 1024 * 1024
  }
});

const anyUploadField = upload.any();

function runMulter(middleware) {
  return (req, res, next) => {
    middleware(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File too large. Max size is 200MB' });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({ error: "Unexpected file field. Use form-data key 'file' (or 'image'/'video')." });
        }
        return res.status(400).json({ error: err.message });
      }
      return next(err);
    });
  };
}

function getSingleUploadedFile(req) {
  if (Array.isArray(req.files) && req.files.length > 0) {
    return req.files[0];
  }
  return null;
}

function requireCloudinaryConfig(req, res, next) {
  const hasConfig =
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET;

  if (!hasConfig) {
    return res.status(500).json({ error: 'Cloudinary is not configured on server' });
  }
  next();
}

function mapCloudinaryAsset(resource) {
  return {
    public_id: resource.public_id,
    resource_type: resource.resource_type,
    format: resource.format,
    secure_url: resource.secure_url,
    url: resource.url,
    bytes: resource.bytes,
    created_at: resource.created_at
  };
}

async function saveMediaUploadMetadata({
  uploaderId,
  regionId,
  churchId,
  resourceType,
  title,
  type,
  description,
  caption,
  cloudinaryResult
}) {
  await db.query(
    `INSERT INTO media_uploads(
      id,uploader_id,region_id,church_id,resource_type,title,media_type,description,caption,
      public_id,format,secure_url,url,bytes,created_at
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
    ON CONFLICT (public_id) DO NOTHING`,
    [
      uuidv4(),
      uploaderId || null,
      regionId || null,
      churchId || null,
      resourceType,
      title || null,
      type || null,
      description || null,
      caption || null,
      cloudinaryResult.public_id,
      cloudinaryResult.format || null,
      cloudinaryResult.secure_url,
      cloudinaryResult.url || null,
      cloudinaryResult.bytes || null
    ]
  );
}

async function validateRegionForUpload(user, regionId) {
  if (!regionId) {
    if (user.role === 'regional_admin') {
      return { ok: false, status: 400, error: 'Missing region_id' };
    }
    return { ok: true };
  }

  const region = await db.query('SELECT id FROM regions WHERE id=$1', [regionId]);
  if (region.rowCount !== 1) return { ok: false, status: 400, error: 'Region not found' };

  if (user.role === 'regional_admin') {
    const membership = await db.query('SELECT 1 FROM user_regions WHERE user_id=$1 AND region_id=$2', [user.id, regionId]);
    if (membership.rowCount === 0) {
      return { ok: false, status: 403, error: 'Forbidden for this region' };
    }
  }

  return { ok: true };
}

function parseExpiryDate(expiresInDays) {
  if (expiresInDays === undefined || expiresInDays === null || expiresInDays === '') return null;
  const days = Number(expiresInDays);
  if (!Number.isFinite(days) || days <= 0) return undefined;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function listCloudinaryImages(req, res) {
  try {
    const { region_id, search = '' } = req.query;

    const result = await db.query(
      `SELECT
        public_id,
        resource_type,
        format,
        secure_url,
        url,
        bytes,
        created_at,
        region_id,
        title,
        media_type AS type,
        description,
        caption
      FROM media_uploads
      WHERE resource_type = 'image'
        AND ($1::uuid IS NULL OR region_id = $1::uuid)
        AND ($2 = '' OR COALESCE(title, '') ILIKE '%' || $2 || '%' OR COALESCE(description, '') ILIKE '%' || $2 || '%' OR COALESCE(caption, '') ILIKE '%' || $2 || '%')
      ORDER BY created_at DESC`,
      [region_id || null, search]
    );

    const assets = result.rows;

    return res.json({
      ok: true,
      assets,
      next_cursor: null
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err?.message || 'Failed to fetch Cloudinary images' });
  }
}

router.get('/upload/images', requireCloudinaryConfig, listCloudinaryImages);
router.get('/upload/image/all', requireCloudinaryConfig, listCloudinaryImages);

router.post(
  '/upload/image',
  authRequired,
  requireRole('super', 'regional_admin'),
  requireCloudinaryConfig,
  runMulter(anyUploadField),
  async (req, res) => {
    try {
      const file = getSingleUploadedFile(req);
      if (!file) return res.status(400).json({ error: 'Missing file in form-data body' });
      if (!file.mimetype.startsWith('image/')) return res.status(400).json({ error: 'Only image files are allowed' });

      const regionId = req.query.region_id || req.headers['x-region-id'] || req.headers['region_id'];
      const regionValidation = await validateRegionForUpload(req.user, regionId);
      if (!regionValidation.ok) {
        return res.status(regionValidation.status).json({ error: regionValidation.error });
      }

      const folder = req.body.folder || (regionId ? `mission-for-nation/images/${regionId}` : 'mission-for-nation/images/home');
      const result = await uploadBufferToCloudinary(file.buffer, {
        resource_type: 'image',
        folder
      });

      const { church_id, title, type, description, caption, location_link, expires_in_days } = req.body;
      if (church_id && !regionId) {
        return res.status(400).json({ error: 'church_id requires region_id' });
      }

      if (church_id && regionId) {
        const validChurch = await db.query('SELECT id FROM churches WHERE id=$1 AND region_id=$2', [church_id, regionId]);
        if (validChurch.rowCount !== 1) {
          return res.status(400).json({ error: 'church_id is invalid for selected region' });
        }
      }

      const expiresAt = parseExpiryDate(expires_in_days);
      if (expiresAt === undefined) {
        return res.status(400).json({ error: 'expires_in_days must be a positive number' });
      }

      let galleryId = null;
      if (regionId) {
        galleryId = uuidv4();
        await db.query(
          `INSERT INTO region_galleries(
            id,author_id,region_id,church_id,title,type,description,caption,image_url,location_link,expires_at,created_at
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())`,
          [
            galleryId,
            req.user.id,
            regionId,
            church_id || null,
            title || null,
            type || null,
            description || null,
            caption || null,
            result.secure_url,
            location_link || null,
            expiresAt
          ]
        );
      }

      await saveMediaUploadMetadata({
        uploaderId: req.user?.id,
        regionId,
        churchId: church_id || null,
        resourceType: 'image',
        title,
        type,
        description,
        caption,
        cloudinaryResult: result
      });

      return res.json({
        ok: true,
        gallery_id: galleryId,
        asset: {
          public_id: result.public_id,
          resource_type: result.resource_type,
          format: result.format,
          secure_url: result.secure_url,
          url: result.url,
          bytes: result.bytes,
          created_at: result.created_at,
          region_id: regionId,
          title: title || null,
          type: type || null,
          description: description || null
        }
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err?.message || 'Image upload failed' });
    }
  }
);

router.post(
  '/upload/video',
  authRequired,
  requireRole('super', 'regional_admin'),
  requireCloudinaryConfig,
  runMulter(anyUploadField),
  async (req, res) => {
    try {
      const file = getSingleUploadedFile(req);
      if (!file) return res.status(400).json({ error: 'Missing file in form-data body' });
      if (!file.mimetype.startsWith('video/')) return res.status(400).json({ error: 'Only video files are allowed' });

      const regionId = req.query.region_id || req.headers['x-region-id'] || req.headers['region_id'];
      const regionValidation = await validateRegionForUpload(req.user, regionId);
      if (!regionValidation.ok) {
        return res.status(regionValidation.status).json({ error: regionValidation.error });
      }

      const folder = req.body.folder || (regionId ? `mission-for-nation/videos/${regionId}` : 'mission-for-nation/videos/home');
      const result = await uploadBufferToCloudinary(file.buffer, {
        resource_type: 'video',
        folder
      });

      const { title, type, description, caption } = req.body;
      await saveMediaUploadMetadata({
        uploaderId: req.user?.id,
        regionId,
        churchId: null,
        resourceType: 'video',
        title,
        type,
        description,
        caption,
        cloudinaryResult: result
      });

      return res.json({
        ok: true,
        asset: {
          public_id: result.public_id,
          resource_type: result.resource_type,
          format: result.format,
          secure_url: result.secure_url,
          url: result.url,
          bytes: result.bytes,
          created_at: result.created_at,
          region_id: regionId || null,
          title: title || null,
          type: type || null,
          description: description || null
        }
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err?.message || 'Video upload failed' });
    }
  }
);

module.exports = router;
