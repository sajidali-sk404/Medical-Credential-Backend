// controllers/auth.js
import bcrypt from 'bcryptjs'
import jwt    from 'jsonwebtoken'
import User   from '../models/User.js'
import Client from '../models/Client.js'
import { uploadToCloudinary } from '../lib/cloudinary.js'

export const login = async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' })
    }

    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    // Sign a lean payload — no sensitive data in the token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )

    // httpOnly cookie — JS on the browser cannot read this
    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure:   process.env.NODE_ENV === 'production',  // HTTPS only in prod
      maxAge:   7 * 24 * 60 * 60 * 1000               // 7 days in ms
    })

    res.json({
      message: 'Login successful',
      user: {
        image: user.image,
        id:    user._id,
        name:  user.name,
        email: user.email,
        role:  user.role,
      }
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
}

export const register = async (req, res) => {
  try {
    const { name, email, password, company_name, phone } = req.body;

    // ✅ validation
    if (!name || !email || !password || !company_name) {
      return res.status(400).json({
        message: "name, email, password, company_name are required",
      });
    }

    // ✅ check existing user
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) {
      return res.status(409).json({ message: "Email already registered" });
    }

    // ✅ hash password
    const hash = await bcrypt.hash(password, 12);

    // ✅ handle image upload (optional)
    let imageUrl = null;
    let publicId = null;

    if (req.file) {
      const result = await uploadToCloudinary(
        req.file.buffer,
        req.file.mimetype,
        "users" // folder name
      );

      imageUrl = result.secure_url;
      publicId = result.public_id;
    }

    // ✅ create user
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password_hash: hash,
      role: "client",
      image: imageUrl,        // 👈 store URL
      image_public_id: publicId, // 👈 (optional but recommended)
    });

    // ✅ create client profile
    await Client.create({
      user_id: user._id,
      company_name,
      phone: phone ?? null,
    });

    res.status(201).json({
      message: "Account created",
      user,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};

export const logout = (req, res) => {
  res.clearCookie('token')
  res.json({ message: 'Logged out' })
}

export const getMe = async (req, res) => {
  res.json({
    id:    req.user._id,
    name:  req.user.name,
    email: req.user.email,
    role:  req.user.role,
    image: req.user.image,
  })
}