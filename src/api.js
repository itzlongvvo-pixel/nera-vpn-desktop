// src/api.js

// This points to your Master Node in Tokyo
const API_URL = 'http://45.76.106.63:3000/api';

export async function registerUser(email, password, publicKey) {
  try {
    const response = await fetch(`${API_URL}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email,
        password: password,
        public_key: publicKey,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Registration failed');
    }

    return data; // Returns { success: true, ip: "10.66.66.xx" }
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}