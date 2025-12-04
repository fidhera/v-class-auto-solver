// content.js - v-class auto solver (frontend)

let selectedText = "";
let selectedImageBase64 = null; // variabel untuk menyimpan data gambar
let menuElement = null;

// listener saat user melepas klik mouse (selesai memblok teks)
document.addEventListener('mouseup', async (event) => {
    // jika klik terjadi di dalam menu sendiri, abaikan agar menu tidak tertutup
    if (menuElement && menuElement.contains(event.target)) return;

    const selection = window.getSelection();
    const text = selection.toString().trim();
    
    // hapus menu lama jika ada seleksi baru
    removeMenu();

    // hanya munculkan jika teks yang diblok cukup panjang (menghindari misclick)
    if (text.length > 2) {
        selectedText = text;
        
        // --- logika deteksi gambar otomatis ---
        // mencari elemen gambar di dalam area soal yang diblok
        let foundImage = null;
        if (selection.anchorNode) {
            // mencari parent element terdekat yang membungkus soal (biasanya class .qtext di moodle)
            const container = selection.anchorNode.parentElement.closest('.qtext');
            if (container) {
                const img = container.querySelector('img');
                if (img) foundImage = img;
            }
        }

        // jika gambar ditemukan, konversi url gambar ke format base64
        if (foundImage) {
            console.log("V-Class Solver: gambar ditemukan, sedang memproses...");
            selectedImageBase64 = await getBase64FromUrl(foundImage.src);
        } else {
            selectedImageBase64 = null;
        }
        // --------------------------------

        // tampilkan menu mengambang di posisi kursor
        showFloatingMenu(event.pageX, event.pageY);
    }
});

// fungsi bantu untuk mengubah url gambar menjadi string base64
async function getBase64FromUrl(url) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                // ambil string base64 setelah tanda koma
                const base64String = reader.result.split(',')[1];
                resolve(base64String);
            };
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error("V-Class Solver: gagal mengambil gambar", e);
        return null;
    }
}

// listener untuk menutup menu jika user klik di sembarang tempat
document.addEventListener('mousedown', (event) => {
    if (menuElement && !menuElement.contains(event.target)) {
        removeMenu();
    }
});

// fungsi untuk merender tampilan menu mengambang (floating menu)
function showFloatingMenu(x, y) {
    menuElement = document.createElement('div');
    menuElement.id = 'vcs-floating-menu'; // id baru (v-class solver)
    menuElement.style.left = `${x}px`;
    menuElement.style.top = `${y - 50}px`; 

    // tampilkan ikon gambar jika soal bergambar terdeteksi
    const imgIcon = selectedImageBase64 ? "🖼️" : "";

    // html untuk tombol menu
    menuElement.innerHTML = `
        <div class="vcs-btn-group">
            <button id="vcs-btn-fast" title="Model Cepat">Cepat ${imgIcon}</button>
            <div class="vcs-separator"></div>
            <button id="vcs-btn-smart" class="vcs-primary" title="Model Pintar">Pintar ${imgIcon}</button>
        </div>
    `;

    document.body.appendChild(menuElement);

    const btnFast = document.getElementById('vcs-btn-fast');
    const btnSmart = document.getElementById('vcs-btn-smart');

    // tambahkan event listener pada tombol
    [btnFast, btnSmart].forEach(btn => {
        // preventdefault pada mousedown agar seleksi teks tidak hilang saat tombol diklik
        btn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // tentukan mode berdasarkan tombol yang diklik
            processRequest(e.target.id === 'vcs-btn-fast' ? 'fast' : 'smart');
        });
    });
}

// fungsi untuk menghapus menu dari layar
function removeMenu() {
    if (menuElement) {
        menuElement.remove();
        menuElement = null;
    }
}

// fungsi untuk mengirim permintaan ke background script
function processRequest(mode) {
    removeMenu();
    document.body.style.cursor = 'wait'; // ubah kursor jadi loading

    // kirim pesan berisi teks, gambar, dan mode yang dipilih
    chrome.runtime.sendMessage({
        action: "solve_request",
        text: selectedText,
        image: selectedImageBase64,
        mode: mode
    });
}

// listener untuk menerima pesan balik dari background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    document.body.style.cursor = 'default'; // kembalikan kursor normal
    
    if (request.action === "error_alert") alert("V-Class Solver: " + request.message);
    if (request.action === "execute_answer") handleAutoSelect(request.answer);
    
    // log status (opsional)
    if (request.action === "status_loading") console.log("V-Class Solver: sedang memproses...");
});

// fungsi inti untuk memilih jawaban otomatis di halaman web
function handleAutoSelect(rawAnswer) {
    // bersihkan teks jawaban dari simbol-simbol aneh dan ubah ke huruf kecil
    const cleanAnswer = rawAnswer.toLowerCase().replace(/^[a-e]\.\s*/, "").trim();
    console.log("[V-Class Solver Jawaban]:", cleanAnswer);

    // cari semua elemen opsi jawaban (biasanya class .r0 atau .r1 di moodle)
    const optionContainers = document.querySelectorAll('.answer div.r0, .answer div.r1');
    let found = false;

    optionContainers.forEach(container => {
        const label = container.querySelector('label');
        const radio = container.querySelector('input[type="radio"]');

        if (label) {
            // ambil teks dari opsi yang ada di layar
            const labelText = label.innerText.toLowerCase().replace(/^[a-e]\.\s*/, "").trim();
            
            // logika pencocokan: apakah jawaban ai ada di label, atau sebaliknya
            if ((labelText.includes(cleanAnswer) || cleanAnswer.includes(labelText)) && cleanAnswer.length > 3) {
                // klik radio button dan labelnya
                if (radio) radio.click();
                label.click();
                
                // berikan efek visual (highlight) agar user tahu jawaban sudah dipilih
                container.classList.add('vcs-highlight-success');
                container.scrollIntoView({ behavior: "smooth", block: "center" });
                found = true;
            } else {
                // hapus highlight dari opsi yang salah
                container.classList.remove('vcs-highlight-success');
            }
        }
    });

    // jika tidak ada jawaban yang cocok
    if (!found) {
        alert(`V-Class Solver:\n"${rawAnswer}"\n\n(Tidak ditemukan tombol yang cocok persis di layar)`);
    }
}