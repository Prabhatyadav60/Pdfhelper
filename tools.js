console.log('LuminaPDF Tools v4 Loaded');

// --- GLOBAL CONFIGURATION & SETUP ---

// 1. Configure PDF.js Worker (CRITICAL for PDF to Image & Text Extraction)
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// 2. State Management for AI Context
window.pdfTextContent = null;
window.currentFileParams = null; // To track if file changed

// Listen for file changes to reset AI context
const mainFileInput = document.getElementById('fileInput');
if (mainFileInput) {
    mainFileInput.addEventListener('change', () => {
        window.pdfTextContent = null;
        window.currentFileParams = null;
        showStatus('New file selected. Context cleared.', 'info');
    });
}

// --- PDF TOOLS LOGIC ---

// 1. Merge PDF
async function mergePDFs() {
    const fileInput = document.getElementById('fileInput');
    if (!fileInput || fileInput.files.length < 2) {
        showStatus('Please select at least two PDF files.', 'error');
        return;
    }

    try {
        showStatus('Merging PDFs...', 'info');
        const pdfDoc = await PDFLib.PDFDocument.create();
        
        // Sort files if needed, currently processes in selection order
        for (let i = 0; i < fileInput.files.length; i++) {
            const file = fileInput.files[i];
            const arrayBuffer = await file.arrayBuffer();
            const srcDoc = await PDFLib.PDFDocument.load(arrayBuffer);
            const copiedPages = await pdfDoc.copyPages(srcDoc, srcDoc.getPageIndices());
            copiedPages.forEach((page) => pdfDoc.addPage(page));
        }

        const pdfBytes = await pdfDoc.save();
        downloadPDF(pdfBytes, 'merged_document.pdf');
        showStatus('PDFs merged successfully!', 'success');
    } catch (error) {
        console.error(error);
        showStatus('Error merging PDFs: ' + error.message, 'error');
    }
}

// 2. Split PDF
async function splitPDF() {
    const fileInput = document.getElementById('fileInput');
    const rangeInput = document.getElementById('splitRange');
    
    if (!fileInput || fileInput.files.length === 0) {
        showStatus('Please select a PDF file.', 'error');
        return;
    }
    if (!rangeInput || !rangeInput.value) {
        showStatus('Please enter page ranges (e.g., 1-3, 5).', 'error');
        return;
    }

    try {
        showStatus('Splitting PDF...', 'info');
        const file = fileInput.files[0];
        const arrayBuffer = await file.arrayBuffer();
        const srcDoc = await PDFLib.PDFDocument.load(arrayBuffer);
        
        const subDoc = await PDFLib.PDFDocument.create();
        const pageCount = srcDoc.getPageCount();
        const pagesToKeep = parsePageRange(rangeInput.value, pageCount);
        
        if (pagesToKeep.length === 0) {
            showStatus('Invalid page range or pages out of bounds.', 'error');
            return;
        }

        const copiedPages = await subDoc.copyPages(srcDoc, pagesToKeep);
        copiedPages.forEach((page) => subDoc.addPage(page));

        const pdfBytes = await subDoc.save();
        downloadPDF(pdfBytes, 'split_document.pdf');
        showStatus('PDF split successfully!', 'success');
    } catch (error) {
        console.error(error);
        showStatus('Error splitting PDF: ' + error.message, 'error');
    }
}

// 3. Image to PDF
async function imageToPDF() {
    const fileInput = document.getElementById('fileInput');
    if (!fileInput || fileInput.files.length === 0) {
        showStatus('Please select image files.', 'error');
        return;
    }

    try {
        showStatus('Converting images to PDF...', 'info');
        const pdfDoc = await PDFLib.PDFDocument.create();

        for (let i = 0; i < fileInput.files.length; i++) {
            const file = fileInput.files[i];
            const arrayBuffer = await file.arrayBuffer();
            let image;
            
            // Check file types carefully
            if (file.type === 'image/jpeg' || file.name.toLowerCase().endsWith('.jpg')) {
                image = await pdfDoc.embedJpg(arrayBuffer);
            } else if (file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')) {
                image = await pdfDoc.embedPng(arrayBuffer);
            } else {
                console.warn(`Skipping unsupported file: ${file.name}`);
                continue; 
            }

            const page = pdfDoc.addPage([image.width, image.height]);
            page.drawImage(image, {
                x: 0,
                y: 0,
                width: image.width,
                height: image.height,
            });
        }

        if (pdfDoc.getPageCount() === 0) {
            throw new Error('No valid images were processed.');
        }

        const pdfBytes = await pdfDoc.save();
        downloadPDF(pdfBytes, 'images_converted.pdf');
        showStatus('Converted successfully!', 'success');
    } catch (error) {
        console.error(error);
        showStatus('Error converting images: ' + error.message, 'error');
    }
}

// 4. PDF to Image
async function pdfToImage() {
    const fileInput = document.getElementById('fileInput');
    const resultContainer = document.getElementById('resultContainer');
    const imagesContainer = document.getElementById('imagesContainer');
    
    if (!fileInput || fileInput.files.length === 0) {
        showStatus('Please select a PDF file.', 'error');
        return;
    }

    try {
        showStatus('Converting PDF to images...', 'info');
        const file = fileInput.files[0];
        const arrayBuffer = await file.arrayBuffer();
        
        // Load PDF using PDF.js
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        
        if (imagesContainer) imagesContainer.innerHTML = ''; 

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 });
            
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;

            const img = document.createElement('img');
            img.src = canvas.toDataURL('image/png');
            img.style.maxWidth = '100%';
            img.style.marginBottom = '1rem';
            img.style.border = '1px solid #ddd';
            img.title = `Page ${i}`;
            
            if (imagesContainer) imagesContainer.appendChild(img);
        }

        if (resultContainer) resultContainer.style.display = 'block';
        showStatus(`Converted ${pdf.numPages} pages to images!`, 'success');
    } catch (error) {
        console.error(error);
        showStatus('Error converting PDF: ' + error.message, 'error');
    }
}

// 5. Remove Pages
async function removePages() {
    const fileInput = document.getElementById('fileInput');
    const rangeInput = document.getElementById('removeRange');

    if (!fileInput || fileInput.files.length === 0) {
        showStatus('Please select a PDF file.', 'error');
        return;
    }
    if (!rangeInput || !rangeInput.value) {
        showStatus('Please enter pages to remove.', 'error');
        return;
    }

    try {
        showStatus('Removing pages...', 'info');
        const file = fileInput.files[0];
        const arrayBuffer = await file.arrayBuffer();
        const srcDoc = await PDFLib.PDFDocument.load(arrayBuffer);
        const pageCount = srcDoc.getPageCount();
        
        const pagesToRemove = parsePageRange(rangeInput.value, pageCount);
        const pagesToKeep = [];

        for (let i = 0; i < pageCount; i++) {
            if (!pagesToRemove.includes(i)) {
                pagesToKeep.push(i);
            }
        }

        const subDoc = await PDFLib.PDFDocument.create();
        const copiedPages = await subDoc.copyPages(srcDoc, pagesToKeep);
        copiedPages.forEach((page) => subDoc.addPage(page));

        const pdfBytes = await subDoc.save();
        downloadPDF(pdfBytes, 'pages_removed.pdf');
        showStatus('Pages removed successfully!', 'success');
    } catch (error) {
        console.error(error);
        showStatus('Error removing pages: ' + error.message, 'error');
    }
}

// 6. Watermark PDF
async function addWatermark() {
    const fileInput = document.getElementById('fileInput');
    const textInput = document.getElementById('watermarkText');
    const colorInput = document.getElementById('watermarkColor');
    const opacityInput = document.getElementById('watermarkOpacity');

    if (!fileInput || fileInput.files.length === 0) {
        showStatus('Please select a PDF file.', 'error');
        return;
    }

    try {
        showStatus('Adding watermark...', 'info');
        const file = fileInput.files[0];
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
        
        // FIX: Embed the font standardly
        const helveticaFont = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
        
        const pages = pdfDoc.getPages();
        const text = textInput && textInput.value ? textInput.value : 'CONFIDENTIAL';
        const colorHex = colorInput && colorInput.value ? colorInput.value : '#FF0000';
        const opacity = opacityInput ? parseFloat(opacityInput.value) : 0.5;
        
        // Convert hex to RGB
        const r = parseInt(colorHex.substr(1,2), 16) / 255;
        const g = parseInt(colorHex.substr(3,2), 16) / 255;
        const b = parseInt(colorHex.substr(5,2), 16) / 255;

        pages.forEach(page => {
            const { width, height } = page.getSize();
            const fontSize = 50;
            const textWidth = helveticaFont.widthOfTextAtSize(text, fontSize);
            const textHeight = helveticaFont.heightAtSize(fontSize);

            page.drawText(text, {
                x: width / 2 - textWidth / 2,
                y: height / 2 - textHeight / 2,
                size: fontSize,
                font: helveticaFont, // Pass embedded font
                color: PDFLib.rgb(r, g, b),
                opacity: opacity,
                rotate: PDFLib.degrees(45),
            });
        });

        const pdfBytes = await pdfDoc.save();
        downloadPDF(pdfBytes, 'watermarked.pdf');
        showStatus('Watermark added successfully!', 'success');
    } catch (error) {
        console.error(error);
        showStatus('Error adding watermark: ' + error.message, 'error');
    }
}

// --- HELPER FUNCTIONS ---

function downloadPDF(pdfBytes, fileName) {
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link); // Required for Firefox
    link.click();
    document.body.removeChild(link);
}

function showStatus(message, type) {
    const statusDiv = document.getElementById('status');
    if (statusDiv) {
        statusDiv.textContent = message;
        statusDiv.className = type; // 'success', 'error', 'info'
        statusDiv.style.display = 'block';
        
        // Only auto-hide success messages
        if (type === 'success') {
            setTimeout(() => {
                statusDiv.style.display = 'none';
            }, 5000);
        }
    } else {
        console.log(`[${type.toUpperCase()}] ${message}`);
        if(type === 'error') alert(message);
    }
}

function parsePageRange(rangeStr, maxPages) {
    const pages = new Set();
    const parts = rangeStr.split(',');
    
    parts.forEach(part => {
        const range = part.trim().split('-');
        if (range.length === 1) {
            const val = parseInt(range[0]);
            if (!isNaN(val)) {
                const page = val - 1; // 0-indexed
                if (page >= 0 && page < maxPages) pages.add(page);
            }
        } else if (range.length === 2) {
            const startVal = parseInt(range[0]);
            const endVal = parseInt(range[1]);
            
            if (!isNaN(startVal) && !isNaN(endVal)) {
                const start = startVal - 1;
                const end = endVal - 1;
                const low = Math.min(start, end);
                const high = Math.max(start, end);

                for (let i = low; i <= high; i++) {
                    if (i >= 0 && i < maxPages) pages.add(i);
                }
            }
        }
    });
    
    return Array.from(pages).sort((a, b) => a - b);
}

// --- AI TOOLS LOGIC ---

// 1. OCR Tool (Updated for Tesseract.js v5)
async function performOCR() {
    const fileInput = document.getElementById('fileInput');
    const resultContainer = document.getElementById('resultContainer');
    const ocrResult = document.getElementById('ocrResult');
    const actionBtn = document.getElementById('actionBtn');

    if (!fileInput || fileInput.files.length === 0) {
        showStatus('Please select an image file.', 'error');
        return;
    }

    try {
        showStatus('Initializing Tesseract engine...', 'info');
        if (actionBtn) {
            actionBtn.disabled = true;
            actionBtn.textContent = 'Processing...';
        }

        const file = fileInput.files[0];
        
        // Tesseract v5 Syntax
        const worker = await Tesseract.createWorker('eng', 1, {
            logger: m => {
                if(m.status === 'recognizing text') {
                    showStatus(`Recognizing text: ${Math.round(m.progress * 100)}%`, 'info');
                }
            }
        });

        showStatus('Extracting text...', 'info');
        const { data: { text } } = await worker.recognize(file);
        
        await worker.terminate();

        if (ocrResult) ocrResult.value = text;
        if (resultContainer) resultContainer.style.display = 'block';
        showStatus('Text extracted successfully!', 'success');
    } catch (error) {
        console.error(error);
        showStatus('Error performing OCR: ' + error.message, 'error');
    } finally {
        if (actionBtn) {
            actionBtn.disabled = false;
            actionBtn.textContent = 'Extract Text';
        }
    }
}

function copyText(elementId) {
    const element = document.getElementById(elementId);
    if(element) {
        element.select();
        document.execCommand('copy'); // Fallback
        // Modern approach
        if (navigator.clipboard) {
            navigator.clipboard.writeText(element.value).then(() => {
                showStatus('Text copied to clipboard!', 'success');
            });
        } else {
             showStatus('Text copied to clipboard!', 'success');
        }
    }
}

// 2. Text to Speech Tool
let synth = window.speechSynthesis;
let voices = [];

function populateVoiceList() {
    voices = synth.getVoices();
    const voiceSelect = document.getElementById('voiceSelect');
    if (!voiceSelect) return;
    
    // Save current selection if any
    const selectedValue = voiceSelect.value;
    
    voiceSelect.innerHTML = '<option value="">Default Voice</option>';
    
    voices.forEach((voice) => {
        const option = document.createElement('option');
        option.textContent = `${voice.name} (${voice.lang})`;
        option.setAttribute('data-lang', voice.lang);
        option.setAttribute('data-name', voice.name);
        voiceSelect.appendChild(option);
    });

    // Restore selection
    if (selectedValue) voiceSelect.value = selectedValue;
}

if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = populateVoiceList;
}

function speakText() {
    const textInput = document.getElementById('ttsInput');
    const voiceSelect = document.getElementById('voiceSelect');
    
    if (!textInput || textInput.value === '') {
        showStatus('Please enter some text.', 'error');
        return;
    }

    if (synth.speaking) {
        synth.cancel(); // Stop current before starting new
    }

    const utterThis = new SpeechSynthesisUtterance(textInput.value);
    
    if (voiceSelect && voiceSelect.selectedOptions[0]) {
        const selectedOption = voiceSelect.selectedOptions[0].getAttribute('data-name');
        for (let i = 0; i < voices.length; i++) {
            if (voices[i].name === selectedOption) {
                utterThis.voice = voices[i];
                break;
            }
        }
    }
    
    showStatus('Playing audio...', 'info');
    synth.speak(utterThis);
    
    utterThis.onend = function (event) {
        showStatus('Finished playing.', 'success');
    }
    
    utterThis.onerror = function (event) {
        console.error('TTS Error', event);
        showStatus('Error playing audio.', 'error');
    }
}

function stopSpeech() {
    synth.cancel();
    showStatus('Audio stopped.', 'info');
}

// 3. Chat with PDF (Gemini AI)
async function chatWithPDF() {
    const fileInput = document.getElementById('fileInput');
    const apiKeyInput = document.getElementById('apiKey');
    const questionInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');

    if (!fileInput || !fileInput.files[0]) {
        showStatus('Please select a PDF file first.', 'error');
        return;
    }
    if (!apiKeyInput || !apiKeyInput.value.trim()) {
        showStatus('Please enter your Gemini API Key.', 'error');
        return;
    }
    if (!questionInput || !questionInput.value.trim()) {
        showStatus('Please enter a question.', 'error');
        return;
    }

    const file = fileInput.files[0];
    const apiKey = apiKeyInput.value.trim();
    const question = questionInput.value.trim();

    // Disable UI
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.textContent = 'Thinking...';
    }
    appendMessage('User', question);
    questionInput.value = '';

    try {
        // 1. Extract Text from PDF (if not already done or file changed)
        // Check if we need to re-extract (based on file name/size match)
        const currentParams = `${file.name}-${file.size}`;
        if (!window.pdfTextContent || window.currentFileParams !== currentParams) {
            showStatus('Extracting text from PDF (this happens once)...', 'info');
            window.pdfTextContent = await extractTextFromPDF(file);
            window.currentFileParams = currentParams; // Cache key
        }

        // 2. Call Gemini API
        const response = await callGeminiAPI(apiKey, window.pdfTextContent, question);
        
        appendMessage('AI', response);
        showStatus('Response received!', 'success');

    } catch (error) {
        console.error(error);
        appendMessage('System', 'Error: ' + error.message);
        showStatus('Error processing request.', 'error');
    } finally {
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Send';
        }
    }
}

async function extractTextFromPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    // Using pdfjsLib loaded globally
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        // Improved text stitching with basic space handling
        const pageText = textContent.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join('');
        fullText += `Page ${i}:\n${pageText}\n\n`;
    }
    return fullText;
}

async function callGeminiAPI(apiKey, context, question) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    // Safety truncation
    const maxContextChars = 30000;
    const truncatedContext = context.length > maxContextChars ? 
        context.substring(0, maxContextChars) + "\n...(Text truncated)..." : context;

    const prompt = `
    You are a helpful AI assistant called LuminaPDF AI. 
    Answer the user's question based ONLY on the provided PDF content below.
    If the answer is not in the context, say "I cannot find the answer in this document."
    
    PDF Content:
    ${truncatedContext}

    User Question: ${question}
    `;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [{ text: prompt }]
            }]
        })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error?.message || 'Gemini API Error');
    }
    
    if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
        return data.candidates[0].content.parts[0].text;
    } else {
        throw new Error("No response generated by AI.");
    }
}

function appendMessage(sender, text) {
    const chatOutput = document.getElementById('chatOutput');
    if (!chatOutput) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender.toLowerCase()}`;
    
    let formattedText = text;
    // Basic Markdown Formatting
    if (sender === 'AI' || sender === 'System') {
        formattedText = formattedText
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');
    }

    msgDiv.innerHTML = `<strong>${sender}:</strong> ${formattedText}`;
    chatOutput.appendChild(msgDiv);
    chatOutput.scrollTop = chatOutput.scrollHeight;
}

// 4. LinkedIn Referral Generator
async function generateLinkedInMessage() {
    const apiKeyInput = document.getElementById('apiKey');
    const jdInput = document.getElementById('jobDescription');
    const fileInput = document.getElementById('fileInput');
    const portfolioInput = document.getElementById('portfolioLink');
    const profileInput = document.getElementById('linkedinProfile');
    const resultContainer = document.getElementById('resultContainer');
    const output = document.getElementById('generatedMessage');
    const actionBtn = document.getElementById('actionBtn');

    if (!apiKeyInput.value.trim()) return showStatus('Enter API Key.', 'error');
    if (!jdInput.value.trim()) return showStatus('Enter Job Description.', 'error');
    if (!fileInput.files[0]) return showStatus('Upload Resume.', 'error');

    try {
        showStatus('Analyzing resume...', 'info');
        if (actionBtn) {
            actionBtn.disabled = true;
            actionBtn.textContent = 'Generating...';
        }

        const file = fileInput.files[0];
        const currentParams = `${file.name}-${file.size}`;
        if (!window.pdfTextContent || window.currentFileParams !== currentParams) {
            window.pdfTextContent = await extractTextFromPDF(file);
            window.currentFileParams = currentParams;
        }

        const prompt = `
        You are an expert career coach. Write a LinkedIn message.
        Context:
        - Resume: ${window.pdfTextContent.substring(0, 10000)}
        - Job Desc: ${jdInput.value.trim().substring(0, 5000)}
        - Portfolio: ${portfolioInput ? portfolioInput.value : 'N/A'}
        - My Profile Name: ${profileInput ? profileInput.value : 'Candidate'}

        Output:
        1. Connection Request (< 300 chars)
        2. Direct Message (Longer, professional)
        `;

        const response = await callGeminiAPI(apiKeyInput.value.trim(), '', prompt);
        
        if (output) output.value = response;
        if (resultContainer) resultContainer.style.display = 'block';
        showStatus('Message generated!', 'success');

    } catch (error) {
        console.error(error);
        showStatus('Error: ' + error.message, 'error');
    } finally {
        if (actionBtn) {
            actionBtn.disabled = false;
            actionBtn.textContent = 'Generate Message';
        }
    }
}

// 5. Cold Email Writer
async function generateColdEmail() {
    const apiKeyInput = document.getElementById('apiKey');
    const recipientInput = document.getElementById('recipientName');
    const companyInput = document.getElementById('companyName');
    const purposeInput = document.getElementById('emailPurpose');
    const fileInput = document.getElementById('fileInput');
    const resultContainer = document.getElementById('resultContainer');
    const output = document.getElementById('generatedEmail');
    const actionBtn = document.getElementById('actionBtn');

    if (!apiKeyInput.value.trim()) return showStatus('Enter API Key.', 'error');
    if (!purposeInput.value.trim()) return showStatus('Enter email purpose.', 'error');
    if (!fileInput.files[0]) return showStatus('Upload Resume.', 'error');

    try {
        showStatus('Writing email...', 'info');
        if (actionBtn) {
            actionBtn.disabled = true;
            actionBtn.textContent = 'Writing...';
        }

        const file = fileInput.files[0];
        const currentParams = `${file.name}-${file.size}`;
        if (!window.pdfTextContent || window.currentFileParams !== currentParams) {
            window.pdfTextContent = await extractTextFromPDF(file);
            window.currentFileParams = currentParams;
        }

        const prompt = `
        Write a cold email.
        - Recipient: ${recipientInput ? recipientInput.value : 'Hiring Manager'}
        - Company: ${companyInput ? companyInput.value : 'Target Company'}
        - Purpose: ${purposeInput.value}
        - Resume: ${window.pdfTextContent.substring(0, 10000)}

        Guidelines: Catchy subject, concise body, clear CTA.
        `;

        const response = await callGeminiAPI(apiKeyInput.value.trim(), '', prompt);
        
        if (output) output.value = response;
        if (resultContainer) resultContainer.style.display = 'block';
        showStatus('Email generated!', 'success');

    } catch (error) {
        console.error(error);
        showStatus('Error: ' + error.message, 'error');
    } finally {
        if (actionBtn) {
            actionBtn.disabled = false;
            actionBtn.textContent = 'Generate Email';
        }
    }
}