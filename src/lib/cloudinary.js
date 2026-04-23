import { v2 as cloudinary } from "cloudinary"
import { Readable } from "stream"
import path from "path"

// ── CONFIG ───────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

// ── UPLOAD ───────────────────────────────────
export const uploadToCloudinary = async (file) => {
  if (!file) {
    throw new Error("File missing")
  }

  const {
    buffer,
    mimetype,
    originalname,
    folder = "uploads",
  } = file

  if (!buffer || !originalname) {
    console.log("INVALID FILE:", file)
    throw new Error("Invalid file object")
  }

  // ✅ Fix weird file names (important)
  const ext = path.extname(originalname)
  const baseName = path
    .basename(originalname, ext)
    .replace(/[^a-zA-Z0-9-_]/g, "_") // clean filename

  const publicId = `${Date.now()}-${baseName}`

  // ✅ Handle bad MIME types (your main bug)
  let resourceType = "auto"

  if (
    mimetype === "application/pdf" ||
    originalname.toLowerCase().endsWith(".pdf")
  ) {
    resourceType = "raw"
  }

  const uploadOptions = {
    folder,
    resource_type: resourceType,
    public_id: publicId,
  }

  // ✅ Optimize images only
  if (mimetype?.startsWith("image/")) {
    uploadOptions.transformation = [
      { quality: "auto", fetch_format: "auto" },
    ]
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          console.error("Cloudinary Error:", error)
          return reject(error)
        }

        resolve({
          url: result.secure_url,
          public_id: result.public_id,
          format: result.format,
          bytes: result.bytes,
        })
      }
    )

    // ✅ Handle stream errors (important)
    stream.on("error", (err) => {
      console.error("Stream Error:", err)
      reject(err)
    })

    Readable.from(buffer).pipe(stream)
  })
}
// ── DELETE ───────────────────────────────────
export const deleteFromCloudinary = async ({
  publicId,
  resourceType = "auto",
}) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    })

    return result
  } catch (error) {
    throw {
      message: "Failed to delete file",
      error,
    }
  }
}