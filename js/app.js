const preview = document.getElementById('preview');
const canvas = document.getElementById('canvas');
const btnPhoto = document.getElementById('btn-photo');
const btnRecord = document.getElementById('btn-record');
const btnSwitch = document.getElementById('btn-switch');

let currentStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let facingMode = 'user'; // 'user' para frontal, 'environment' para traseira
let isRecording = false;

// Suporte a MIME types compatíveis com iOS Safari
function getSupportedMimeType() {
    const types = [
        'video/mp4;codecs=avc1',
        'video/mp4',
        'video/webm;codecs=vp9',
        'video/webm'
    ];
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) {
            return type;
        }
    }
    return '';
}

async function startCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }

    const constraints = {
        video: {
            facingMode: facingMode,
            width: { ideal: 1920 },
            height: { ideal: 1080 }
        },
        audio: true
    };

    try {
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        preview.srcObject = currentStream;

        // Ajusta classe de espelhamento visual no preview
        if (facingMode === 'user') {
            preview.classList.add('mirror');
        } else {
            preview.classList.remove('mirror');
        }
    } catch (err) {
        console.error("Erro ao acessar câmera:", err);
        alert("Não foi possível acessar a câmera ou microfone.");
    }
}

// Tirar foto desespelhada
btnPhoto.addEventListener('click', () => {
    if (!currentStream) return;

    const ctx = canvas.getContext('2d');
    canvas.width = preview.videoWidth || 1280;
    canvas.height = preview.videoHeight || 720;

    ctx.save();
    
    // Corrigir inversão se for câmera frontal no iOS
    if (facingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
    }

    ctx.drawImage(preview, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    canvas.toBlob((blob) => {
        if (!blob) return;
        saveFile(blob, `foto_${Date.now()}.jpg`, 'image/jpeg');
    }, 'image/jpeg', 0.95);
});

// Gravar Vídeo
btnRecord.addEventListener('click', () => {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
});

function startRecording() {
    recordedChunks = [];
    const mimeType = getSupportedMimeType();

    const options = mimeType ? { mimeType } : {};

    try {
        mediaRecorder = new MediaRecorder(currentStream, options);
    } catch (e) {
        console.error('Falha ao criar MediaRecorder:', e);
        return;
    }

    mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
            recordedChunks.push(event.data);
        }
    };

    mediaRecorder.onstop = () => {
        const type = mediaRecorder.mimeType || 'video/mp4';
        const blob = new Blob(recordedChunks, { type });
        const ext = type.includes('mp4') ? 'mp4' : 'webm';
        saveFile(blob, `video_${Date.now()}.${ext}`, type);
    };

    mediaRecorder.start(1000); // grava em fatias de 1s para garantir integridade
    isRecording = true;
    btnRecord.textContent = "Parar Gravação";
    btnRecord.classList.add('recording');
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        btnRecord.textContent = "Gravar Vídeo";
        btnRecord.classList.remove('recording');
    }
}

// Função universal de salvamento (iOS / WebShare API)
async function saveFile(blob, fileName, mimeType) {
    const file = new File([blob], fileName, { type: mimeType });

    // Tenta usar Web Share API (Ideal para salvar direto no Fotos/Drive no iPhone)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({
                files: [file],
                title: 'Salvar Arquivo',
            });
            return;
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.warn('Erro ao compartilhar via WebShare, caindo para download padrão:', err);
            } else {
                return; // Usuário cancelou o compartilhamento
            }
        }
    }

    // Fallback via download por tag <a>
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 200);
}

// Alternar entre câmeras
btnSwitch.addEventListener('click', () => {
    facingMode = (facingMode === 'user') ? 'environment' : 'user';
    startCamera();
});

// Inicialização
window.addEventListener('DOMContentLoaded', startCamera);
