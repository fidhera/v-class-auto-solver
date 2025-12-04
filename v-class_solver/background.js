// background.js - v-class auto solver (versi general & multimodal)

// konfigurasi api key gemini
const API_KEY = "ISI_API_KEY_GEMINI_ANDA_DISINI";

// 1. setup context menu (klik kanan) saat ekstensi diinstall
chrome.runtime.onInstalled.addListener(() => {
  // menghapus menu lama agar tidak duplikat
  chrome.contextMenus.removeAll();

  // membuat menu induk
  chrome.contextMenus.create({
    id: "vclass_parent",
    title: "V-Class Solver",
    contexts: ["selection"]
  });

  // sub-menu untuk mode cepat (flash)
  chrome.contextMenus.create({
    parentId: "vclass_parent",
    id: "solve_fast",
    title: "Jawab Cepat",
    contexts: ["selection"]
  });

  // sub-menu untuk mode pintar (pro)
  chrome.contextMenus.create({
    parentId: "vclass_parent",
    id: "solve_smart",
    title: "Jawab Pintar",
    contexts: ["selection"]
  });

  // menu untuk cek koneksi server
  chrome.contextMenus.create({
    id: "check_connection",
    title: "Cek Koneksi",
    contexts: ["all"]
  });
});

// 2. listener ketika item di klik kanan dipilih
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "solve_fast" && info.selectionText) {
    // mode cepat menggunakan model flash-lite
    handleQuestion(info.selectionText, null, tab.id, "gemini-2.0-flash-lite-preview");
  } 
  else if (info.menuItemId === "solve_smart" && info.selectionText) {
    // mode pintar menggunakan model flash standar (lebih stabil)
    handleQuestion(info.selectionText, null, tab.id, "gemini-2.0-flash");
  }
  else if (info.menuItemId === "check_connection") {
    // tes koneksi sederhana
    chrome.tabs.sendMessage(tab.id, { action: "error_alert", message: "Koneksi pada background berjalan aman." });
  }
});

// 3. listener pesan dari floating menu (popup hitam di konten)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "solve_request") {
    // default menggunakan model cepat
    let modelName = "gemini-2.0-flash-lite-preview"; 
    
    // jika mode pintar dipilih atau ada gambar, paksa gunakan model flash standar agar akurat
    if (request.mode === "smart" || request.image) {
        modelName = "gemini-2.0-flash"; 
    }

    // panggil fungsi pemroses pertanyaan
    handleQuestion(request.text, request.image, sender.tab.id, modelName);
  }
});

// 4. fungsi utama untuk menghubungi api gemini
async function handleQuestion(text, imageBase64, tabId, modelName) {
  try {
    // kirim status loading ke tab pengguna
    chrome.tabs.sendMessage(tabId, { action: "status_loading" });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${API_KEY.trim()}`;
    
    // menyusun data yang akan dikirim
    const parts = [];
    
    // --- prompt engineering general (universal) ---
    // prompt ini didesain untuk menangani segala jenis mata kuliah
    const universalPrompt = `
      Role: Expert University Academic Solver (All Subjects).
      Target: Provide the correct answer for the multiple-choice question provided.
      
      Instructions:
      1. Analyze the Question Text and Image (if provided) carefully.
      2. Identify the subject (e.g., Computer Graphics, Calculus, Economics, Programming, etc.).
      3. If an Image is present:
         - Analyze diagrams, flowcharts, code snippets, or mathematical graphs deeply.
         - Infer the relationship between elements in the image (e.g., Eye -> Pixel -> Object in Ray Tracing).
      4. Solve the problem step-by-step internally.
      5. Compare your solution with the provided options in the text.
      
      Input Data:
      ${text}
      
      OUTPUT FORMAT RULES (STRICT):
      - Output ONLY the exact text content of the correct option.
      - Do NOT include option labels like "a.", "b.", "c.", or "d.".
      - Do NOT include phrases like "Answer:", "The answer is", or any explanation.
      - Ensure the text matches the option on the screen exactly (case-insensitive).
    `;

    parts.push({ text: universalPrompt });

    // jika ada gambar, masukkan data gambar ke dalam payload
    if (imageBase64) {
        parts.push({
            inlineData: {
                mimeType: "image/jpeg",
                data: imageBase64
            }
        });
    }

    // melakukan request post ke google
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
          contents: [{ parts: parts }],
          // konfigurasi agar jawaban konsisten (tidak berubah-ubah)
          generationConfig: {
              temperature: 0.0, // 0 berarti jawaban paling deterministik/pasti
              topK: 1,
              topP: 1,
              maxOutputTokens: 100
          }
      })
    });

    // cek jika ada error dari server
    if (!response.ok) throw new Error(`API Error (${response.status})`);

    const data = await response.json();
    
    // validasi apakah ada jawaban yang masuk
    if (!data.candidates || data.candidates.length === 0) {
        throw new Error("Tidak ada respons dari AI.");
    }

    // ambil teks jawaban dan bersihkan spasi
    const answerText = data.candidates[0].content.parts[0].text.trim();

    // kirim jawaban bersih ke content script untuk dieksekusi
    chrome.tabs.sendMessage(tabId, { action: "execute_answer", answer: answerText });

  } catch (error) {
    // kirim pesan error ke layar pengguna jika gagal
    chrome.tabs.sendMessage(tabId, { action: "error_alert", message: error.message });
  }
}