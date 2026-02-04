-- Add imageFileId column to telegram_posts for ImageKit cleanup tracking
ALTER TABLE telegram_posts 
ADD COLUMN IF NOT EXISTS image_file_id VARCHAR(100);

-- Add index for faster cleanup queries
CREATE INDEX IF NOT EXISTS idx_telegram_posts_image_file_id 
ON telegram_posts(image_file_id) 
WHERE image_file_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN telegram_posts.image_file_id IS 'ImageKit file ID for cleanup of old images';
