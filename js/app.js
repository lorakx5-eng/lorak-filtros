let GOOGLE_SCRIPT_URL = "";
let currentConfig = null;
let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let captureMode = 'foto'; // 'foto' ou 'video'
let capturedBlob = null;
let currentCameraMode = 'user'; // 'user' (frontal) ou 'environment' (traseira)

const webcam = document.getElementById('webcam');
const moldura = document.getElementById('moldura');
const previewImg = document.getElementById('preview-img');
const previewVideo = document.getElementById('preview-video');
const recordingStatus = document.getElementById('recording-status');

const controlsCamera = document.getElementById('controls-camera');
const controlsPreview = document.getElementById('controls-preview');

const btnModeFoto = document.getElementById('btn-mode-foto');
const btnModeVideo = document.getElementById('btn-mode-video');
const btnSwitchCamera = document.getElementById('btn-switch-camera');
const btnCapture = document.getElementById('btn-capture');
const btnRefazer = document.getElementById('btn-refazer');
const btnSalvar = document.getElementById('btn-salvar');

// 1. Carrega configuração do evento
async function loadConfig() {
  try {
    const response = await fetch('eventos/lianamaria-1-ano.json');
    currentConfig = await response.json();
    moldura.src = currentConfig.frame || "assets/molduras/lianamaria.png";
    GOOGLE_SCRIPT_URL = currentConfig.driveUploadUrl;
  } catch (e) {
    console.error("Erro ao carregar evento JSON:", e);
  }
}

// 2. Inicia Câmera
async function startCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
  }

  try {
    // Tenta pegar a maior resolução possível (ideal para mobile)
    const constraints = {
      video: { 
        facingMode: currentCameraMode,
        width: { ideal: 4096 },
        height: { ideal: 2160 }
      },
      audio: true
    };
    
    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    webcam.srcObject = mediaStream;
    
    // CORREÇÃO: Aplica espelhamento apenas na câmera frontal (user)
    if (currentCameraMode === 'user') {
      webcam.classList.add('mirror');
    } else {
      webcam.classList.remove('mirror');
    }

  } catch (err) {
    console.error("Erro ao acessar a câmera:", err);
    alert("Não foi possível acessar a câmera. Verifique as permissões.");
  }
}

// 3. Alternar Modos (Foto/Vídeo)
btnModeFoto.addEventListener('click', () => {
  captureMode = 'foto';
  btnModeFoto.classList.add('active');
  btnModeVideo.classList.remove('active');
});

btnModeVideo.addEventListener('click', () => {
  captureMode = 'video';
  btnModeVideo.classList.add('active');
  btnModeFoto.classList.remove('active');
});

// 4. Alternar Câmera (Frontal/Traseira)
btnSwitchCamera.addEventListener('click', () => {
  currentCameraMode = currentCameraMode === 'user' ? 'environment' : 'user';
  startCamera();
});

// 5. Captura (Foto ou Gravação)
btnCapture.addEventListener('click', () => {
  if (captureMode === 'foto') {
    takePhoto();
  } else {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      stopRecording();
    } else {
      startRecording();
    }
  }
});

// --- Lógica de Foto ---
async function takePhoto() {
  // Cria o canvas que fará a mesclagem
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Pega as dimensões reais da imagem da câmera
  const videoWidth = webcam.videoWidth;
  const videoHeight = webcam.videoHeight;

  // CORREÇÃO: Configura o canvas para ter a mesma proporção e tamanho da foto original (alta qualidade)
  canvas.width = videoWidth;
  canvas.height = videoHeight;

  // CORREÇÃO: Remove o espelhamento para a foto final
  ctx.save();
  ctx.scale(1, 1); 

  // Pega as dimensões reais da moldura
  const frameWidth = moldura.naturalWidth;
  const frameHeight = moldura.naturalHeight;

  // CORREÇÃO: Calcula a proporção da moldura para desenhar sem distorcer sobre o canvas
  const frameAspectRatio = frameWidth / frameHeight;
  const canvasAspectRatio = canvas.width / canvas.height;

  let drawWidth, drawHeight, drawX, drawY;

  if (frameAspectRatio > canvasAspectRatio) {
    // Moldura é mais larga, ajusta pela altura
    drawHeight = canvas.height;
    drawWidth = canvas.height * frameAspectRatio;
    drawX = (canvas.width - drawWidth) / 2;
    drawY = 0;
  } else {
    // Moldura é mais alta, ajusta pela largura
    drawWidth = canvas.width;
    drawHeight = canvas.width / frameAspectRatio;
    drawX = 0;
    drawY = (canvas.height - drawHeight) / 2;
  }

  // Desenha a câmera no fundo
  ctx.drawImage(webcam, 0, 0, canvas.width, canvas.height);
  
  // Desenha a moldura por cima, respeitando a proporção
  ctx.drawImage(moldura, drawX, drawY, drawWidth, drawHeight);
  
  ctx.restore(); // Restaura o estado do canvas

  // Converte canvas para arquivo
  canvas.toBlob((blob) => {
    capturedBlob = blob;
    
    // Mostra preview
    previewImg.src = URL.createObjectURL(blob);
    previewImg.classList.remove('hidden');
    
    // CORREÇÃO: Na pré-visualização, espelha de volta se for câmera frontal para manter a experiência do usuário
    if (currentCameraMode === 'user') {
      previewImg.classList.add('mirror');
    } else {
      previewImg.classList.remove('mirror');
    }
    
    showPreviewControls();
  }, 'image/png', 0.9); // Alta qualidade
}

// --- Lógica de Vídeo ---
function startRecording() {
  recordedChunks = [];
  recordingStatus.classList.remove('hidden');
  btnCapture.classList.add('recording');
  btnSwitchCamera.classList.add('hidden'); // Esconde troca de câmera durante gravação

  mediaRecorder = new MediaRecorder(mediaStream);
  
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };

  mediaRecorder.onstop = processVideo;
  mediaRecorder.start();
}

function stopRecording() {
  mediaRecorder.stop();
  recordingStatus.classList.add('hidden');
  btnCapture.classList.remove('recording');
  btnSwitchCamera.classList.remove('hidden');
}

async function processVideo() {
  // Nota: Mesclar moldura em vídeo via JS no navegador é complexo e pesado.
  // Por simplicidade e desempenho, salvamos apenas o vídeo da câmera.
  capturedBlob = new Blob(recordedChunks, { type: 'video/webm' });
  previewVideo.src = URL.createObjectURL(capturedBlob);
  previewVideo.classList.remove('hidden');
  
  // Na pré-visualização de vídeo, geralmente não espelhamos, mas se necessário, adicione aqui
  
  showPreviewControls();
}

// --- Lógica Geral de Preview ---
function showPreviewControls() {
  webcam.classList.add('hidden');
  moldura.classList.add('hidden');
  controlsCamera.classList.add('hidden');
  controlsPreview.classList.remove('hidden');
}

btnRefazer.addEventListener('click', () => {
  previewImg.classList.add('hidden');
  previewVideo.classList.add('hidden');
  webcam.classList.remove('hidden');
  moldura.classList.remove('hidden');
  controlsPreview.classList.add('hidden');
  controlsCamera.classList.remove('hidden');
  capturedBlob = null;
});

// --- Lógica de Salvar ---
btnSalvar.addEventListener('click', async () => {
  if (!capturedBlob) return;

  btnSalvar.innerText = "Salvando...";
  btnSalvar.disabled = true;

  const type = captureMode === 'foto' ? 'foto' : 'video';
  const extension = captureMode === 'foto' ? 'png' : 'webm';
  const fileName = `lorak_${type}_${Date.now()}.${extension}`;

  // 1. Download Local
  const downloadLink = document.createElement('a');
  downloadLink.href = URL.createObjectURL(capturedBlob);
  downloadLink.download = fileName;
  downloadLink.click();

  // 2. Envio para Google Drive (apenas se a URL existir no JSON)
  if (!GOOGLE_SCRIPT_URL) {
    alert("Salvo no dispositivo. Configuração do Google Drive não encontrada.");
    finalizeSalvar();
    return;
  }

  const reader = new FileReader();
  reader.readAsDataURL(capturedBlob);
  reader.onloadend = async () => {
    const base64Data = reader.result;

    try {
      // Envio para o Apps Script
      const response = await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors', // Necessário para evitar erro de CORS
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64: base64Data,
          filename: fileName,
          mimeType: captureMode === 'foto' ? 'image/png' : 'video/webm'
        })
      });
      
      // Como estamos usando 'no-cors', não conseguimos ler a resposta real (success/error).
      // Mas se o fetch não der erro, assumimos que foi enviado.
      alert("Sucesso! Cópia salva no dispositivo e na nuvem.");

    } catch (err) {
      console.error("Erro no envio para Drive:", err);
      alert("Salvo no dispositivo, mas ocorreu um erro no envio para a nuvem. Tente novamente.");
    } finally {
      finalizeSalvar();
    }
  };
});

function finalizeSalvar() {
  btnSalvar.innerText = "Salvar";
  btnSalvar.disabled = false;
  btnRefazer.click(); // Volta para a câmera
}

// Inicialização
loadConfig().then(startCamera);
